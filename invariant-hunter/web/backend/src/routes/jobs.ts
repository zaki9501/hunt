/**
 * Jobs Routes - Manage fuzzing jobs
 */

import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { getIo } from '../socket';
import { FuzzerRunner } from '../services/fuzzerRunner';

// Track active fuzzer runners for cancellation
const activeRunners: Map<string, FuzzerRunner> = new Map();

const router = Router();

// Job types
interface Job {
  id: string;
  userId: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  tool: 'echidna' | 'medusa' | 'foundry' | 'halmos' | 'kontrol';
  repo: string;
  branch: string;
  directory: string;
  contract: string;
  config: Record<string, any>;
  timeout: number;
  fuzzMode?: 'quick' | 'deep' | 'flow' | 'adversarial';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  logs: string;
  results?: {
    totalCalls: number;
    failedProperties: number;
    properties: Array<{
      name: string;
      status: 'passed' | 'failed';
      callSequence?: string[];
    }>;
    coverage?: number;
  };
}

// In-memory job store (replace with database)
const jobs: Map<string, Job> = new Map();

function normalizeRepoUrl(input: string): string {
  let s = String(input || '').trim();
  if (!s) return 'https://github.com/placeholder/placeholder';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

// Validation schemas
const createJobSchema = z.object({
  repo: z
    .string()
    .transform((s) => normalizeRepoUrl(s))
    .pipe(z.string().url().refine((s) => s.includes('github.com'), { message: 'Repo must be a GitHub URL' })),
  branch: z.string().default('main'),
  directory: z.string().default('.'),
  tool: z.enum(['echidna', 'medusa', 'foundry', 'halmos', 'kontrol']).default('echidna'),
  contract: z.string().default('HunterTester'),
  timeout: z.coerce.number().min(60).max(86400 * 7).default(86400), // Max 7 days; coerce so string "300" works
  fuzzMode: z.enum(['quick', 'deep', 'flow', 'adversarial']).optional(),
  config: z.record(z.any()).optional(),
  name: z.string().optional(),
});

/**
 * Create a new fuzzing job
 * POST /api/jobs
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createJobSchema.parse(req.body);
    const userId = (req as any).userId;

    const job: Job = {
      id: uuidv4(),
      userId,
      name: data.name || `job-${Date.now().toString(36)}`,
      status: 'pending',
      tool: data.tool,
      repo: data.repo,
      branch: data.branch,
      directory: data.directory,
      contract: data.contract,
      config: data.config || {},
      timeout: data.timeout,
      fuzzMode: data.fuzzMode,
      createdAt: new Date(),
      logs: '',
    };

    jobs.set(job.id, job);

    // Emit job created event (optional; don't fail create if socket isn't ready)
    try {
      getIo().emit('job:created', {
        id: job.id,
        status: job.status,
        tool: job.tool,
      });
    } catch (e) {
      console.warn('job:created emit skipped:', e);
    }

    // In production, this would add to a job queue
    // Start job immediately (no delay) so it doesn't stay stuck in "pending"
    setImmediate(() => {
      startJob(job.id).catch((err) => {
        console.error('startJob failed:', err);
        const j = jobs.get(job.id);
        if (j) {
          j.status = 'failed';
          j.logs += `\n[${new Date().toISOString()}] Error: ${String(err.message || err)}\n`;
        }
      });
    });

    res.status(201).json({
      id: job.id,
      name: job.name,
      status: job.status,
      tool: job.tool,
      repo: job.repo,
      branch: job.branch,
      contract: job.contract,
      createdAt: job.createdAt.toISOString(),
    });
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Create job error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

/**
 * List jobs for current user
 * GET /api/jobs
 */
router.get('/', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const limit = parseInt(req.query.limit as string) || 10;
  const status = req.query.status as string;

  let userJobs = Array.from(jobs.values())
    .filter(job => job.userId === userId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  if (status) {
    userJobs = userJobs.filter(job => job.status === status);
  }

  const result = userJobs.slice(0, limit).map(job => ({
    id: job.id,
    name: job.name,
    status: job.status,
    tool: job.tool,
    repo: job.repo,
    branch: job.branch,
    contract: job.contract,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    failedProperties: job.results?.failedProperties,
    totalCalls: job.results?.totalCalls,
  }));

  res.json(result);
});

/**
 * Get job details
 * GET /api/jobs/:id
 */
router.get('/:id', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.userId !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  res.json({
    id: job.id,
    name: job.name,
    status: job.status,
    tool: job.tool,
    repo: job.repo,
    branch: job.branch,
    directory: job.directory,
    contract: job.contract,
    config: job.config,
    timeout: job.timeout,
    createdAt: job.createdAt.toISOString(),
    startedAt: job.startedAt?.toISOString(),
    completedAt: job.completedAt?.toISOString(),
    results: job.results,
  });
});

/**
 * Get job logs
 * GET /api/jobs/:id/logs
 */
router.get('/:id/logs', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.userId !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const lines = (job.logs || '').split('\n').filter(Boolean);
  res.json({ logs: lines });
});

/**
 * Stop a running job
 * POST /api/jobs/:id/stop
 */
router.post('/:id/stop', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.userId !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (job.status !== 'running' && job.status !== 'pending') {
    return res.status(400).json({ error: 'Job is not running' });
  }

  job.status = 'cancelled';
  job.completedAt = new Date();
  job.logs += '\n[Job cancelled by user]\n';

  // Cancel the actual fuzzer process if running
  const runner = activeRunners.get(job.id);
  if (runner) {
    runner.cancel();
    activeRunners.delete(job.id);
  }

  try {
    getIo().to(`job:${job.id}`).emit('job:updated', {
      id: job.id,
      status: job.status,
    });
  } catch {
    /* ignore */
  }

  res.json({ message: 'Job stopped' });
});

/**
 * Delete a job
 * DELETE /api/jobs/:id
 */
router.delete('/:id', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.userId !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (job.status === 'running') {
    return res.status(400).json({ error: 'Cannot delete running job. Stop it first.' });
  }

  jobs.delete(req.params.id);
  res.status(204).send();
});

/**
 * Get job reproducers (converted test cases)
 * GET /api/jobs/:id/reproducers
 */
router.get('/:id/reproducers', (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const job = jobs.get(req.params.id);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  if (job.userId !== userId) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  if (!job.results?.properties?.some(p => p.status === 'failed')) {
    return res.status(404).json({ error: 'No failed properties to generate reproducers for' });
  }

  // Generate reproducers from failed properties
  const failedProperties = job.results.properties.filter(p => p.status === 'failed');
  
  let reproducers = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Test} from "forge-std/Test.sol";
import {TargetFunctions} from "./TargetFunctions.sol";
import {FoundryAsserts} from "invariant-hunter/HunterTester.sol";

/// @title Reproducers - Generated from job ${job.id}
/// @notice Run: forge test --match-contract Reproducers -vvvv
contract Reproducers is Test, TargetFunctions, FoundryAsserts {
    function setUp() public {
        setup();
        _initializeDefaultActors();
        _completeSetup();
    }
`;

  failedProperties.forEach((prop, i) => {
    const testName = prop.name.replace(/[^a-zA-Z0-9]/g, '_');
    reproducers += `
    /// @notice Reproducer for ${prop.name}
    function test_${testName}_${i + 1}() public {
`;
    if (prop.callSequence) {
      prop.callSequence.forEach(call => {
        reproducers += `        ${call};\n`;
      });
    }
    reproducers += `        // Broken property: ${prop.name}
    }
`;
  });

  reproducers += '}\n';

  res.type('text/plain').send(reproducers);
});

// Execute real fuzzing job
async function startJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId);
  if (!job) {
    console.warn('startJob: job not found', jobId);
    return;
  }
  if (job.status !== 'pending') {
    console.warn('startJob: job not pending', jobId, job.status);
    return;
  }

  job.status = 'running';
  job.startedAt = new Date();
  job.logs = `[${new Date().toISOString()}] Starting ${job.tool} job...\n`;
  job.logs += `Repository: ${job.repo}\n`;
  job.logs += `Branch: ${job.branch}\n`;
  job.logs += `Contract: ${job.contract}\n`;
  job.logs += `Timeout: ${job.timeout} seconds\n\n`;

  try {
    getIo().to(`job:${job.id}`).emit('job:updated', {
      id: job.id,
      status: job.status,
    });
  } catch {
    /* socket optional */
  }

  // Run real fuzzer
  const runner = new FuzzerRunner({
    id: job.id,
    tool: job.tool,
    repo: job.repo,
    branch: job.branch,
    directory: job.directory,
    contract: job.contract,
    timeout: job.timeout,
    fuzzMode: job.fuzzMode,
  });

  activeRunners.set(job.id, runner);

  const onLog = (log: string) => {
    job.logs += `${log}\n`;
    try {
      getIo().to(`job:${job.id}`).emit('job:log', { id: job.id, log });
    } catch { /* ignore */ }
  };

  const onStatus = (status: string) => {
    // Map detailed states to simple states for frontend compatibility
    if (status === 'completed' || status === 'failed') {
      job.status = status as 'completed' | 'failed';
      job.completedAt = new Date();
    } else {
      job.status = 'running';
    }
    
    // Store detailed state in logs
    job.logs += `[${new Date().toISOString()}] Status: ${status}\n`;
    
    try {
      getIo().to(`job:${job.id}`).emit('job:updated', { 
        id: job.id, 
        status: job.status,
        detailedStatus: status 
      });
    } catch { /* ignore */ }
  };

  try {
    const result = await runner.run(onLog, onStatus);
    
    job.results = {
      totalCalls: result.totalCalls,
      failedProperties: result.failedProperties,
      coverage: result.coverage,
      properties: result.properties,
    };

    job.logs += `\n[${new Date().toISOString()}] Job ${job.status}\n`;
    job.logs += `Total calls: ${result.totalCalls}\n`;
    job.logs += `Failed properties: ${result.failedProperties}\n`;

    if (result.error) {
      job.logs += `Error: ${result.error}\n`;
    }

    try {
      getIo().to(`job:${job.id}`).emit('job:updated', {
        id: job.id,
        status: job.status,
        results: job.results,
      });
    } catch { /* ignore */ }
  } finally {
    activeRunners.delete(job.id);
  }
}

export { router as jobsRouter };
