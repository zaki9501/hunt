/**
 * Jobs List Page
 */

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Filter, Plus, SortAsc } from 'lucide-react';
import { api } from '../../lib/api';
import { Layout } from '../../components/Layout';
import { JobCard } from '../../components/JobCard';
import { NewJobModal } from '../../components/NewJobModal';
import { Job } from '../../lib/types';

type SortField = 'createdAt' | 'name' | 'status';
type SortOrder = 'asc' | 'desc';

export default function JobsPage() {
  const queryClient = useQueryClient();
  const [showNewJob, setShowNewJob] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [fuzzerFilter, setFuzzerFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ['jobs'],
    queryFn: () => api.getJobs(),
    refetchInterval: (query) => {
      const list = query.state.data as Job[] | undefined;
      const active = list?.some((j) => j.status === 'pending' || j.status === 'running');
      return active ? 1500 : 5000;
    },
  });

  // Filter and sort jobs
  const filteredJobs = jobs
    ?.filter(job => {
      if (search && !job.name.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all' && job.status !== statusFilter) {
        return false;
      }
      if (fuzzerFilter !== 'all' && job.fuzzer !== fuzzerFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        case 'createdAt':
        default:
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Jobs</h1>
            <p className="text-gray-400">All your fuzzing jobs</p>
          </div>
          <button
            onClick={() => setShowNewJob(true)}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg transition"
          >
            <Plus size={20} />
            New Job
          </button>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search jobs..."
                  className="w-full bg-gray-700 border border-gray-600 rounded-lg pl-10 pr-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="running">Running</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
            </select>

            {/* Fuzzer Filter */}
            <select
              value={fuzzerFilter}
              onChange={e => setFuzzerFilter(e.target.value)}
              className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="all">All Fuzzers</option>
              <option value="echidna">Echidna</option>
              <option value="medusa">Medusa</option>
              <option value="foundry">Foundry</option>
            </select>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <select
                value={sortField}
                onChange={e => setSortField(e.target.value as SortField)}
                className="bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="createdAt">Date</option>
                <option value="name">Name</option>
                <option value="status">Status</option>
              </select>
              <button
                onClick={() => setSortOrder(o => o === 'asc' ? 'desc' : 'asc')}
                className={`p-2 bg-gray-700 border border-gray-600 rounded-lg text-gray-400 hover:text-white transition ${
                  sortOrder === 'desc' ? 'rotate-180' : ''
                }`}
              >
                <SortAsc size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Jobs List */}
        <div className="space-y-4">
          {isLoading ? (
            <div className="text-gray-400 text-center py-12">Loading...</div>
          ) : filteredJobs?.length === 0 ? (
            <div className="bg-gray-800 rounded-lg p-12 text-center">
              <Filter className="mx-auto mb-4 text-gray-500" size={48} />
              <h3 className="text-white font-medium mb-2">No jobs found</h3>
              <p className="text-gray-400">
                {search || statusFilter !== 'all' || fuzzerFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Create your first job to get started'}
              </p>
            </div>
          ) : (
            filteredJobs?.map(job => (
              <JobCard key={job.id} job={job} onAction={refetch} />
            ))
          )}
        </div>

        {/* Pagination placeholder */}
        {filteredJobs && filteredJobs.length > 0 && (
          <div className="flex justify-between items-center text-sm text-gray-400">
            <span>Showing {filteredJobs.length} jobs</span>
          </div>
        )}
      </div>

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
