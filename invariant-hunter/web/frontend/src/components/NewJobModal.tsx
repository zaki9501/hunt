/**
 * New Job Modal Component
 */

import { useState } from 'react';
import { X, Upload, Github, ChevronLeft, ChevronRight, Cloud, Zap, Clock, GitBranch, Link, Shield, Target, Flame, Skull } from 'lucide-react';
import { api } from '../lib/api';

interface NewJobModalProps {
  onClose: () => void;
  onCreated: () => void;
}

const fuzzerOptions = [
  { id: 'echidna', name: 'Echidna', color: 'purple', description: 'Property-based fuzzing' },
  { id: 'medusa', name: 'Medusa', color: 'orange', description: 'Parallel fuzzing' },
  { id: 'foundry', name: 'Foundry', color: 'blue', description: 'Forge invariant testing' },
];

type FuzzModeId = 'quick' | 'deep' | 'flow' | 'adversarial';

const fuzzModeOptions: Array<{
  id: FuzzModeId;
  name: string;
  icon: typeof Zap;
  color: string;
  description: string;
  details: string;
}> = [
  { 
    id: 'quick', 
    name: 'Quick', 
    icon: Zap,
    color: 'green',
    description: 'Fast feedback, low runs',
    details: '~1K runs, basic coverage'
  },
  { 
    id: 'deep', 
    name: 'Deep', 
    icon: Target,
    color: 'blue',
    description: 'High runs, boundary bias',
    details: '~100K runs, edge cases'
  },
  { 
    id: 'flow', 
    name: 'Flow', 
    icon: Flame,
    color: 'orange',
    description: 'Multi-call sequences',
    details: 'Stateful, multi-actor'
  },
  { 
    id: 'adversarial', 
    name: 'Adversarial', 
    icon: Skull,
    color: 'red',
    description: 'Attack simulation',
    details: 'Grief patterns, exploits'
  },
];

export function NewJobModal({ onClose, onCreated }: NewJobModalProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [source, setSource] = useState<'github' | 'upload'>('github');
  const [repoUrl, setRepoUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const [name, setName] = useState('');
  const [fuzzer, setFuzzer] = useState('foundry');
  const [fuzzMode, setFuzzMode] = useState<'quick' | 'deep' | 'flow' | 'adversarial'>('deep');
  const [duration, setDuration] = useState(600); // 10 minutes default for deep mode
  const [cloud, setCloud] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      await api.createJob({
        name: name || `Job ${Date.now()}`,
        fuzzer,
        fuzzMode: fuzzer === 'foundry' ? fuzzMode : undefined,
        duration,
        cloud,
        source: {
          type: source,
          repoUrl: source === 'github' ? repoUrl : undefined,
          branch: source === 'github' ? branch : undefined,
        },
      });
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create job';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="card w-full max-w-xl overflow-hidden animate-zoom-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white">Create New Job</h2>
            <p className="text-sm text-gray-400 mt-1">Step {step} of 2</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-gray-800">
          <div 
            className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300"
            style={{ width: `${(step / 2) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-white font-semibold mb-4">Select Source</h3>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSource('github')}
                    className={`relative p-6 rounded-xl border-2 transition-all duration-200 text-left group ${
                      source === 'github'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    {source === 'github' && (
                      <div className="absolute top-3 right-3 w-3 h-3 bg-cyan-500 rounded-full" />
                    )}
                    <div className={`p-3 rounded-xl w-fit mb-3 ${
                      source === 'github' ? 'bg-cyan-500/20' : 'bg-gray-700'
                    }`}>
                      <Github className={source === 'github' ? 'text-cyan-400' : 'text-gray-400'} size={24} />
                    </div>
                    <p className="text-white font-semibold">GitHub</p>
                    <p className="text-gray-400 text-sm mt-1">Import from repository</p>
                  </button>

                  <button
                    onClick={() => setSource('upload')}
                    className={`relative p-6 rounded-xl border-2 transition-all duration-200 text-left group ${
                      source === 'upload'
                        ? 'border-cyan-500 bg-cyan-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    {source === 'upload' && (
                      <div className="absolute top-3 right-3 w-3 h-3 bg-cyan-500 rounded-full" />
                    )}
                    <div className={`p-3 rounded-xl w-fit mb-3 ${
                      source === 'upload' ? 'bg-cyan-500/20' : 'bg-gray-700'
                    }`}>
                      <Upload className={source === 'upload' ? 'text-cyan-400' : 'text-gray-400'} size={24} />
                    </div>
                    <p className="text-white font-semibold">Upload</p>
                    <p className="text-gray-400 text-sm mt-1">Upload project files</p>
                  </button>
                </div>
              </div>

              {source === 'github' && (
                <div className="space-y-4">
                  <div>
                    <label className="label flex items-center gap-2">
                      <Link size={14} />
                      Repository URL
                    </label>
                    <input
                      type="text"
                      value={repoUrl}
                      onChange={e => setRepoUrl(e.target.value)}
                      placeholder="https://github.com/user/repo"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label flex items-center gap-2">
                      <GitBranch size={14} />
                      Branch
                    </label>
                    <input
                      type="text"
                      value={branch}
                      onChange={e => setBranch(e.target.value)}
                      placeholder="main"
                      className="input"
                    />
                  </div>
                </div>
              )}

              {source === 'upload' && (
                <div className="border-2 border-dashed border-gray-700 hover:border-cyan-500/50 rounded-xl p-8 text-center transition-colors cursor-pointer group">
                  <div className="p-4 bg-gray-800 rounded-xl w-fit mx-auto mb-4 group-hover:bg-cyan-500/10 transition-colors">
                    <Upload className="text-gray-400 group-hover:text-cyan-400 transition-colors" size={32} />
                  </div>
                  <p className="text-white font-medium mb-1">
                    Drag and drop your project
                  </p>
                  <p className="text-gray-400 text-sm">
                    or <span className="text-cyan-400">browse</span> to choose files
                  </p>
                  <p className="text-gray-500 text-xs mt-3">
                    Supports .zip files up to 50MB
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="label">Job Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="My Invariant Test"
                  className="input"
                />
              </div>

              <div>
                <label className="label">Select Fuzzer</label>
                <div className="grid grid-cols-3 gap-3">
                  {fuzzerOptions.map(f => (
                    <button
                      key={f.id}
                      onClick={() => setFuzzer(f.id)}
                      className={`p-4 rounded-xl border-2 transition-all text-center ${
                        fuzzer === f.id
                          ? 'border-cyan-500 bg-cyan-500/10'
                          : 'border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <span className={`inline-block px-3 py-1 rounded-lg text-xs font-bold mb-2 ${
                        f.color === 'purple' ? 'bg-purple-500/20 text-purple-400' :
                        f.color === 'orange' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {f.name}
                      </span>
                      <p className="text-gray-400 text-xs">{f.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Fuzz Mode - Only for Foundry */}
              {fuzzer === 'foundry' && (
                <div>
                  <label className="label flex items-center gap-2">
                    <Shield size={14} />
                    Fuzz Mode
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {fuzzModeOptions.map(mode => {
                      const Icon = mode.icon;
                      return (
                        <button
                          key={mode.id}
                          onClick={() => {
                            setFuzzMode(mode.id);
                            // Auto-adjust duration based on mode
                            if (mode.id === 'quick') setDuration(120);
                            else if (mode.id === 'deep') setDuration(600);
                            else if (mode.id === 'flow') setDuration(1800);
                            else if (mode.id === 'adversarial') setDuration(3600);
                          }}
                          className={`p-3 rounded-xl border-2 transition-all text-left ${
                            fuzzMode === mode.id
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-gray-700 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon size={16} className={
                              mode.color === 'green' ? 'text-green-400' :
                              mode.color === 'blue' ? 'text-blue-400' :
                              mode.color === 'orange' ? 'text-orange-400' :
                              'text-red-400'
                            } />
                            <span className="text-white font-semibold text-sm">{mode.name}</span>
                          </div>
                          <p className="text-gray-400 text-xs">{mode.description}</p>
                          <p className="text-gray-500 text-xs mt-1">{mode.details}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="label flex items-center gap-2">
                  <Clock size={14} />
                  Duration: <span className="text-cyan-400">{formatDuration(duration)}</span>
                </label>
                <input
                  type="range"
                  min={60}
                  max={3600}
                  step={60}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-2">
                  <span>1 min</span>
                  <span>30 min</span>
                  <span>60 min</span>
                </div>
              </div>

              <div className="flex items-center justify-between p-5 bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-gray-700 rounded-xl">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-cyan-500/20 rounded-xl">
                    <Cloud className="text-cyan-400" size={24} />
                  </div>
                  <div>
                    <p className="text-white font-semibold">Cloud Execution</p>
                    <p className="text-gray-400 text-sm">Run on powerful cloud servers</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cloud}
                    onChange={e => setCloud(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-12 h-7 bg-gray-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-cyan-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-cyan-500 peer-checked:to-cyan-600"></div>
                </label>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-800 bg-gray-900/50">
          {step > 1 ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="btn btn-secondary"
            >
              <ChevronLeft size={18} />
              Back
            </button>
          ) : (
            <button
              onClick={onClose}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          )}

          {step < 2 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={source === 'github' && !repoUrl}
              className="btn btn-primary"
            >
              Continue
              <ChevronRight size={18} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <Zap size={18} />
                  Create Job
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)} min`;
}
