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

const USDC_ADDRESS = '0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d';
const USDC_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
];

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
    inputs: [
      { internalType: 'uint64', name: 'proposalId', type: 'uint64' },
      { internalType: 'uint256', name: 'amount', type: 'uint256' },
    ],
    name: 'donateToProposal',
    outputs: [],
    stateMutability: 'nonpayable',
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
 * Donate USDC to an accepted proposal via MetaMask (approve + donate)
 */
export async function donateToProposal(proposalId: number, amountInUsdc: number): Promise<string> {
  if (!CONTRACT_ADDRESS) throw new Error('Contract address not configured');
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  // Fetch live fee data and add 50% buffer so maxFeePerGas always exceeds baseFee
  const feeData = await provider.getFeeData();
  const txOverrides = feeData.maxFeePerGas
    ? {
        maxFeePerGas: (feeData.maxFeePerGas * 150n) / 100n,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? 1000000n,
      }
    : {};

  const amount = ethers.parseUnits(amountInUsdc.toString(), 6);
  // Step 1: Approve USDC spend
  const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
  const approveTx = await usdc.approve(CONTRACT_ADDRESS, amount, txOverrides);
  await approveTx.wait();
  // Step 2: Donate
  const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
  const tx = await contract.donateToProposal(proposalId, amount, txOverrides);
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
