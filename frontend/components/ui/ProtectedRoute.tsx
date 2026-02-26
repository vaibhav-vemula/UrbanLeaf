'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '../providers/WalletProvider';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isConnected } = useWallet();

  useEffect(() => {
    // Redirect to landing page if not connected
    if (!isConnected) {
      router.push('/');
    }
  }, [isConnected, router]);

  // Redirect to landing if not connected
  if (!isConnected) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-emerald-400 mb-4 mx-auto" size={56} />
          <p className="text-gray-400 font-medium">Redirecting to connect wallet...</p>
        </div>
      </div>
    );
  }

  // User is authenticated, show the page
  return <>{children}</>;
}
