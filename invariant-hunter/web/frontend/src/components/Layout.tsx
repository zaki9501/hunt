/**
 * Main Layout Component
 */

import Link from 'next/link';
import { useRouter } from 'next/router';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Wrench, 
  LogOut,
  Bug,
  Settings,
  Search,
  Bell,
  Zap
} from 'lucide-react';
import { useAuth } from '../store/auth';

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/jobs', label: 'Jobs', icon: FolderKanban },
  { href: '/tools', label: 'Tools', icon: Wrench },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-72 bg-gray-900/95 backdrop-blur-xl border-r border-gray-800/50 fixed h-full flex flex-col">
        {/* Logo */}
        <div className="p-6">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-xl shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-shadow">
              <Bug className="text-white" size={24} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white glow-text">Invariant Hunter</h1>
              <p className="text-xs text-gray-500">Smart Contract Testing</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-2">
          <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Menu</p>
          <ul className="space-y-1">
            {navItems.map(item => {
              const isActive = router.pathname === item.href || 
                (item.href !== '/' && router.pathname.startsWith(item.href));
              const Icon = item.icon;
              
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`sidebar-link ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={20} />
                    <span>{item.label}</span>
                    {isActive && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Quick Actions */}
          <div className="mt-8">
            <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Actions</p>
            <div className="px-3 py-2">
              <button className="w-full btn btn-primary text-sm">
                <Zap size={16} />
                New Fuzzing Job
              </button>
            </div>
          </div>
        </nav>

        {/* User Section */}
        <div className="p-4 border-t border-gray-800/50 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-600 flex items-center justify-center text-white font-semibold">
              {user?.email?.[0]?.toUpperCase() || 'G'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.email || 'Guest'}</p>
              <p className="text-xs text-gray-500">Free Plan</p>
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72">
        {/* Top Bar */}
        <header className="h-16 bg-gray-900/80 backdrop-blur-xl border-b border-gray-800/50 flex items-center px-6 sticky top-0 z-40">
          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Search jobs, contracts..."
                className="w-full pl-10 pr-4 py-2 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-transparent"
              />
              <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 text-xs text-gray-500 bg-gray-700/50 rounded">⌘K</kbd>
            </div>
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition relative">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-cyan-500 rounded-full"></span>
            </button>
            <div className="w-px h-6 bg-gray-800 mx-2"></div>
            <a 
              href="https://docs.invarianthunter.xyz" 
              target="_blank" 
              rel="noopener"
              className="text-gray-400 hover:text-white text-sm px-3 py-2 hover:bg-gray-800 rounded-lg transition"
            >
              Docs
            </a>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
