/**
 * Dashboard Home Page
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Plus,
  ArrowUpRight,
  Sparkles,
  TrendingUp
} from 'lucide-react';
import { api } from '../lib/api';
import { Layout } from '../components/Layout';
import { JobCard } from '../components/JobCard';
import { NewJobModal } from '../components/NewJobModal';
import { Job } from '../lib/types';

export default function Dashboard() {
  const queryClient = useQueryClient();
  const [showNewJob, setShowNewJob] = useState(false);

  const { data: jobs, isLoading } = useQuery<Job[]>({
    queryKey: ['jobs'],
    queryFn: () => api.getJobs(),
    refetchInterval: (query) => {
      const list = query.state.data;
      const active = list?.some((j) => j.status === 'pending' || j.status === 'running');
      return active ? 1500 : 5000;
    },
  });

  const stats = {
    running: jobs?.filter((j: Job) => j.status === 'running').length || 0,
    pending: jobs?.filter((j: Job) => j.status === 'pending').length || 0,
    completed: jobs?.filter((j: Job) => j.status === 'completed').length || 0,
    failed: jobs?.filter((j: Job) => j.status === 'failed').length || 0,
  };

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Dashboard</h1>
            <p className="text-gray-400">Monitor and manage your invariant testing jobs</p>
          </div>
          <button
            onClick={() => setShowNewJob(true)}
            className="btn btn-primary"
          >
            <Plus size={20} />
            New Job
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            label="Running"
            value={stats.running}
            icon={<Play size={24} />}
            color="blue"
            trend="+2 from yesterday"
          />
          <StatCard
            label="Pending"
            value={stats.pending}
            icon={<Clock size={24} />}
            color="yellow"
            trend="In queue"
          />
          <StatCard
            label="Completed"
            value={stats.completed}
            icon={<CheckCircle size={24} />}
            color="green"
            trend="+12 this week"
          />
          <StatCard
            label="Failed"
            value={stats.failed}
            icon={<XCircle size={24} />}
            color="red"
            trend="2 need attention"
          />
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <QuickActionCard
            title="Run Echidna"
            description="Property-based fuzzing for Solidity"
            icon={<Sparkles className="text-purple-400" size={24} />}
            color="purple"
          />
          <QuickActionCard
            title="Run Medusa"
            description="Fast parallel smart contract fuzzer"
            icon={<TrendingUp className="text-cyan-400" size={24} />}
            color="cyan"
          />
          <QuickActionCard
            title="Run Foundry"
            description="Invariant testing with Forge"
            icon={<Play className="text-orange-400" size={24} />}
            color="orange"
          />
        </div>

        {/* Jobs List */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Recent Jobs</h2>
            <a href="/jobs" className="text-cyan-400 hover:text-cyan-300 text-sm flex items-center gap-1 transition">
              View all <ArrowUpRight size={14} />
            </a>
          </div>
          
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : jobs?.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-800 flex items-center justify-center">
                <AlertTriangle className="text-gray-500" size={32} />
              </div>
              <h3 className="text-lg font-medium text-white mb-2">No jobs yet</h3>
              <p className="text-gray-400 mb-6">Create your first fuzzing job to get started!</p>
              <button
                onClick={() => setShowNewJob(true)}
                className="btn btn-primary"
              >
                <Plus size={18} />
                Create First Job
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs?.slice(0, 5).map(job => (
                <JobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* New Job Modal */}
      {showNewJob && (
        <NewJobModal
          onClose={() => setShowNewJob(false)}
          onCreated={() => {
            setShowNewJob(false);
            void queryClient.invalidateQueries({ queryKey: ['jobs'] });
          }}
        />
      )}
    </Layout>
  );
}

function StatCard({ 
  label, 
  value, 
  icon, 
  color,
  trend
}: { 
  label: string; 
  value: number; 
  icon: React.ReactNode; 
  color: string;
  trend?: string;
}) {
  const colorClasses: Record<string, { bg: string; text: string; glow: string }> = {
    blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', glow: 'shadow-blue-500/20' },
    yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', glow: 'shadow-yellow-500/20' },
    green: { bg: 'bg-green-500/10', text: 'text-green-400', glow: 'shadow-green-500/20' },
    red: { bg: 'bg-red-500/10', text: 'text-red-400', glow: 'shadow-red-500/20' },
  };

  const colors = colorClasses[color] || colorClasses.blue;

  return (
    <div className={`card p-6 stat-card ${color}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-400 mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {trend && (
            <p className="text-xs text-gray-500 mt-2">{trend}</p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${colors.bg} ${colors.text}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
  icon,
  color
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <button className="card-hover p-6 text-left group">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-gray-800 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-white mb-1 group-hover:text-cyan-400 transition-colors">
            {title}
          </h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
        <ArrowUpRight className="text-gray-600 group-hover:text-cyan-400 transition-colors" size={20} />
      </div>
    </button>
  );
}
