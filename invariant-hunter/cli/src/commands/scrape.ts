/**
 * Scrape Command - Convert fuzzer logs to Foundry reproducers
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';

interface ScrapeOptions {
  tool?: string;
  output?: string;
  json?: boolean;
  fullContract?: boolean;
}

export async function scrapeCommand(
  input: string,
  options: ScrapeOptions
): Promise<void> {
  const tool = options.tool || 'echidna';
  
  console.log(chalk.bold(`\n🔍 Scraping ${tool} Logs\n`));

  // Validate input
  if (!await fs.pathExists(input)) {
    console.log(chalk.red(`Input not found: ${input}`));
    process.exit(1);
  }

  const spinner = ora('Processing logs...').start();

  try {
    // Determine scraper to use
    const scriptsDir = path.join(__dirname, '../../..', 'tools/scrapers');
    let scraperScript: string;
    
    if (tool === 'echidna') {
      scraperScript = path.join(scriptsDir, 'echidna_scraper.py');
    } else if (tool === 'medusa') {
      scraperScript = path.join(scriptsDir, 'medusa_scraper.py');
    } else {
      spinner.fail(`Unknown tool: ${tool}`);
      process.exit(1);
    }

    // Check if Python script exists
    if (!await fs.pathExists(scraperScript)) {
      // Fall back to inline implementation
      spinner.text = 'Using inline scraper...';
      const result = await inlineScrape(input, tool, options);
      
      if (options.output) {
        await fs.writeFile(options.output, result);
        spinner.succeed(`Output written to ${options.output}`);
      } else {
        spinner.succeed('Logs processed');
        console.log('\n' + result);
      }
      return;
    }

    // Build arguments for Python scraper
    const args = [scraperScript, input];
    if (options.output) args.push('--output', options.output);
    if (options.json) args.push('--json');
    if (options.fullContract) args.push('--full-contract');

    // Run Python scraper
    const proc = spawn('python', args, {
      stdio: options.output ? 'inherit' : 'pipe',
    });

    let output = '';
    if (!options.output) {
      proc.stdout?.on('data', (data) => { output += data; });
    }

    proc.on('close', (code) => {
      if (code === 0) {
        spinner.succeed('Logs processed successfully');
        if (!options.output && output) {
          console.log('\n' + output);
        }
        console.log(chalk.green('\n✓ Reproducers generated'));
        if (options.output) {
          console.log(chalk.gray(`\nNext steps:`));
          console.log(chalk.gray(`  1. Review generated tests in ${options.output}`));
          console.log(chalk.gray(`  2. Run: forge test --match-contract Reproducer -vvvv`));
        }
      } else {
        spinner.fail('Failed to process logs');
        process.exit(code || 1);
      }
    });

    proc.on('error', (err) => {
      spinner.fail(`Failed to run scraper: ${err.message}`);
      console.log(chalk.gray('\nMake sure Python is installed and in your PATH'));
      process.exit(1);
    });

  } catch (error) {
    spinner.fail('Failed to scrape logs');
    console.error(chalk.red(error));
    process.exit(1);
  }
}

/**
 * Inline scraper implementation as fallback
 */
async function inlineScrape(
  input: string,
  tool: string,
  options: ScrapeOptions
): Promise<string> {
  const content = await fs.readFile(input, 'utf-8');
  const lines = content.split('\n');

  interface FailedProperty {
    name: string;
    calls: string[];
  }

  const failedProperties: FailedProperty[] = [];
  let current: FailedProperty | null = null;
  let inSequence = false;

  // Simple regex patterns
  const failedPattern = /\[FAILED\].*?(\w+)\.(\w+)\(/;
  const callPattern = /(\w+)\((.*?)\)/;
  const sequenceStart = /Call sequence/i;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check for failed property
    const failedMatch = failedPattern.exec(trimmed);
    if (failedMatch) {
      current = {
        name: `${failedMatch[1]}.${failedMatch[2]}`,
        calls: [],
      };
      failedProperties.push(current);
      continue;
    }

    // Check for sequence start
    if (sequenceStart.test(trimmed)) {
      inSequence = true;
      if (current) current.calls = [];
      continue;
    }

    // Parse calls in sequence
    if (inSequence && current) {
      const callMatch = callPattern.exec(trimmed);
      if (callMatch) {
        current.calls.push(`${callMatch[1]}(${callMatch[2]})`);
      } else if (trimmed.startsWith('[') || trimmed === '') {
        inSequence = false;
      }
    }
  }

  // Generate output
  if (options.json) {
    return JSON.stringify(failedProperties, null, 2);
  }

  // Generate Solidity tests
  let output = '';
  
  if (options.fullContract) {
    output = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {TargetFunctions} from "./TargetFunctions.sol";
import {FoundryAsserts} from "invariant-hunter/HunterTester.sol";

contract ReproducerTests is Test, TargetFunctions, FoundryAsserts {
    function setUp() public {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }
`;
  }

  for (let i = 0; i < failedProperties.length; i++) {
    const prop = failedProperties[i];
    const testName = prop.name.replace(/[^a-zA-Z0-9]/g, '_');
    
    output += `
    /// @notice Reproducer for ${prop.name}
    function test_reproducer_${testName}_${i + 1}() public {
`;
    
    for (const call of prop.calls) {
      output += `        ${call};\n`;
    }
    
    const propFunc = prop.name.split('.').pop();
    output += `        // Check the broken property
        ${propFunc}();
    }
`;
  }

  if (options.fullContract) {
    output += '}\n';
  }

  return output;
}
