/**
 * Log Viewer Component
 */

import { useRef, useEffect, useState } from 'react';
import { Download, Search, ChevronDown, ChevronUp } from 'lucide-react';

interface LogViewerProps {
  logs: string[];
  autoScroll?: boolean;
}

export function LogViewer({ logs, autoScroll = true }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [following, setFollowing] = useState(autoScroll);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (following && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, following]);

  // Detect manual scroll
  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollTop + clientHeight >= scrollHeight - 50;
    setFollowing(isAtBottom);
  };

  const filteredLogs = search
    ? logs.filter(log => log.toLowerCase().includes(search.toLowerCase()))
    : logs;

  const downloadLogs = () => {
    const blob = new Blob([logs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'logs.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (logs.length === 0) {
    return (
      <div className="text-gray-400 text-center py-8">
        No logs available yet
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[500px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {showSearch && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="bg-gray-700 border border-gray-600 rounded pl-9 pr-4 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 w-64"
                autoFocus
              />
            </div>
          )}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1.5 rounded transition ${
              showSearch ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
            title="Search"
          >
            <Search size={16} />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setFollowing(!following)}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition ${
              following ? 'bg-cyan-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            {following ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            {following ? 'Following' : 'Paused'}
          </button>
          <button
            onClick={downloadLogs}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition"
            title="Download logs"
          >
            <Download size={16} />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-auto"
      >
        {filteredLogs.map((log, i) => (
          <LogLine key={i} line={log} search={search} />
        ))}
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between mt-2 text-xs text-gray-500">
        <span>
          {filteredLogs.length === logs.length
            ? `${logs.length} lines`
            : `${filteredLogs.length} of ${logs.length} lines`}
        </span>
        {!following && (
          <button
            onClick={() => {
              setFollowing(true);
              if (containerRef.current) {
                containerRef.current.scrollTop = containerRef.current.scrollHeight;
              }
            }}
            className="text-cyan-400 hover:underline"
          >
            Jump to bottom
          </button>
        )}
      </div>
    </div>
  );
}

function LogLine({ line, search }: { line: string; search: string }) {
  // Parse log prefixes and determine styling
  const getLogStyle = (text: string): { color: string; bgColor?: string; icon?: string } => {
    // Check for specific prefixes
    if (text.includes('[CRITICAL]')) return { color: 'text-red-300', bgColor: 'bg-red-900/50', icon: '🔴' };
    if (text.includes('[ERROR]')) return { color: 'text-red-400' };
    if (text.includes('[FAIL]')) return { color: 'text-red-400' };
    if (text.includes('[HIGH]')) return { color: 'text-orange-400' };
    if (text.includes('[WARNING]')) return { color: 'text-yellow-400' };
    if (text.includes('[MEDIUM]')) return { color: 'text-yellow-300' };
    if (text.includes('[SUCCESS]')) return { color: 'text-green-400' };
    if (text.includes('[PASS]')) return { color: 'text-green-400' };
    if (text.includes('[INFO]')) return { color: 'text-cyan-400' };
    if (text.includes('[PHASE]')) return { color: 'text-purple-400', bgColor: 'bg-purple-900/30' };
    if (text.includes('[PROGRESS]')) return { color: 'text-yellow-300' };
    if (text.includes('[DIM]')) return { color: 'text-gray-500' };
    
    // Check for content patterns
    if (text.includes('FAILED') || text.includes('✗')) return { color: 'text-red-400' };
    if (text.includes('PASSED') || text.includes('✓')) return { color: 'text-green-400' };
    if (text.includes('error:') || text.includes('[stderr]')) return { color: 'text-red-400' };
    if (text.includes('warning:') || text.includes('⚠')) return { color: 'text-yellow-400' };
    if (text.includes('═══') || text.includes('━━━') || text.includes('───')) return { color: 'text-cyan-600' };
    if (text.includes('┌') || text.includes('├') || text.includes('└') || text.includes('│')) return { color: 'text-cyan-700' };
    if (text.includes('📦') || text.includes('🧪') || text.includes('📝') || text.includes('💡')) return { color: 'text-cyan-300' };
    
    return { color: 'text-gray-300' };
  };

  const style = getLogStyle(line);
  
  // Remove the prefix tags from display but keep the styling
  let displayLine = line
    .replace(/\[CRITICAL\]\s*/g, '')
    .replace(/\[ERROR\]\s*/g, '')
    .replace(/\[FAIL\]\s*/g, '')
    .replace(/\[HIGH\]\s*/g, '')
    .replace(/\[WARNING\]\s*/g, '')
    .replace(/\[MEDIUM\]\s*/g, '')
    .replace(/\[SUCCESS\]\s*/g, '')
    .replace(/\[PASS\]\s*/g, '')
    .replace(/\[INFO\]\s*/g, '')
    .replace(/\[PHASE\]\s*/g, '')
    .replace(/\[PROGRESS\]\s*/g, '')
    .replace(/\[DIM\]\s*/g, '');

  // Highlight search matches
  if (search) {
    const regex = new RegExp(`(${escapeRegex(search)})`, 'gi');
    const parts = displayLine.split(regex);
    
    return (
      <div className={`${style.color} ${style.bgColor || ''} whitespace-pre-wrap break-all py-0.5 px-1 rounded`}>
        {parts.map((part, i) => 
          regex.test(part) ? (
            <span key={i} className="bg-yellow-500/30 text-yellow-200">{part}</span>
          ) : (
            part
          )
        )}
      </div>
    );
  }

  return (
    <div className={`${style.color} ${style.bgColor || ''} whitespace-pre-wrap break-all py-0.5 px-1 rounded`}>
      {displayLine}
    </div>
  );
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
