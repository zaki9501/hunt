/**
 * Cloud Worker Entry Point
 */

import 'dotenv/config';
import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { createLogger, format, transports } from 'winston';
import { JobProcessor } from './processor';
import { DockerManager } from './docker';

// Logger setup
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
    }),
  ],
});

// Redis connection
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
};

async function main() {
  logger.info('Starting Invariant Hunter Cloud Worker');

  // Initialize Docker manager
  const docker = new DockerManager(logger);
  await docker.initialize();

  // Initialize job processor
  const processor = new JobProcessor(docker, logger);

  // Create worker
  const worker = new Worker(
    'fuzzing-jobs',
    async (job) => {
      logger.info(`Processing job ${job.id}`, { name: job.name });
      
      try {
        const result = await processor.process(job.data);
        return result;
      } catch (error: any) {
        logger.error(`Job ${job.id} failed`, { error: error.message });
        throw error;
      }
    },
    {
      connection: redisConfig,
      concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
      lockDuration: 1000 * 60 * 60, // 1 hour max
    }
  );

  // Event handlers
  worker.on('completed', (job, result) => {
    logger.info(`Job ${job.id} completed`, { 
      duration: result?.duration,
      passed: result?.results?.passed,
      failed: result?.results?.failed,
    });
  });

  worker.on('failed', (job, error) => {
    logger.error(`Job ${job?.id} failed`, { error: error.message });
  });

  worker.on('progress', (job, progress) => {
    logger.debug(`Job ${job.id} progress: ${progress}%`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down worker...');
    await worker.close();
    await docker.cleanup();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Worker is ready and waiting for jobs');
}

main().catch((error) => {
  logger.error('Worker startup failed', { error: error.message });
  process.exit(1);
});
