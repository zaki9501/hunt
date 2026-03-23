/**
 * Job Detail Page
 */

import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle,
  Download,
  RefreshCw,
  StopCircle,
  Terminal,
  FileCode,
  AlertTriangle
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { LogViewer } from '../../components/LogViewer';

type Tab = 'overview' | 'logs' | 'reproducers' | 'coverage';

function getStatusBadgeClass(color: string): string {
  const classes: Record<string, string> = {
    yellow: 'flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-yellow-900/30 text-yellow-400',
    blue: 'flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-blue-900/30 text-blue-400',
    green: 'flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-green-900/30 text-green-400',
    red: 'flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-red-900/30 text-red-400',
    gray: 'flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-gray-900/30 text-gray-400',
  };
  return classes[color] ?? classes.gray;
}

export default function JobDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: job, isLoading, refetch } = useQuery({
    queryKey: ['job', id],
    queryFn: () => api.getJob(id as string),
    enabled: !!id,
    refetchInterval: (query) => 
      query.state.data?.status === 'running' || query.state.data?.status === 'pending' ? 3000 : false,
  });

  const { data: logs } = useQuery({
    queryKey: ['job-logs', id],
    queryFn: () => api.getJobLogs(id as string),
    enabled: !!id && activeTab === 'logs',
    refetchInterval: job?.status === 'running' ? 5000 : false,
  });

  const { data: reproducers } = useQuery({
    queryKey: ['job-reproducers', id],
    queryFn: () => api.getJobReproducers(id as string),
    enabled: !!id && activeTab === 'reproducers',
  });

  const handleStop = async () => {
    if (confirm('Are you sure you want to stop this job?')) {
      await api.stopJob(id as string);
      refetch();
    }
  };

  if (isLoading || !job) {
    return (
      <Layout>
        <div className="text-gray-400 text-center py-12">Loading...</div>
      </Layout>
    );
  }

  const statusConfig = {
    pending: { icon: Clock, color: 'yellow', label: 'Pending' },
    running: { icon: Play, color: 'blue', label: 'Running' },
    completed: { icon: CheckCircle, color: 'green', label: 'Completed' },
    failed: { icon: XCircle, color: 'red', label: 'Failed' },
    cancelled: { icon: AlertTriangle, color: 'gray', label: 'Cancelled' },
  };

  const status = statusConfig[job.status];
  const StatusIcon = status.icon;
  const statusBadgeClass = getStatusBadgeClass(status.color);

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back button */}
        <button
          onClick={() => router.push('/jobs')}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition"
        >
          <ArrowLeft size={20} />
          Back to Jobs
        </button>

        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">{job.name}</h1>
              <span className={statusBadgeClass}>
                <StatusIcon size={14} />
                {status.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="capitalize">{job.fuzzer}</span>
              <span>•</span>
              <span>Created {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}</span>
              {job.cloud && (
                <>
                  <span>•</span>
                  <span className="text-cyan-400">Cloud</span>
                </>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {job.status === 'running' && (
              <button
                onClick={handleStop}
                className="flex items-center gap-2 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition"
              >
                <StopCircle size={18} />
                Stop
              </button>
            )}
            {job.status === 'completed' && (
              <button
                className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
              >
                <Download size={18} />
                Download Results
              </button>
            )}
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>

        {/* Progress bar for running jobs */}
        {job.status === 'running' && job.progress !== undefined && (
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>Progress</span>
              <span>{job.progress}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-cyan-500 transition-all duration-500"
                style={{ width: `${job.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-700">
          <nav className="flex gap-6">
            {[
              { id: 'overview', label: 'Overview' },
              { id: 'logs', label: 'Logs', icon: Terminal },
              { id: 'reproducers', label: 'Reproducers', icon: FileCode },
              { id: 'coverage', label: 'Coverage' },
            ].map(tab => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as Tab)}
                  className={`flex items-center gap-2 py-3 border-b-2 transition ${
                    activeTab === tab.id
                      ? 'border-cyan-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  {TabIcon && <TabIcon size={16} />}
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="bg-gray-800 rounded-lg p-6">
          {activeTab === 'overview' && (
            <JobOverview job={job} />
          )}

          {activeTab === 'logs' && (
            <LogViewer logs={logs || []} />
          )}

          {activeTab === 'reproducers' && (
            <ReproducersView reproducers={reproducers || []} />
          )}

          {activeTab === 'coverage' && (
            <div className="text-gray-400 text-center py-8">
              Coverage data not available yet
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function JobOverview({ job }: { job: any }) {
  return (
    <div className="space-y-6">
      {/* Config */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Configuration</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Fuzzer</p>
            <p className="text-white capitalize">{job.fuzzer}</p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Duration</p>
            <p className="text-white">{job.duration ? `${Math.floor(job.duration / 60)} minutes` : 'N/A'}</p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Source</p>
            <p className="text-white capitalize">{job.source.type}</p>
          </div>
          <div className="bg-gray-700/50 rounded-lg p-4">
            <p className="text-gray-400 text-sm">Execution</p>
            <p className="text-white">{job.cloud ? 'Cloud' : 'Local'}</p>
          </div>
        </div>
      </div>

      {/* Results */}
      {job.results && (
        <div>
          <h3 className="text-lg font-medium text-white mb-4">Results</h3>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-white">{job.results.totalTests}</p>
              <p className="text-gray-400 text-sm">Total Tests</p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-green-400">{job.results.passed}</p>
              <p className="text-gray-400 text-sm">Passed</p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-red-400">{job.results.failed}</p>
              <p className="text-gray-400 text-sm">Failed</p>
            </div>
            <div className="bg-gray-700/50 rounded-lg p-4 text-center">
              <p className="text-3xl font-bold text-cyan-400">{job.results.coverage || 'N/A'}%</p>
              <p className="text-gray-400 text-sm">Coverage</p>
            </div>
          </div>

          {/* Failed Properties */}
          {job.results.failedProperties?.length > 0 && (
            <div className="mt-4">
              <h4 className="text-white font-medium mb-2">Failed Properties</h4>
              <div className="space-y-2">
                {job.results.failedProperties.map((prop: any, i: number) => (
                  <div key={i} className="bg-red-900/20 border border-red-800 rounded-lg p-3">
                    <p className="text-red-400 font-medium">{prop.name}</p>
                    <p className="text-gray-400 text-sm">{prop.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error */}
      {job.error && (
        <div>
          <h3 className="text-lg font-medium text-white mb-4">Error</h3>
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
            <p className="text-red-400 font-mono text-sm whitespace-pre-wrap">{job.error}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ReproducersView({ reproducers }: { reproducers: string[] }) {
  if (reproducers.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">
        No reproducers generated yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reproducers.map((reproducer, i) => (
        <div key={i} className="bg-gray-900 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-700/50">
            <span className="text-white text-sm">reproducer_{i + 1}.sol</span>
            <button
              onClick={() => navigator.clipboard.writeText(reproducer)}
              className="text-gray-400 hover:text-white text-sm"
            >
              Copy
            </button>
          </div>
          <pre className="p-4 text-sm text-gray-300 overflow-x-auto">
            <code>{reproducer}</code>
          </pre>
        </div>
      ))}
    </div>
  );
}
