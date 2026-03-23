/**
 * Login Page (disabled in development mode)
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { Bug } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();

  // In development, redirect to dashboard (login is bypassed)
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      router.replace('/');
      return;
    }
  }, [router]);

  // Show minimal placeholder while redirecting in dev, or 404 in production if you remove the route
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <Bug className="mx-auto mb-4 text-cyan-500" size={48} />
        <p>Redirecting...</p>
      </div>
    </div>
  );
}
