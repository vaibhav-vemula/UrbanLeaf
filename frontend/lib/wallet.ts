import { ethers } from 'ethers';

const BLOCKCHAIN_SERVICE_URL = process.env.NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL || 'http://localhost:5000';
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '';

// Arbitrum Sepolia chain config
const ARBITRUM_SEPOLIA = {
  chainId: '0x66EEE', // 421614
  chainName: 'Arbitrum Sepolia',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
  rpcUrls: ['https://sepolia-rollup.arbitrum.io/rpc'],
  blockExplorerUrls: ['https://sepolia.arbiscan.io'],
};

/**
 * Switch MetaMask to Arbitrum Sepolia, adding it if needed
 */
export async function switchToArbitrumSepolia(): Promise<void> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask not installed');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ARBITRUM_SEPOLIA.chainId }],
    });
  } catch (switchError: any) {
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [ARBITRUM_SEPOLIA],
      });
    } else {
      throw switchError;
    }
  }
}

/**
 * Connect MetaMask and switch to Arbitrum Sepolia
 */
export async function connectWallet(): Promise<string> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask not installed. Please install MetaMask to continue.');
  }

  // wallet_requestPermissions always opens MetaMask, even if already connected
  await window.ethereum.request({
    method: 'wallet_requestPermissions',
    params: [{ eth_accounts: {} }],
  });

  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned from MetaMask');
  }

  // Ensure we're on Arbitrum Sepolia
  const provider = new ethers.BrowserProvider(window.ethereum);
  const network = await provider.getNetwork();
  if (Number(network.chainId) !== 421614) {
    await switchToArbitrumSepolia();
  }

  return accounts[0].toLowerCase();
}

/**
 * Get currently connected wallet address
 */
export async function getCurrentAddress(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.ethereum) return null;

  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.listAccounts();
    return accounts[0]?.address?.toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Get ethers provider and signer
 */
export async function getSigner(): Promise<ethers.Signer> {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask not installed');
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  return provider.getSigner();
}

// Minimal ABI for the voting and donation contract functions
const CONTRACT_ABI = [
  {
    inputs: [
      { internalType: 'uint64', name: 'proposalId', type: 'uint64' },
      { internalType: 'bool', name: 'voteValue', type: 'bool' },
      { internalType: 'address', name: 'voter', type: 'address' },
    ],
    name: 'vote',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'uint64', name: 'proposalId', type: 'uint64' }],
    name: 'donateToProposal',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
];

/**
 * Submit a vote on a proposal via MetaMask
 */
export async function voteOnProposal(proposalId: number, vote: 'yes' | 'no'): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured');
  const signer = await getSigner();
  const signerAddress = await signer.getAddress();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tx = await contract.vote(proposalId, vote === 'yes', signerAddress);
  await tx.wait();
  return tx.hash as string;
}

/**
 * Donate ETH to an accepted proposal via MetaMask
 */
export async function donateToProposal(proposalId: number, amountInEth: number): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured');
  const signer = await getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tx = await contract.donateToProposal(proposalId, {
    value: ethers.parseEther(amountInEth.toString()),
  });
  await tx.wait();
  return tx.hash as string;
}

/**
 * Check if user has voted on a proposal
 */
export async function hasUserVoted(proposalId: number, userAddress: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${BLOCKCHAIN_SERVICE_URL}/api/contract/has-voted/${proposalId}/${userAddress}`
    );
    const result = await response.json();
    return result.success ? result.hasVoted : false;
  } catch {
    return false;
  }
}

/**
 * Get ETH balance for an address
 */
export async function getUserBalance(address: string): Promise<string> {
  try {
    const response = await fetch(`${BLOCKCHAIN_SERVICE_URL}/api/balances/${address}`);
    const result = await response.json();
    if (result.success) {
      return `${result.balances.eth} ETH`;
    }
    return '0 ETH';
  } catch {
    return '0 ETH';
  }
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
