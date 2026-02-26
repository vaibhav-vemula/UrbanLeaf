'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { connectWallet, getCurrentAddress } from '@/lib/wallet';
import { createInitialAccount } from '@/lib/supabase';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  network: string;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  isConnected: false,
  connect: async () => {},
  disconnect: () => {},
  network: 'arbitrum_sepolia',
});

export function useWallet() {
  return useContext(WalletContext);
}

export default function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const network = 'arbitrum_sepolia';

  useEffect(() => {
    const restore = async () => {
      try {
        const saved = localStorage.getItem('wallet_address');
        if (!saved) return;

        const current = await getCurrentAddress();
        if (current && current.toLowerCase() === saved.toLowerCase()) {
          setAddress(current);
          setIsConnected(true);
          await createInitialAccount(current);
        } else {
          localStorage.removeItem('wallet_address');
        }
      } catch {
        localStorage.removeItem('wallet_address');
      }
    };

    restore();

    // Listen for account changes in MetaMask
    if (typeof window !== 'undefined' && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          setAddress(null);
          setIsConnected(false);
          localStorage.removeItem('wallet_address');
        } else {
          const addr = accounts[0].toLowerCase();
          setAddress(addr);
          setIsConnected(true);
          localStorage.setItem('wallet_address', addr);
        }
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      return () => window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
    }
  }, []);

  const connect = async () => {
    const addr = await connectWallet();
    setAddress(addr);
    setIsConnected(true);
    localStorage.setItem('wallet_address', addr);
    await createInitialAccount(addr);
  };

  const disconnect = () => {
    setAddress(null);
    setIsConnected(false);
    localStorage.removeItem('wallet_address');
  };

  return (
    <WalletContext.Provider value={{ address, isConnected, connect, disconnect, network }}>
      {children}
    </WalletContext.Provider>
  );
}
