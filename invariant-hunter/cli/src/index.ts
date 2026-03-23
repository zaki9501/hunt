#!/usr/bin/env node

/**
 * Invariant Hunter CLI
 * 
 * A comprehensive toolkit for invariant testing of smart contracts.
 * Similar to Recon, providing tools for:
 * - Scaffolding invariant test suites
 * - Running fuzzers (Echidna, Medusa, Foundry)
 * - Converting fuzzer logs to reproducible tests
 * - Running jobs in the cloud
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init';
import { scaffoldCommand } from './commands/scaffold';
import { runCommand } from './commands/run';
import { scrapeCommand } from './commands/scrape';
import { cloudCommand } from './commands/cloud';

const program = new Command();

// ASCII Art Banner
const banner = `
${chalk.cyan('██╗  ██╗██╗   ██╗███╗   ██╗████████╗███████╗██████╗ ')}
${chalk.cyan('██║  ██║██║   ██║████╗  ██║╚══██╔══╝██╔════╝██╔══██╗')}
${chalk.cyan('███████║██║   ██║██╔██╗ ██║   ██║   █████╗  ██████╔╝')}
${chalk.cyan('██╔══██║██║   ██║██║╚██╗██║   ██║   ██╔══╝  ██╔══██╗')}
${chalk.cyan('██║  ██║╚██████╔╝██║ ╚████║   ██║   ███████╗██║  ██║')}
${chalk.cyan('╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═══╝   ╚═╝   ╚══════╝╚═╝  ╚═╝')}
${chalk.gray('        Invariant Testing Made Easy')}
`;

program
  .name('hunter')
  .description('Invariant Hunter - Smart Contract Fuzzing Toolkit')
  .version('1.0.0')
  .hook('preAction', () => {
    console.log(banner);
  });

// Initialize a new project
program
  .command('init')
  .description('Initialize a new invariant testing project')
  .option('-n, --name <name>', 'Project name')
  .option('-t, --template <template>', 'Template to use (basic, defi, nft)', 'basic')
  .option('--no-install', 'Skip dependency installation')
  .action(initCommand);

// Scaffold handlers from contract ABI
program
  .command('scaffold')
  .description('Generate handler functions from contract ABI')
  .argument('<contract>', 'Contract name or path to ABI')
  .option('-o, --output <path>', 'Output directory', 'test/hunter')
  .option('--include-view', 'Include view functions')
  .option('--include-pure', 'Include pure functions')
  .action(scaffoldCommand);

// Run fuzzer locally
program
  .command('run')
  .description('Run invariant tests locally')
  .option('-t, --tool <tool>', 'Fuzzer to use (echidna, medusa, foundry)', 'echidna')
  .option('-c, --contract <name>', 'Target contract name', 'HunterTester')
  .option('--config <path>', 'Path to fuzzer config')
  .option('--timeout <seconds>', 'Test timeout in seconds')
  .option('--workers <n>', 'Number of workers', '4')
  .option('--corpus <path>', 'Corpus directory')
  .action(runCommand);

// Scrape fuzzer logs
program
  .command('scrape')
  .description('Convert fuzzer logs to Foundry reproducers')
  .argument('<input>', 'Log file or corpus directory')
  .option('-t, --tool <tool>', 'Source tool (echidna, medusa)', 'echidna')
  .option('-o, --output <path>', 'Output file')
  .option('--json', 'Output as JSON')
  .option('--full-contract', 'Generate complete contract')
  .action(scrapeCommand);

// Cloud job management
const cloud = program
  .command('cloud')
  .description('Manage cloud fuzzing jobs');

cloud
  .command('login')
  .description('Login to Invariant Hunter cloud')
  .option('--token <token>', 'API token')
  .action(cloudCommand.login);

cloud
  .command('run')
  .description('Run a fuzzing job in the cloud')
  .option('-r, --repo <url>', 'GitHub repository URL')
  .option('-t, --tool <tool>', 'Fuzzer to use', 'echidna')
  .option('-c, --contract <name>', 'Target contract')
  .option('--branch <branch>', 'Git branch', 'main')
  .option('--timeout <hours>', 'Job timeout in hours', '24')
  .action(cloudCommand.run);

cloud
  .command('status')
  .description('Check status of cloud jobs')
  .argument('[jobId]', 'Specific job ID to check')
  .action(cloudCommand.status);

cloud
  .command('logs')
  .description('Get logs from a cloud job')
  .argument('<jobId>', 'Job ID')
  .option('-f, --follow', 'Follow log output')
  .action(cloudCommand.logs);

cloud
  .command('stop')
  .description('Stop a running cloud job')
  .argument('<jobId>', 'Job ID')
  .action(cloudCommand.stop);

// Bytecode tools
const bytecode = program
  .command('bytecode')
  .description('Bytecode analysis tools');

bytecode
  .command('compare')
  .description('Compare bytecode of two contracts')
  .argument('<bytecode1>', 'First bytecode or address')
  .argument('<bytecode2>', 'Second bytecode or address')
  .option('--rpc <url>', 'RPC URL for fetching from chain')
  .option('--include-metadata', 'Include metadata in comparison')
  .action(async (bc1: string, bc2: string, options: any) => {
    // Implementation delegates to Python tool
    const { spawn } = await import('child_process');
    const args = ['../tools/bytecode/bytecode_compare.py', bc1, bc2];
    if (options.rpc) args.push('--rpc', options.rpc);
    if (options.includeMetadata) args.push('--include-metadata');
    
    const proc = spawn('python', args, { stdio: 'inherit' });
    proc.on('close', (code) => process.exit(code || 0));
  });

// Parse and run
program.parse();
