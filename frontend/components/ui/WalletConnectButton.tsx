'use client';

import { useRouter } from 'next/navigation';
import { useWallet } from '../providers/WalletProvider';

export default function WalletConnectButton() {
  const router = useRouter();
  const { address, isConnected, connect, disconnect } = useWallet();

  const handleConnect = async () => {
    try {
      await connect();
    } catch (error) {
      console.error('Wallet connection failed:', error);
      alert('Failed to connect wallet. Please make sure MetaMask is installed.');
    }
  };

  const handleWalletClick = () => {
    router.push('/profile');
  };

  if (isConnected && address) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handleWalletClick}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer"
          title="Go to Profile"
        >
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
          <span className="text-sm font-mono">
            {address.slice(0, 6)}...{address.slice(-4)}
          </span>
          <span className="text-xs text-gray-400">(MetaMask)</span>
        </button>
        <button
          onClick={disconnect}
          className="px-4 py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      className="px-6 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-medium rounded-lg transition-all duration-200 shadow-lg hover:shadow-xl"
    >
      Connect MetaMask
    </button>
  );
}
