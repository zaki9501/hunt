/**
 * API Client
 */

import { Job, CreateJobInput, User, LoginInput, RegisterInput, JobResults } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function formatApiError(body: Record<string, unknown>): string {
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  if (Array.isArray(body.error)) {
    return (body.error as { path?: (string | number)[]; message?: string }[])
      .map((e) => `${(e.path || []).join('.') || 'request'}: ${e.message || 'invalid'}`)
      .join('; ');
  }
  return 'Request failed';
}

/** Normalize user-typed repo URL for the API (must be valid https GitHub URL). */
function normalizeGithubRepoUrl(url: string | undefined): string {
  let s = (url || '').trim();
  if (!s) return 'https://github.com/placeholder/placeholder';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  if (!s.includes('github.com')) return 'https://github.com/placeholder/placeholder';
  return s;
}

class ApiClient {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  loadToken() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      // Avoid 304 + empty body breaking JSON (browser revalidation)
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      const msg = formatApiError(error);
      throw new Error(msg);
    }

    return response.json();
  }

  // Auth
  async register(data: RegisterInput): Promise<{ user: User; token: string }> {
    const result = await this.request<{ user: User; token: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(result.token);
    return result;
  }

  async login(data: LoginInput): Promise<{ user: User; token: string }> {
    const result = await this.request<{ user: User; token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    this.setToken(result.token);
    return result;
  }

  async logout() {
    this.setToken(null);
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  // Jobs
  async getJobs(): Promise<Job[]> {
    const result = await this.request<Record<string, unknown>[]>('/jobs');
    return Array.isArray(result) ? result.map((j) => this.mapBackendJobToJob(j)) : [];
  }

  async getJob(id: string): Promise<Job> {
    const result = await this.request<Record<string, unknown>>(`/jobs/${id}`);
    return this.mapBackendJobToJob(result);
  }

  async createJob(data: CreateJobInput): Promise<Job> {
    const repoUrl = data.source?.type === 'github' ? data.source.repoUrl : undefined;
    const timeout = Math.min(
      86400 * 7,
      Math.max(60, Number(data.duration) || 300)
    );
    const body: Record<string, unknown> = {
      repo: normalizeGithubRepoUrl(repoUrl),
      branch: data.source?.branch || 'main',
      directory: '.',
      tool: data.fuzzer as 'echidna' | 'medusa' | 'foundry' | 'halmos' | 'kontrol',
      contract: 'HunterTester',
      timeout,
      name: data.name,
    };
    
    // Add fuzz mode for Foundry
    if (data.fuzzer === 'foundry' && data.fuzzMode) {
      body.fuzzMode = data.fuzzMode;
    }
    
    const result = await this.request<Record<string, unknown>>('/jobs', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return this.mapBackendJobToJob(result);
  }

  private mapBackendJobToJob(b: Record<string, unknown>): Job {
    const startedAt = typeof b.startedAt === 'string' ? b.startedAt : undefined;
    const completedAt = typeof b.completedAt === 'string' ? b.completedAt : undefined;
    const duration =
      startedAt && completedAt
        ? Math.round((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
        : typeof b.timeout === 'number'
          ? b.timeout
          : undefined;
    const results = this.mapBackendResultsToJobResults(b.results);
    return {
      id: String(b.id),
      name: String(b.name ?? ''),
      fuzzer: (b.tool as Job['fuzzer']) || 'echidna',
      status: (b.status as Job['status']) || 'pending',
      cloud: false,
      duration,
      createdAt: typeof b.createdAt === 'string' ? b.createdAt : new Date().toISOString(),
      startedAt,
      completedAt,
      source: {
        type: 'github',
        repoUrl: typeof b.repo === 'string' ? b.repo : undefined,
        branch: typeof b.branch === 'string' ? b.branch : undefined,
      },
      results,
    };
  }

  private mapBackendResultsToJobResults(r: unknown): JobResults | undefined {
    if (!r || typeof r !== 'object') return undefined;
    const b = r as Record<string, unknown>;
    const properties = Array.isArray(b.properties) ? b.properties : [];
    const passed = properties.filter((p: { status?: string }) => p.status === 'passed').length;
    const failed = properties.filter((p: { status?: string }) => p.status === 'failed').length;
    const failedProperties = properties
      .filter((p: { status?: string }) => p.status === 'failed')
      .map((p: { name?: string; callSequence?: string[] }) => ({
        name: String(p.name ?? ''),
        reason: '',
        callSequence: Array.isArray(p.callSequence) ? p.callSequence : [],
      }));
    return {
      totalTests: Number(b.totalCalls) || passed + failed,
      passed,
      failed,
      coverage: typeof b.coverage === 'number' ? b.coverage : undefined,
      failedProperties,
    };
  }

  async stopJob(id: string): Promise<void> {
    await this.request(`/jobs/${id}/stop`, { method: 'POST' });
  }

  async deleteJob(id: string): Promise<void> {
    await this.request(`/jobs/${id}`, { method: 'DELETE' });
  }

  async getJobLogs(id: string): Promise<string[]> {
    const result = await this.request<{ logs: string[] }>(`/jobs/${id}/logs`);
    return result.logs;
  }

  async getJobReproducers(id: string): Promise<string[]> {
    const text = await this.requestText(`/jobs/${id}/reproducers`);
    return text ? [text] : [];
  }

  private async requestText(endpoint: string): Promise<string> {
    const headers: Record<string, string> = {};
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    const response = await fetch(`${API_URL}${endpoint}`, {
      headers,
      cache: 'no-store',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return response.text();
  }

  // Tools
  async scrapeLogs(data: { type: string; logs: string }): Promise<{ reproducers: string[] }> {
    return this.request('/tools/scrape', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async compareBytecode(data: {
    bytecode1: string;
    bytecode2: string;
  }): Promise<{ identical: boolean; differences: any }> {
    return this.request('/tools/bytecode/compare', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateHandlers(data: {
    abi: any[];
    contractName: string;
  }): Promise<{ handlers: string }> {
    return this.request('/handlers/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

export const api = new ApiClient();
