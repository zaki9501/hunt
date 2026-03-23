/**
 * Next.js App Component
 */

import type { AppProps } from 'next/app';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from '../store/auth';
import '../styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
    },
  },
});

const PUBLIC_PATHS = ['/login'];

function AuthInitializer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { initialize, initialized, user } = useAuth();

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Redirect to login when not authenticated on protected pages
  useEffect(() => {
    if (!initialized || !router.isReady) return;
    const isPublic = PUBLIC_PATHS.some((path) => router.pathname === path || router.pathname.startsWith(`${path}/`));
    if (!user && !isPublic) {
      router.replace('/login');
    }
  }, [initialized, user, router.pathname, router.isReady, router]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-cyan-400">Loading...</div>
      </div>
    );
  }

  // Don't render protected content while redirecting to login
  const isPublic = PUBLIC_PATHS.some((path) => router.pathname === path || router.pathname.startsWith(`${path}/`));
  if (!user && !isPublic) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-cyan-400">Redirecting to login...</div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function App({ Component, pageProps }: AppProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthInitializer>
        <Component {...pageProps} />
      </AuthInitializer>
    </QueryClientProvider>
  );
}
