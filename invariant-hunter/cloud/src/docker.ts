/**
 * Docker Manager for Cloud Worker
 */

import Docker from 'dockerode';
import { Logger } from 'winston';
import { v4 as uuid } from 'uuid';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as tar from 'tar';

// Docker images for each fuzzer
const FUZZER_IMAGES: Record<string, string> = {
  echidna: 'ghcr.io/crytic/echidna:latest',
  medusa: 'ghcr.io/crytic/medusa:latest',
  foundry: 'ghcr.io/foundry-rs/foundry:latest',
  halmos: 'ghcr.io/a16z/halmos:latest',
};

export interface ContainerConfig {
  fuzzer: string;
  projectPath: string;
  configFile?: string;
  duration: number;
  contract?: string;
  testLimit?: number;
}

export interface ContainerResult {
  exitCode: number;
  logs: string[];
  duration: number;
  outputPath?: string;
}

export class DockerManager {
  private docker: Docker;
  private logger: Logger;
  private activeContainers: Map<string, Docker.Container> = new Map();
  private workDir: string;

  constructor(logger: Logger) {
    this.docker = new Docker({
      socketPath: process.platform === 'win32' 
        ? '//./pipe/docker_engine' 
        : '/var/run/docker.sock',
    });
    this.logger = logger;
    this.workDir = process.env.WORK_DIR || '/tmp/invariant-hunter';
  }

  async initialize(): Promise<void> {
    // Ensure work directory exists
    await fs.mkdir(this.workDir, { recursive: true });

    // Pull required images
    this.logger.info('Pulling fuzzer images...');
    
    for (const [name, image] of Object.entries(FUZZER_IMAGES)) {
      try {
        await this.pullImage(image);
        this.logger.info(`Pulled ${name} image`);
      } catch (error: any) {
        this.logger.warn(`Failed to pull ${name} image: ${error.message}`);
      }
    }
  }

  private async pullImage(image: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(image, (err: any, stream: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(stream, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
  }

  async runContainer(config: ContainerConfig): Promise<ContainerResult> {
    const containerId = uuid();
    const containerWorkDir = path.join(this.workDir, containerId);
    const outputDir = path.join(containerWorkDir, 'output');

    await fs.mkdir(containerWorkDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });

    // Copy project to container work dir
    await this.copyProject(config.projectPath, containerWorkDir);

    const image = FUZZER_IMAGES[config.fuzzer];
    if (!image) {
      throw new Error(`Unknown fuzzer: ${config.fuzzer}`);
    }

    const cmd = this.buildCommand(config);
    
    this.logger.info(`Creating container`, { 
      fuzzer: config.fuzzer,
      cmd: cmd.join(' '),
    });

    const container = await this.docker.createContainer({
      Image: image,
      Cmd: cmd,
      WorkingDir: '/project',
      HostConfig: {
        Binds: [
          `${containerWorkDir}:/project`,
          `${outputDir}:/output`,
        ],
        Memory: 4 * 1024 * 1024 * 1024, // 4GB
        MemorySwap: 8 * 1024 * 1024 * 1024, // 8GB
        NanoCpus: 2 * 1e9, // 2 CPUs
        AutoRemove: false,
      },
      NetworkDisabled: true, // Security: no network access
    });

    this.activeContainers.set(containerId, container);
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      // Start container
      await container.start();
      this.logger.info(`Container started: ${containerId}`);

      // Attach to logs
      const logStream = await container.logs({
        follow: true,
        stdout: true,
        stderr: true,
      });

      logStream.on('data', (chunk: Buffer) => {
        const line = chunk.toString().trim();
        if (line) {
          logs.push(line);
        }
      });

      // Wait with timeout
      const timeout = (config.duration + 60) * 1000; // Add 60s buffer
      const result = await Promise.race([
        container.wait(),
        new Promise<{ StatusCode: number }>((_, reject) => 
          setTimeout(() => reject(new Error('Container timeout')), timeout)
        ),
      ]);

      const duration = Math.floor((Date.now() - startTime) / 1000);

      return {
        exitCode: result.StatusCode,
        logs,
        duration,
        outputPath: outputDir,
      };
    } catch (error: any) {
      // Kill container on timeout
      try {
        await container.kill();
      } catch {}
      
      throw error;
    } finally {
      // Cleanup container
      this.activeContainers.delete(containerId);
      try {
        await container.remove({ force: true });
      } catch {}
    }
  }

  async stopContainer(containerId: string): Promise<void> {
    const container = this.activeContainers.get(containerId);
    if (container) {
      await container.kill();
      this.activeContainers.delete(containerId);
    }
  }

  async cleanup(): Promise<void> {
    // Stop all active containers
    for (const [id, container] of this.activeContainers) {
      try {
        await container.kill();
        await container.remove({ force: true });
        this.logger.info(`Cleaned up container: ${id}`);
      } catch {}
    }
    this.activeContainers.clear();
  }

  private buildCommand(config: ContainerConfig): string[] {
    switch (config.fuzzer) {
      case 'echidna':
        return [
          'echidna',
          '.',
          '--config', config.configFile || 'echidna.yaml',
          '--test-limit', String(config.testLimit || 50000),
          '--timeout', String(config.duration),
          '--format', 'text',
        ];

      case 'medusa':
        return [
          'medusa', 'fuzz',
          '--config', config.configFile || 'medusa.json',
          '--timeout', String(config.duration),
        ];

      case 'foundry':
        return [
          'forge', 'test',
          '--match-contract', config.contract || 'Test',
          '-vvv',
          '--fuzz-runs', String(config.testLimit || 10000),
        ];

      case 'halmos':
        return [
          'halmos',
          '--contract', config.contract || 'Test',
          '--timeout', String(config.duration),
        ];

      default:
        throw new Error(`Unknown fuzzer: ${config.fuzzer}`);
    }
  }

  private async copyProject(src: string, dest: string): Promise<void> {
    // If src is a tar archive, extract it
    if (src.endsWith('.tar.gz') || src.endsWith('.tgz')) {
      await tar.x({
        file: src,
        cwd: dest,
      });
    } else {
      // Copy directory recursively
      const files = await fs.readdir(src, { withFileTypes: true });
      
      for (const file of files) {
        const srcPath = path.join(src, file.name);
        const destPath = path.join(dest, file.name);
        
        if (file.isDirectory()) {
          await fs.mkdir(destPath, { recursive: true });
          await this.copyProject(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
      }
    }
  }
}
