/**
 * Job Queue Service
 * 
 * Manages fuzzing job execution using a queue-based system.
 * In production, this would use Redis and Bull for job management.
 */

import { EventEmitter } from 'events';

interface Job {
  id: string;
  userId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  tool: string;
  repo: string;
  branch: string;
  contract: string;
  config: Record<string, any>;
  timeout: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  logs: string;
  workerId?: string;
}

interface Worker {
  id: string;
  status: 'idle' | 'busy';
  currentJob?: string;
  lastHeartbeat: Date;
}

export class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private workers: Map<string, Worker> = new Map();
  private queue: string[] = [];
  private maxWorkers: number = 4;
  private processingInterval?: NodeJS.Timeout;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    // Start processing loop
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000);

    // Clean up stale workers
    setInterval(() => {
      this.cleanupStaleWorkers();
    }, 30000);

    console.log('JobQueue initialized');
  }

  async shutdown(): Promise<void> {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
  }

  /**
   * Add a job to the queue
   */
  async enqueue(job: Job): Promise<void> {
    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    this.emit('job:enqueued', job);
    console.log(`Job ${job.id} enqueued`);
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): Job | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Update job status
   */
  updateJob(jobId: string, updates: Partial<Job>): void {
    const job = this.jobs.get(jobId);
    if (job) {
      Object.assign(job, updates);
      this.emit('job:updated', job);
    }
  }

  /**
   * Append to job logs
   */
  appendLog(jobId: string, log: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.logs += log;
      this.emit('job:log', { jobId, log });
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    if (job.status === 'pending') {
      // Remove from queue
      const index = this.queue.indexOf(jobId);
      if (index > -1) {
        this.queue.splice(index, 1);
      }
      job.status = 'cancelled';
      job.completedAt = new Date();
      this.emit('job:cancelled', job);
      return true;
    }

    if (job.status === 'running') {
      // Signal worker to stop
      const worker = this.workers.get(job.workerId!);
      if (worker) {
        // In production, this would send a kill signal to the actual worker process
        job.status = 'cancelled';
        job.completedAt = new Date();
        worker.status = 'idle';
        worker.currentJob = undefined;
        this.emit('job:cancelled', job);
        return true;
      }
    }

    return false;
  }

  /**
   * Register a worker
   */
  registerWorker(workerId: string): void {
    this.workers.set(workerId, {
      id: workerId,
      status: 'idle',
      lastHeartbeat: new Date(),
    });
    console.log(`Worker ${workerId} registered`);
  }

  /**
   * Worker heartbeat
   */
  workerHeartbeat(workerId: string): void {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastHeartbeat = new Date();
    }
  }

  /**
   * Process the queue
   */
  private processQueue(): void {
    // Find available workers
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'idle');

    // Assign jobs to workers
    while (this.queue.length > 0 && availableWorkers.length > 0) {
      const jobId = this.queue.shift()!;
      const job = this.jobs.get(jobId);
      
      if (!job || job.status !== 'pending') continue;

      const worker = availableWorkers.shift()!;
      this.assignJobToWorker(job, worker);
    }
  }

  /**
   * Assign a job to a worker
   */
  private assignJobToWorker(job: Job, worker: Worker): void {
    job.status = 'running';
    job.startedAt = new Date();
    job.workerId = worker.id;

    worker.status = 'busy';
    worker.currentJob = job.id;

    this.emit('job:started', job);
    console.log(`Job ${job.id} assigned to worker ${worker.id}`);

    // Simulate job execution (in production, this would be done by actual workers)
    this.simulateJobExecution(job, worker);
  }

  /**
   * Simulate job execution for demo purposes
   */
  private async simulateJobExecution(job: Job, worker: Worker): Promise<void> {
    const steps = [
      { msg: 'Cloning repository...', duration: 2000 },
      { msg: 'Installing dependencies...', duration: 3000 },
      { msg: 'Compiling contracts...', duration: 2000 },
      { msg: `Starting ${job.tool}...`, duration: 1000 },
      { msg: 'Running invariant tests...', duration: 5000 },
      { msg: '[PASSED] invariant_example1', duration: 500 },
      { msg: '[PASSED] invariant_example2', duration: 500 },
      { msg: 'Generating report...', duration: 1000 },
    ];

    for (const step of steps) {
      if (job.status === 'cancelled') {
        this.appendLog(job.id, '[Job cancelled]\n');
        return;
      }

      await this.delay(step.duration);
      const timestamp = new Date().toISOString();
      this.appendLog(job.id, `[${timestamp}] ${step.msg}\n`);
    }

    // Complete job
    job.status = 'completed';
    job.completedAt = new Date();
    worker.status = 'idle';
    worker.currentJob = undefined;

    this.appendLog(job.id, `\n[${new Date().toISOString()}] Job completed successfully\n`);
    this.emit('job:completed', job);
    console.log(`Job ${job.id} completed`);
  }

  /**
   * Clean up workers that haven't sent heartbeat
   */
  private cleanupStaleWorkers(): void {
    const staleThreshold = 60000; // 1 minute
    const now = Date.now();

    for (const [id, worker] of this.workers) {
      if (now - worker.lastHeartbeat.getTime() > staleThreshold) {
        console.log(`Removing stale worker ${id}`);
        
        // Requeue any job the worker was processing
        if (worker.currentJob) {
          const job = this.jobs.get(worker.currentJob);
          if (job && job.status === 'running') {
            job.status = 'pending';
            job.workerId = undefined;
            this.queue.unshift(job.id);
            console.log(`Requeued job ${job.id} from stale worker`);
          }
        }

        this.workers.delete(id);
      }
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    queueLength: number;
    activeJobs: number;
    workers: number;
    idleWorkers: number;
  } {
    const activeJobs = Array.from(this.jobs.values())
      .filter(j => j.status === 'running').length;
    
    const idleWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'idle').length;

    return {
      queueLength: this.queue.length,
      activeJobs,
      workers: this.workers.size,
      idleWorkers,
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const jobQueue = new JobQueue();
