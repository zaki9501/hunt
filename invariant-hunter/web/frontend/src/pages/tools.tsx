/**
 * Tools Page
 */

import { useState } from 'react';
import { 
  FileCode, 
  GitCompare, 
  Wand2, 
  Copy, 
  Check,
  Upload
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';

type Tool = 'scraper' | 'bytecode' | 'handlers';

export default function ToolsPage() {
  const [activeTool, setActiveTool] = useState<Tool>('scraper');

  const tools = [
    { id: 'scraper', label: 'Log Scraper', icon: FileCode, description: 'Convert fuzzer logs to Foundry reproducers' },
    { id: 'bytecode', label: 'Bytecode Compare', icon: GitCompare, description: 'Compare contract bytecodes' },
    { id: 'handlers', label: 'Handler Generator', icon: Wand2, description: 'Generate handlers from ABI' },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Tools</h1>
          <p className="text-gray-400">Utilities for smart contract testing</p>
        </div>

        {/* Tool Selector */}
        <div className="grid grid-cols-3 gap-4">
          {tools.map(tool => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id as Tool)}
                className={`p-4 rounded-lg border-2 text-left transition ${
                  activeTool === tool.id
                    ? 'border-cyan-500 bg-cyan-900/20'
                    : 'border-gray-700 hover:border-gray-600'
                }`}
              >
                <Icon className={`mb-2 ${activeTool === tool.id ? 'text-cyan-400' : 'text-gray-400'}`} size={24} />
                <h3 className="text-white font-medium">{tool.label}</h3>
                <p className="text-gray-400 text-sm">{tool.description}</p>
              </button>
            );
          })}
        </div>

        {/* Tool Content */}
        <div className="bg-gray-800 rounded-lg p-6">
          {activeTool === 'scraper' && <LogScraperTool />}
          {activeTool === 'bytecode' && <BytecodeCompareTool />}
          {activeTool === 'handlers' && <HandlerGeneratorTool />}
        </div>
      </div>
    </Layout>
  );
}

function LogScraperTool() {
  const [fuzzerType, setFuzzerType] = useState('echidna');
  const [logs, setLogs] = useState('');
  const [result, setResult] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleScrape = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const { reproducers } = await api.scrapeLogs({ type: fuzzerType, logs });
      setResult(reproducers);
    } catch (err: any) {
      setError(err.message || 'Failed to scrape logs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Log Scraper</h2>
      <p className="text-gray-400">
        Paste fuzzer output to generate Foundry test reproducers for failed properties.
      </p>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Fuzzer Type</label>
        <div className="flex gap-2">
          {['echidna', 'medusa'].map(type => (
            <button
              key={type}
              onClick={() => setFuzzerType(type)}
              className={`px-4 py-2 rounded-lg border capitalize transition ${
                fuzzerType === type
                  ? 'border-cyan-500 bg-cyan-900/20 text-white'
                  : 'border-gray-600 text-gray-400 hover:border-gray-500'
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Fuzzer Logs</label>
        <textarea
          value={logs}
          onChange={e => setLogs(e.target.value)}
          placeholder="Paste fuzzer output here..."
          className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      <button
        onClick={handleScrape}
        disabled={loading || !logs}
        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition"
      >
        {loading ? 'Processing...' : 'Generate Reproducers'}
      </button>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <h3 className="text-white font-medium">Generated Reproducers</h3>
          {result.length === 0 ? (
            <p className="text-gray-400">No failed properties found in logs</p>
          ) : (
            result.map((code, i) => (
              <CodeBlock key={i} code={code} filename={`reproducer_${i + 1}.sol`} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BytecodeCompareTool() {
  const [bytecode1, setBytecode1] = useState('');
  const [bytecode2, setBytecode2] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCompare = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await api.compareBytecode({ bytecode1, bytecode2 });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to compare bytecodes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Bytecode Compare</h2>
      <p className="text-gray-400">
        Compare two contract bytecodes to find differences.
      </p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Bytecode 1</label>
          <textarea
            value={bytecode1}
            onChange={e => setBytecode1(e.target.value)}
            placeholder="0x608060405234..."
            className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-xs placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
        <div>
          <label className="block text-sm text-gray-400 mb-1">Bytecode 2</label>
          <textarea
            value={bytecode2}
            onChange={e => setBytecode2(e.target.value)}
            placeholder="0x608060405234..."
            className="w-full h-32 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-xs placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
          />
        </div>
      </div>

      <button
        onClick={handleCompare}
        disabled={loading || !bytecode1 || !bytecode2}
        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition"
      >
        {loading ? 'Comparing...' : 'Compare'}
      </button>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="bg-gray-700/50 rounded-lg p-4">
          <div className={`text-lg font-medium mb-2 ${result.identical ? 'text-green-400' : 'text-yellow-400'}`}>
            {result.identical ? 'Bytecodes are identical' : 'Bytecodes differ'}
          </div>
          {!result.identical && result.differences && (
            <pre className="text-sm text-gray-300 overflow-x-auto">
              {JSON.stringify(result.differences, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function HandlerGeneratorTool() {
  const [abi, setAbi] = useState('');
  const [contractName, setContractName] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const parsedAbi = JSON.parse(abi);
      const { handlers } = await api.generateHandlers({ 
        abi: parsedAbi, 
        contractName: contractName || 'Target' 
      });
      setResult(handlers);
    } catch (err: any) {
      setError(err.message || 'Failed to generate handlers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-white">Handler Generator</h2>
      <p className="text-gray-400">
        Generate handler functions from contract ABI for invariant testing.
      </p>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Contract Name</label>
        <input
          type="text"
          value={contractName}
          onChange={e => setContractName(e.target.value)}
          placeholder="MyContract"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Contract ABI (JSON)</label>
        <textarea
          value={abi}
          onChange={e => setAbi(e.target.value)}
          placeholder='[{"type":"function","name":"transfer",...}]'
          className="w-full h-48 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-none"
        />
      </div>

      <button
        onClick={handleGenerate}
        disabled={loading || !abi}
        className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg transition"
      >
        {loading ? 'Generating...' : 'Generate Handlers'}
      </button>

      {error && (
        <div className="p-3 bg-red-900/20 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {result && (
        <CodeBlock code={result} filename="TargetFunctions.sol" />
      )}
    </div>
  );
}

function CodeBlock({ code, filename }: { code: string; filename: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-700/50">
        <span className="text-white text-sm">{filename}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-gray-400 hover:text-white text-sm transition"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm text-gray-300 overflow-x-auto max-h-96">
        <code>{code}</code>
      </pre>
    </div>
  );
}
