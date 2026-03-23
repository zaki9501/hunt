/**
 * Job Card Component
 */

import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { 
  Play, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  ChevronRight,
  Trash2,
  StopCircle,
  Cloud,
  Timer
} from 'lucide-react';
import { Job } from '../lib/types';
import { api } from '../lib/api';

interface JobCardProps {
  job: Job;
  onAction?: () => void;
}

const statusConfig = {
  pending: { icon: Clock, color: 'yellow', label: 'Pending', badgeClass: 'badge-warning' },
  running: { icon: Play, color: 'blue', label: 'Running', badgeClass: 'badge-info' },
  completed: { icon: CheckCircle, color: 'green', label: 'Completed', badgeClass: 'badge-success' },
  failed: { icon: XCircle, color: 'red', label: 'Failed', badgeClass: 'badge-error' },
  cancelled: { icon: AlertTriangle, color: 'gray', label: 'Cancelled', badgeClass: 'badge' },
};

const fuzzerConfig: Record<string, { bg: string; gradient: string }> = {
  echidna: { bg: 'bg-purple-500/20', gradient: 'from-purple-500 to-purple-600' },
  medusa: { bg: 'bg-orange-500/20', gradient: 'from-orange-500 to-orange-600' },
  foundry: { bg: 'bg-blue-500/20', gradient: 'from-blue-500 to-blue-600' },
  halmos: { bg: 'bg-green-500/20', gradient: 'from-green-500 to-green-600' },
  kontrol: { bg: 'bg-pink-500/20', gradient: 'from-pink-500 to-pink-600' },
};

export function JobCard({ job, onAction }: JobCardProps) {
  const status = statusConfig[job.status] || statusConfig.pending;
  const StatusIcon = status.icon;
  const fuzzer = fuzzerConfig[job.fuzzer] || { bg: 'bg-gray-500/20', gradient: 'from-gray-500 to-gray-600' };

  const handleStop = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to stop this job?')) {
      await api.stopJob(job.id);
      onAction?.();
    }
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this job?')) {
      await api.deleteJob(job.id);
      onAction?.();
    }
  };

  return (
    <Link href={`/jobs/${job.id}`}>
      <div className="group bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-gray-600 rounded-xl p-5 transition-all duration-300 cursor-pointer">
        <div className="flex items-start gap-4">
          {/* Fuzzer Icon */}
          <div className={`p-3 rounded-xl ${fuzzer.bg} shrink-0`}>
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${fuzzer.gradient} flex items-center justify-center`}>
              <span className="text-white text-xs font-bold uppercase">
                {job.fuzzer[0]}
              </span>
            </div>
          </div>

          {/* Job info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-white font-semibold truncate group-hover:text-cyan-400 transition-colors">
                {job.name}
              </h3>
              <span className={status.badgeClass}>
                <StatusIcon size={12} className="mr-1" />
                {status.label}
              </span>
              {job.cloud && (
                <span className="badge badge-info">
                  <Cloud size={12} className="mr-1" />
                  Cloud
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4 text-sm text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-xs font-medium bg-gradient-to-r ${fuzzer.gradient} text-white`}>
                  {job.fuzzer}
                </span>
              </span>
              <span className="flex items-center gap-1">
                <Clock size={14} />
                {formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })}
              </span>
              {job.duration && (
                <span className="flex items-center gap-1">
                  <Timer size={14} />
                  {formatDuration(job.duration)}
                </span>
              )}
            </div>

            {/* Progress bar for running jobs */}
            {job.status === 'running' && job.progress !== undefined && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>Progress</span>
                  <span className="font-medium text-cyan-400">{job.progress}%</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500 rounded-full"
                    style={{ width: `${job.progress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Stats for completed jobs */}
            {job.status === 'completed' && job.results && (
              <div className="mt-4 flex gap-6 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{job.results.totalTests}</p>
                  <p className="text-xs text-gray-500">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-400">{job.results.passed}</p>
                  <p className="text-xs text-gray-500">Passed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-400">{job.results.failed}</p>
                  <p className="text-xs text-gray-500">Failed</p>
                </div>
                {job.results.coverage !== undefined && (
                  <div className="text-center">
                    <p className="text-2xl font-bold text-cyan-400">{job.results.coverage}%</p>
                    <p className="text-xs text-gray-500">Coverage</p>
                  </div>
                )}
              </div>
            )}

            {/* Error message for failed jobs */}
            {job.status === 'failed' && job.error && (
              <div className="mt-4 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                <XCircle size={14} className="inline mr-2" />
                {job.error}
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {job.status === 'running' && (
              <button
                onClick={handleStop}
                className="p-2.5 text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10 rounded-lg transition"
                title="Stop job"
              >
                <StopCircle size={18} />
              </button>
            )}
            {(job.status === 'completed' || job.status === 'failed') && (
              <button
                onClick={handleDelete}
                className="p-2.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
                title="Delete job"
              >
                <Trash2 size={18} />
              </button>
            )}
            <ChevronRight 
              size={20} 
              className="text-gray-600 group-hover:text-cyan-400 group-hover:translate-x-1 transition-all" 
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}
