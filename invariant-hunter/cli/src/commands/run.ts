/**
 * Run Command - Execute fuzzers locally
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

interface RunOptions {
  tool?: string;
  contract?: string;
  config?: string;
  timeout?: string;
  workers?: string;
  corpus?: string;
}

const TOOL_CONFIGS: Record<string, ToolConfig> = {
  echidna: {
    command: 'echidna',
    defaultConfig: 'echidna.yaml',
    buildArgs: (options: RunOptions) => {
      const args = ['.', '--contract', options.contract || 'HunterTester'];
      if (options.config) args.push('--config', options.config);
      else if (fs.existsSync('echidna.yaml')) args.push('--config', 'echidna.yaml');
      if (options.workers) args.push('--workers', options.workers);
      if (options.corpus) args.push('--corpus-dir', options.corpus);
      if (options.timeout) args.push('--test-limit', options.timeout);
      return args;
    },
  },
  medusa: {
    command: 'medusa',
    defaultConfig: 'medusa.json',
    buildArgs: (options: RunOptions) => {
      const args = ['fuzz'];
      if (options.config) args.push('--config', options.config);
      if (options.timeout) args.push('--timeout', options.timeout);
      if (options.workers) args.push('--workers', options.workers);
      if (options.corpus) args.push('--corpus-dir', options.corpus);
      return args;
    },
  },
  foundry: {
    command: 'forge',
    defaultConfig: 'foundry.toml',
    buildArgs: (options: RunOptions) => {
      const args = ['test', '--match-contract', options.contract || 'HunterToFoundry', '-vvv'];
      if (options.config) args.push('--config-path', options.config);
      return args;
    },
  },
};

interface ToolConfig {
  command: string;
  defaultConfig: string;
  buildArgs: (options: RunOptions) => string[];
}

export async function runCommand(options: RunOptions): Promise<void> {
  const tool = options.tool || 'echidna';
  
  console.log(chalk.bold(`\n🚀 Running ${tool.charAt(0).toUpperCase() + tool.slice(1)}\n`));

  // Validate tool
  if (!TOOL_CONFIGS[tool]) {
    console.log(chalk.red(`Unknown tool: ${tool}`));
    console.log(chalk.gray(`Available tools: ${Object.keys(TOOL_CONFIGS).join(', ')}`));
    process.exit(1);
  }

  const config = TOOL_CONFIGS[tool];

  // Check if tool is installed
  const spinner = ora(`Checking ${tool} installation...`).start();
  
  const isInstalled = await checkToolInstalled(config.command);
  if (!isInstalled) {
    spinner.fail(`${tool} is not installed`);
    console.log(chalk.gray(`\nInstall ${tool}:`));
    if (tool === 'echidna') {
      console.log(chalk.gray('  pip install crytic-compile slither-analyzer'));
      console.log(chalk.gray('  Download from: https://github.com/crytic/echidna/releases'));
    } else if (tool === 'medusa') {
      console.log(chalk.gray('  Download from: https://github.com/crytic/medusa/releases'));
    } else {
      console.log(chalk.gray('  curl -L https://foundry.paradigm.xyz | bash'));
      console.log(chalk.gray('  foundryup'));
    }
    process.exit(1);
  }
  spinner.succeed(`${tool} found`);

  // Build project first
  spinner.start('Building project...');
  try {
    await runProcess('forge', ['build']);
    spinner.succeed('Project built');
  } catch (error) {
    spinner.fail('Build failed');
    console.error(chalk.red(error));
    process.exit(1);
  }

  // Run the fuzzer
  const args = config.buildArgs(options);
  console.log(chalk.gray(`\n$ ${config.command} ${args.join(' ')}\n`));
  console.log(chalk.gray('─'.repeat(60)));

  const proc = spawn(config.command, args, {
    stdio: 'inherit',
    cwd: process.cwd(),
  });

  // Handle signals
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n\nInterrupted. Stopping fuzzer...'));
    proc.kill('SIGINT');
  });

  proc.on('close', (code) => {
    console.log(chalk.gray('─'.repeat(60)));
    if (code === 0) {
      console.log(chalk.green('\n✓ Fuzzing completed successfully'));
    } else {
      console.log(chalk.red(`\n✗ Fuzzer exited with code ${code}`));
      
      // Check for failed properties
      if (tool === 'echidna' || tool === 'medusa') {
        console.log(chalk.yellow('\nTo generate reproducers from the logs:'));
        console.log(chalk.gray(`  hunter scrape <logfile> --tool ${tool}`));
      }
    }
    process.exit(code || 0);
  });
}

async function checkToolInstalled(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(command, ['--version'], { stdio: 'pipe' });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

function runProcess(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'pipe' });
    let stderr = '';
    proc.stderr?.on('data', (data) => { stderr += data; });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `Process exited with code ${code}`));
    });
    proc.on('error', reject);
  });
}
