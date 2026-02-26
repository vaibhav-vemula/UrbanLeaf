'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '../providers/WalletProvider';
import { Wallet, LogOut } from 'lucide-react';

export default function WalletStatus() {
  const router = useRouter();
  const { address, isConnected, disconnect } = useWallet();

  if (!isConnected || !address) {
    return null;
  }

  const shortenAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleWalletClick = () => {
    router.push('/profile');
  };

  return (
    <div className="fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 bg-slate-900/90 backdrop-blur-md border-2 border-emerald-500/30 rounded-full shadow-lg">
      <button
        onClick={handleWalletClick}
        className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
        title="Go to Profile"
      >
        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
        <Wallet size={18} className="text-emerald-400" />
        <span className="text-sm font-semibold text-gray-200">
          {shortenAddress(address)}
        </span>
      </button>

      <button
        onClick={() => { disconnect(); router.push('/'); }}
        className="ml-2 p-1.5 hover:bg-red-500/20 rounded-full transition-colors group"
        title="Disconnect Wallet"
      >
        <LogOut size={16} className="text-gray-400 group-hover:text-red-400 transition-colors" />
      </button>
    </div>
  );
}
