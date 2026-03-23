/**
 * Job Processor for Cloud Worker
 */

import { Logger } from 'winston';
import { DockerManager, ContainerConfig, ContainerResult } from './docker';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';
import { v4 as uuid } from 'uuid';

export interface JobData {
  id: string;
  fuzzer: 'echidna' | 'medusa' | 'foundry' | 'halmos';
  duration: number;
  source: {
    type: 'github' | 'upload';
    repoUrl?: string;
    branch?: string;
    uploadPath?: string;
  };
  config?: {
    contract?: string;
    testLimit?: number;
    configFile?: string;
  };
  callbackUrl?: string;
}

export interface JobResult {
  status: 'completed' | 'failed';
  duration: number;
  results?: {
    totalTests: number;
    passed: number;
    failed: number;
    coverage?: number;
    failedProperties: FailedProperty[];
  };
  logs: string[];
  reproducers?: string[];
  error?: string;
}

export interface FailedProperty {
  name: string;
  reason: string;
  callSequence: string[];
  reproducer?: string;
}

export class JobProcessor {
  private docker: DockerManager;
  private logger: Logger;
  private workDir: string;

  constructor(docker: DockerManager, logger: Logger) {
    this.docker = docker;
    this.logger = logger;
    this.workDir = process.env.WORK_DIR || '/tmp/invariant-hunter';
  }

  async process(jobData: JobData): Promise<JobResult> {
    const jobDir = path.join(this.workDir, 'jobs', jobData.id);
    
    try {
      // Setup project
      await fs.mkdir(jobDir, { recursive: true });
      const projectPath = await this.setupProject(jobData, jobDir);

      // Run fuzzer in container
      const containerConfig: ContainerConfig = {
        fuzzer: jobData.fuzzer,
        projectPath,
        duration: jobData.duration,
        contract: jobData.config?.contract,
        testLimit: jobData.config?.testLimit,
        configFile: jobData.config?.configFile,
      };

      const containerResult = await this.docker.runContainer(containerConfig);

      // Parse results
      const result = await this.parseResults(jobData.fuzzer, containerResult);

      // Send callback if configured
      if (jobData.callbackUrl) {
        await this.sendCallback(jobData.callbackUrl, result);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Job ${jobData.id} failed`, { error: error.message });
      
      const failedResult: JobResult = {
        status: 'failed',
        duration: 0,
        logs: [],
        error: error.message,
      };

      if (jobData.callbackUrl) {
        await this.sendCallback(jobData.callbackUrl, failedResult);
      }

      throw error;
    } finally {
      // Cleanup
      try {
        await fs.rm(jobDir, { recursive: true, force: true });
      } catch {}
    }
  }

  private async setupProject(jobData: JobData, jobDir: string): Promise<string> {
    const projectPath = path.join(jobDir, 'project');
    await fs.mkdir(projectPath, { recursive: true });

    if (jobData.source.type === 'github' && jobData.source.repoUrl) {
      // Clone from GitHub
      const git: SimpleGit = simpleGit();
      
      this.logger.info(`Cloning repository: ${jobData.source.repoUrl}`);
      
      await git.clone(jobData.source.repoUrl, projectPath, {
        '--branch': jobData.source.branch || 'main',
        '--depth': '1',
      });
    } else if (jobData.source.type === 'upload' && jobData.source.uploadPath) {
      // Copy uploaded files
      await this.copyDir(jobData.source.uploadPath, projectPath);
    }

    // Install dependencies if needed
    await this.installDependencies(projectPath);

    return projectPath;
  }

  private async installDependencies(projectPath: string): Promise<void> {
    // Check for foundry.toml
    const foundryToml = path.join(projectPath, 'foundry.toml');
    if (await this.fileExists(foundryToml)) {
      this.logger.info('Installing Foundry dependencies...');
      // Foundry deps will be installed in container
    }

    // Check for package.json (Hardhat)
    const packageJson = path.join(projectPath, 'package.json');
    if (await this.fileExists(packageJson)) {
      this.logger.info('Node.js project detected');
      // Could run npm install here if needed
    }
  }

  private async parseResults(
    fuzzer: string, 
    containerResult: ContainerResult
  ): Promise<JobResult> {
    const logs = containerResult.logs;
    
    // Base result
    const result: JobResult = {
      status: containerResult.exitCode === 0 ? 'completed' : 'failed',
      duration: containerResult.duration,
      logs,
      results: {
        totalTests: 0,
        passed: 0,
        failed: 0,
        failedProperties: [],
      },
    };

    // Parse fuzzer-specific output
    switch (fuzzer) {
      case 'echidna':
        this.parseEchidnaOutput(logs, result);
        break;
      case 'medusa':
        this.parseMedusaOutput(logs, result);
        break;
      case 'foundry':
        this.parseFoundryOutput(logs, result);
        break;
    }

    // Generate reproducers for failed properties
    if (result.results && result.results.failedProperties.length > 0) {
      result.reproducers = this.generateReproducers(result.results.failedProperties);
    }

    return result;
  }

  private parseEchidnaOutput(logs: string[], result: JobResult): void {
    const results = result.results!;
    
    for (const line of logs) {
      // Count tests
      const testMatch = line.match(/(\d+) tests/);
      if (testMatch) {
        results.totalTests = parseInt(testMatch[1]);
      }

      // Check for passed properties
      if (line.includes('passed')) {
        const passedMatch = line.match(/(\w+):\s*passed/);
        if (passedMatch) {
          results.passed++;
        }
      }

      // Check for failed properties
      if (line.includes('FAILED') || line.includes('falsified')) {
        const failedMatch = line.match(/(\w+):\s*(?:FAILED|falsified)/);
        if (failedMatch) {
          results.failed++;
          results.failedProperties.push({
            name: failedMatch[1],
            reason: 'Property falsified',
            callSequence: this.extractCallSequence(logs, failedMatch[1]),
          });
        }
      }
    }
  }

  private parseMedusaOutput(logs: string[], result: JobResult): void {
    const results = result.results!;
    
    for (const line of logs) {
      // Property test results
      if (line.includes('[PASSED]')) {
        results.passed++;
        results.totalTests++;
      } else if (line.includes('[FAILED]')) {
        results.failed++;
        results.totalTests++;
        
        const match = line.match(/\[FAILED\]\s*(\w+)/);
        if (match) {
          results.failedProperties.push({
            name: match[1],
            reason: 'Property failed',
            callSequence: this.extractCallSequence(logs, match[1]),
          });
        }
      }

      // Coverage
      const coverageMatch = line.match(/Coverage:\s*(\d+(?:\.\d+)?)/);
      if (coverageMatch) {
        results.coverage = parseFloat(coverageMatch[1]);
      }
    }
  }

  private parseFoundryOutput(logs: string[], result: JobResult): void {
    const results = result.results!;
    
    for (const line of logs) {
      // Test results
      if (line.includes('[PASS]')) {
        results.passed++;
        results.totalTests++;
      } else if (line.includes('[FAIL]')) {
        results.failed++;
        results.totalTests++;
        
        const match = line.match(/\[FAIL\].*?(\w+)\(/);
        if (match) {
          results.failedProperties.push({
            name: match[1],
            reason: this.extractFailReason(logs, match[1]),
            callSequence: [],
          });
        }
      }
    }
  }

  private extractCallSequence(logs: string[], propertyName: string): string[] {
    const sequence: string[] = [];
    let inSequence = false;

    for (const line of logs) {
      if (line.includes(propertyName) && (line.includes('Call sequence') || line.includes('Shrunk'))) {
        inSequence = true;
        continue;
      }

      if (inSequence) {
        if (line.trim().startsWith('*') || line.match(/^\d+\./)) {
          sequence.push(line.trim());
        } else if (line.trim() === '' && sequence.length > 0) {
          break;
        }
      }
    }

    return sequence;
  }

  private extractFailReason(logs: string[], testName: string): string {
    for (let i = 0; i < logs.length; i++) {
      if (logs[i].includes(testName) && logs[i].includes('[FAIL]')) {
        // Look for assertion or revert reason in following lines
        for (let j = i + 1; j < Math.min(i + 10, logs.length); j++) {
          if (logs[j].includes('assertion') || logs[j].includes('revert')) {
            return logs[j].trim();
          }
        }
      }
    }
    return 'Test failed';
  }

  private generateReproducers(failedProperties: FailedProperty[]): string[] {
    return failedProperties.map((prop, index) => {
      const calls = prop.callSequence.map(call => {
        // Clean up call sequence format
        const cleaned = call.replace(/^\*\s*/, '').replace(/^\d+\.\s*/, '');
        return `        ${cleaned};`;
      }).join('\n');

      return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";

/**
 * @title Reproducer for failed property: ${prop.name}
 * @notice ${prop.reason}
 */
contract Reproducer${index + 1} is Test {
    function test_reproducer_${prop.name}() public {
${calls || '        // Call sequence not available'}
    }
}`;
    });
  }

  private async sendCallback(url: string, result: JobResult): Promise<void> {
    try {
      await axios.post(url, result, {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' },
      });
      this.logger.info('Callback sent successfully');
    } catch (error: any) {
      this.logger.warn(`Failed to send callback: ${error.message}`);
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async copyDir(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}
