/**
 * Settings Page
 */

import { useState } from 'react';
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Eye, 
  EyeOff,
  Github,
  AlertTriangle
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../store/auth';

export default function SettingsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'profile' | 'tokens' | 'integrations'>('profile');

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-gray-400">Manage your account and preferences</p>
        </div>

        <div className="flex gap-6">
          {/* Sidebar */}
          <div className="w-48">
            <nav className="space-y-1">
              {[
                { id: 'profile', label: 'Profile' },
                { id: 'tokens', label: 'API Tokens' },
                { id: 'integrations', label: 'Integrations' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`w-full text-left px-4 py-2 rounded-lg transition ${
                    activeTab === tab.id
                      ? 'bg-cyan-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Content */}
          <div className="flex-1 bg-gray-800 rounded-lg p-6">
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'tokens' && <TokenSettings />}
            {activeTab === 'integrations' && <IntegrationSettings />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ProfileSettings() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // API call to update profile
    await new Promise(r => setTimeout(r, 1000));
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Profile Settings</h2>

      <div className="space-y-4 max-w-md">
        <div>
          <label className="block text-sm text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Plan</label>
          <div className="flex items-center justify-between bg-gray-700 rounded-lg px-4 py-3">
            <div>
              <span className="text-white font-medium capitalize">{user?.plan || 'Free'}</span>
              <p className="text-gray-400 text-sm">5 jobs/month • 10 min max duration</p>
            </div>
            <button className="text-cyan-400 hover:underline text-sm">
              Upgrade
            </button>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-600 text-white rounded-lg transition"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="mt-8 pt-8 border-t border-gray-700">
        <h3 className="text-red-400 font-medium mb-4 flex items-center gap-2">
          <AlertTriangle size={18} />
          Danger Zone
        </h3>
        <button className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 rounded-lg transition">
          Delete Account
        </button>
      </div>
    </div>
  );
}

function TokenSettings() {
  const [tokens, setTokens] = useState([
    { id: '1', name: 'CLI Token', prefix: 'hunt_abc...', createdAt: '2024-01-15', lastUsed: '2024-01-20' },
    { id: '2', name: 'CI/CD Token', prefix: 'hunt_xyz...', createdAt: '2024-01-10', lastUsed: null },
  ]);
  const [showNewToken, setShowNewToken] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [newTokenName, setNewTokenName] = useState('');

  const handleCreateToken = async () => {
    // Simulate token creation
    const token = 'hunt_' + Math.random().toString(36).substring(2);
    setNewToken(token);
    setTokens([
      ...tokens,
      { id: Date.now().toString(), name: newTokenName || 'New Token', prefix: token.substring(0, 12) + '...', createdAt: new Date().toISOString().split('T')[0], lastUsed: null }
    ]);
  };

  const handleDeleteToken = (id: string) => {
    if (confirm('Are you sure you want to delete this token?')) {
      setTokens(tokens.filter(t => t.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">API Tokens</h2>
          <p className="text-gray-400 text-sm">Manage tokens for CLI and CI/CD access</p>
        </div>
        <button
          onClick={() => setShowNewToken(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition"
        >
          <Plus size={18} />
          New Token
        </button>
      </div>

      {/* Token List */}
      <div className="space-y-3">
        {tokens.map(token => (
          <div key={token.id} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-600 rounded">
                <Key size={18} className="text-gray-400" />
              </div>
              <div>
                <p className="text-white font-medium">{token.name}</p>
                <p className="text-gray-400 text-sm font-mono">{token.prefix}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                <p className="text-gray-400">Created {token.createdAt}</p>
                <p className="text-gray-500">{token.lastUsed ? `Last used ${token.lastUsed}` : 'Never used'}</p>
              </div>
              <button
                onClick={() => handleDeleteToken(token.id)}
                className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-600 rounded transition"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* New Token Modal */}
      {showNewToken && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-md p-6">
            {newToken ? (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Token Created!</h3>
                <p className="text-gray-400 text-sm">
                  Copy this token now. You won't be able to see it again.
                </p>
                <TokenDisplay token={newToken} />
                <button
                  onClick={() => {
                    setShowNewToken(false);
                    setNewToken(null);
                    setNewTokenName('');
                  }}
                  className="w-full py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-white">Create New Token</h3>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Token Name</label>
                  <input
                    type="text"
                    value={newTokenName}
                    onChange={e => setNewTokenName(e.target.value)}
                    placeholder="My CLI Token"
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowNewToken(false)}
                    className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateToken}
                    className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition"
                  >
                    Create
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TokenDisplay({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const [visible, setVisible] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center gap-2 bg-gray-900 rounded-lg p-3">
      <code className="flex-1 text-sm text-cyan-400 font-mono overflow-hidden">
        {visible ? token : '•'.repeat(token.length)}
      </code>
      <button
        onClick={() => setVisible(!visible)}
        className="p-1.5 text-gray-400 hover:text-white transition"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
      <button
        onClick={handleCopy}
        className="p-1.5 text-gray-400 hover:text-white transition"
      >
        {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
      </button>
    </div>
  );
}

function IntegrationSettings() {
  const [githubConnected, setGithubConnected] = useState(false);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">Integrations</h2>

      {/* GitHub */}
      <div className="bg-gray-700/50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-600 rounded">
              <Github size={24} className="text-white" />
            </div>
            <div>
              <p className="text-white font-medium">GitHub</p>
              <p className="text-gray-400 text-sm">
                {githubConnected ? 'Connected as @username' : 'Connect to import repositories'}
              </p>
            </div>
          </div>
          {githubConnected ? (
            <button
              onClick={() => setGithubConnected(false)}
              className="px-4 py-2 bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800 rounded-lg transition"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={() => setGithubConnected(true)}
              className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg transition"
            >
              Connect
            </button>
          )}
        </div>
      </div>

      {/* More integrations placeholder */}
      <div className="text-gray-500 text-center py-8">
        More integrations coming soon...
      </div>
    </div>
  );
}
