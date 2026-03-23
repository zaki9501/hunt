/**
 * Cloud Command - Manage cloud fuzzing jobs
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs-extra';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import inquirer from 'inquirer';

// Configuration
const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.invariant-hunter');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const API_BASE_URL = process.env.HUNTER_API_URL || 'https://api.invariant-hunter.xyz';

interface CloudConfig {
  apiToken?: string;
  apiUrl?: string;
}

interface JobInfo {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  tool: string;
  repo: string;
  branch: string;
  contract: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  failedProperties?: number;
  totalCalls?: number;
}

// API Client
class CloudClient {
  private client: AxiosInstance;

  constructor(token: string, baseUrl: string = API_BASE_URL) {
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  }

  async createJob(params: {
    repo: string;
    branch: string;
    tool: string;
    contract: string;
    timeout: number;
    config?: object;
  }): Promise<JobInfo> {
    const response = await this.client.post('/jobs', params);
    return response.data;
  }

  async getJob(jobId: string): Promise<JobInfo> {
    const response = await this.client.get(`/jobs/${jobId}`);
    return response.data;
  }

  async listJobs(limit: number = 10): Promise<JobInfo[]> {
    const response = await this.client.get('/jobs', { params: { limit } });
    return response.data;
  }

  async getJobLogs(jobId: string, follow: boolean = false): Promise<string> {
    const response = await this.client.get(`/jobs/${jobId}/logs`, {
      params: { follow },
    });
    return response.data;
  }

  async stopJob(jobId: string): Promise<void> {
    await this.client.post(`/jobs/${jobId}/stop`);
  }
}

// Helper functions
async function loadConfig(): Promise<CloudConfig> {
  try {
    if (await fs.pathExists(CONFIG_FILE)) {
      return await fs.readJSON(CONFIG_FILE);
    }
  } catch (error) {
    // Ignore errors
  }
  return {};
}

async function saveConfig(config: CloudConfig): Promise<void> {
  await fs.ensureDir(CONFIG_DIR);
  await fs.writeJSON(CONFIG_FILE, config, { spaces: 2 });
}

async function getClient(): Promise<CloudClient> {
  const config = await loadConfig();
  
  if (!config.apiToken) {
    console.log(chalk.red('Not logged in. Run "hunter cloud login" first.'));
    process.exit(1);
  }
  
  return new CloudClient(config.apiToken, config.apiUrl);
}

function formatStatus(status: string): string {
  const colors: Record<string, (s: string) => string> = {
    pending: chalk.yellow,
    running: chalk.blue,
    completed: chalk.green,
    failed: chalk.red,
    cancelled: chalk.gray,
  };
  return (colors[status] || chalk.white)(status);
}

function formatDuration(start: string, end?: string): string {
  const startTime = new Date(start).getTime();
  const endTime = end ? new Date(end).getTime() : Date.now();
  const duration = Math.floor((endTime - startTime) / 1000);
  
  if (duration < 60) return `${duration}s`;
  if (duration < 3600) return `${Math.floor(duration / 60)}m ${duration % 60}s`;
  return `${Math.floor(duration / 3600)}h ${Math.floor((duration % 3600) / 60)}m`;
}

// Command implementations
export const cloudCommand = {
  async login(options: { token?: string }): Promise<void> {
    console.log(chalk.bold('\n🔐 Login to Invariant Hunter Cloud\n'));

    let token = options.token;
    
    if (!token) {
      // Interactive login
      console.log(chalk.gray('Get your API token from: https://invariant-hunter.xyz/settings/tokens\n'));
      
      const answers = await inquirer.prompt([
        {
          type: 'password',
          name: 'token',
          message: 'API Token:',
          mask: '*',
          validate: (input: string) => input.length > 0 || 'Token is required',
        },
      ]);
      token = answers.token;
    }

    const spinner = ora('Validating token...').start();

    try {
      // Validate token by making a test request
      const client = new CloudClient(token!);
      await client.listJobs(1);
      
      // Save config
      const config = await loadConfig();
      config.apiToken = token;
      await saveConfig(config);

      spinner.succeed('Logged in successfully');
      console.log(chalk.gray(`\nConfig saved to: ${CONFIG_FILE}`));
      
    } catch (error: any) {
      spinner.fail('Login failed');
      if (error.response?.status === 401) {
        console.log(chalk.red('Invalid API token'));
      } else {
        console.log(chalk.red(error.message));
      }
      process.exit(1);
    }
  },

  async run(options: {
    repo?: string;
    tool?: string;
    contract?: string;
    branch?: string;
    timeout?: string;
  }): Promise<void> {
    console.log(chalk.bold('\n☁️  Running Cloud Fuzzing Job\n'));

    // Get parameters
    let repo = options.repo;
    let tool = options.tool || 'echidna';
    let contract = options.contract || 'HunterTester';
    let branch = options.branch || 'main';
    let timeout = parseInt(options.timeout || '24', 10);

    if (!repo) {
      // Try to detect from git
      try {
        const gitConfig = await fs.readFile('.git/config', 'utf-8');
        const urlMatch = /url = (.+github\.com.+)/.exec(gitConfig);
        if (urlMatch) {
          repo = urlMatch[1].replace(/\.git$/, '');
        }
      } catch (error) {
        // Ignore
      }

      if (!repo) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'repo',
            message: 'GitHub Repository URL:',
            validate: (input: string) => {
              if (input.includes('github.com')) return true;
              return 'Please enter a valid GitHub URL';
            },
          },
        ]);
        repo = answers.repo;
      }
    }

    const client = await getClient();
    const spinner = ora('Creating job...').start();

    try {
      const job = await client.createJob({
        repo: repo!,
        branch,
        tool,
        contract,
        timeout: timeout * 3600, // Convert to seconds
      });

      spinner.succeed(`Job created: ${job.id}`);
      console.log(chalk.gray(`\nRepository: ${repo}`));
      console.log(chalk.gray(`Branch: ${branch}`));
      console.log(chalk.gray(`Tool: ${tool}`));
      console.log(chalk.gray(`Contract: ${contract}`));
      console.log(chalk.gray(`Timeout: ${timeout} hours`));
      
      console.log(chalk.green(`\n✓ Job started successfully`));
      console.log(chalk.gray(`\nMonitor progress with:`));
      console.log(chalk.gray(`  hunter cloud status ${job.id}`));
      console.log(chalk.gray(`  hunter cloud logs ${job.id} --follow`));

    } catch (error: any) {
      spinner.fail('Failed to create job');
      console.log(chalk.red(error.response?.data?.message || error.message));
      process.exit(1);
    }
  },

  async status(jobId?: string): Promise<void> {
    console.log(chalk.bold('\n📊 Job Status\n'));

    const client = await getClient();
    const spinner = ora('Fetching jobs...').start();

    try {
      if (jobId) {
        // Get specific job
        const job = await client.getJob(jobId);
        spinner.stop();
        
        console.log(chalk.bold(`Job: ${job.id}`));
        console.log(`  Name:     ${job.name || '-'}`);
        console.log(`  Status:   ${formatStatus(job.status)}`);
        console.log(`  Tool:     ${job.tool}`);
        console.log(`  Repo:     ${job.repo}`);
        console.log(`  Branch:   ${job.branch}`);
        console.log(`  Contract: ${job.contract}`);
        console.log(`  Created:  ${new Date(job.createdAt).toLocaleString()}`);
        
        if (job.startedAt) {
          console.log(`  Duration: ${formatDuration(job.startedAt, job.completedAt)}`);
        }
        
        if (job.failedProperties !== undefined) {
          console.log(`  Failed:   ${job.failedProperties} properties`);
        }
        
        if (job.totalCalls !== undefined) {
          console.log(`  Calls:    ${job.totalCalls.toLocaleString()}`);
        }

      } else {
        // List all jobs
        const jobs = await client.listJobs(10);
        spinner.stop();

        if (jobs.length === 0) {
          console.log(chalk.gray('No jobs found'));
          return;
        }

        console.log(chalk.gray('Recent jobs:\n'));
        
        for (const job of jobs) {
          const statusStr = formatStatus(job.status.padEnd(10));
          const duration = job.startedAt ? formatDuration(job.startedAt, job.completedAt) : '-';
          console.log(`  ${chalk.bold(job.id.slice(0, 8))}  ${statusStr}  ${job.tool.padEnd(8)}  ${duration.padEnd(10)}  ${job.repo}`);
        }

        console.log(chalk.gray('\nUse "hunter cloud status <jobId>" for details'));
      }

    } catch (error: any) {
      spinner.fail('Failed to fetch status');
      console.log(chalk.red(error.response?.data?.message || error.message));
      process.exit(1);
    }
  },

  async logs(jobId: string, options: { follow?: boolean }): Promise<void> {
    console.log(chalk.bold(`\n📜 Logs for Job ${jobId}\n`));
    console.log(chalk.gray('─'.repeat(60)));

    const client = await getClient();

    try {
      if (options.follow) {
        // Stream logs
        console.log(chalk.gray('Streaming logs (Ctrl+C to stop)...\n'));
        
        let lastLength = 0;
        const poll = async () => {
          try {
            const logs = await client.getJobLogs(jobId);
            if (logs.length > lastLength) {
              process.stdout.write(logs.slice(lastLength));
              lastLength = logs.length;
            }
            
            // Check if job is still running
            const job = await client.getJob(jobId);
            if (job.status === 'running' || job.status === 'pending') {
              setTimeout(poll, 2000);
            } else {
              console.log(chalk.gray('\n─'.repeat(60)));
              console.log(chalk.gray(`Job ${job.status}`));
            }
          } catch (error) {
            // Ignore polling errors
          }
        };
        
        await poll();
        
      } else {
        // Get all logs at once
        const logs = await client.getJobLogs(jobId);
        console.log(logs);
        console.log(chalk.gray('─'.repeat(60)));
      }

    } catch (error: any) {
      console.log(chalk.red(error.response?.data?.message || error.message));
      process.exit(1);
    }
  },

  async stop(jobId: string): Promise<void> {
    console.log(chalk.bold(`\n🛑 Stopping Job ${jobId}\n`));

    const client = await getClient();
    const spinner = ora('Stopping job...').start();

    try {
      await client.stopJob(jobId);
      spinner.succeed('Job stopped');
      
    } catch (error: any) {
      spinner.fail('Failed to stop job');
      console.log(chalk.red(error.response?.data?.message || error.message));
      process.exit(1);
    }
  },
};
