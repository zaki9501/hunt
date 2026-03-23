/**
 * TypeScript Types
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: string;
  plan: 'free' | 'pro' | 'enterprise';
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export interface Job {
  id: string;
  name: string;
  fuzzer: 'echidna' | 'medusa' | 'foundry' | 'halmos' | 'kontrol';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  cloud: boolean;
  duration?: number;
  progress?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  results?: JobResults;
  source: {
    type: 'github' | 'upload';
    repoUrl?: string;
    branch?: string;
  };
}

export interface JobResults {
  totalTests: number;
  passed: number;
  failed: number;
  coverage?: number;
  failedProperties: FailedProperty[];
}

export interface FailedProperty {
  name: string;
  reason: string;
  callSequence: string[];
  reproducer?: string;
}

export type FuzzMode = 'quick' | 'deep' | 'flow' | 'adversarial';

export interface CreateJobInput {
  name: string;
  fuzzer: string;
  fuzzMode?: FuzzMode;
  duration: number;
  cloud: boolean;
  source: {
    type: 'github' | 'upload';
    repoUrl?: string;
    branch?: string;
  };
  config?: Record<string, any>;
}

export interface APIToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}
