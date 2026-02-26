import { AgentResponse } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function sendAgentMessage(
  message: string,
  sessionId?: string,
  selectedParkId?: string,
  walletAddress?: string
): Promise<AgentResponse> {
  const response = await fetch(`${API_URL}/api/agent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      sessionId,
      uiContext: selectedParkId ? { selectedParkId } : undefined,
      walletAddress,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send message');
  }

  return response.json();
}

export async function getProposals() {
  const response = await fetch(`${API_URL}/api/proposals`);

  if (!response.ok) {
    throw new Error('Failed to fetch proposals');
  }

  return response.json();
}

export async function getProposalDetails(proposalId: number) {
  const response = await fetch(`${API_URL}/api/proposals/${proposalId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch proposal details');
  }

  return response.json();
}

export async function getParksByZipcode(zipcode: string) {
  const response = await fetch(`${API_URL}/api/parks/${zipcode}`);

  if (!response.ok) {
    throw new Error('Failed to fetch parks');
  }

  return response.json();
}

// Blockchain service URL for contract interactions
const BLOCKCHAIN_SERVICE_URL = process.env.NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL || 'http://localhost:5000';

/**
 * Get donation progress for a proposal
 */
export async function getDonationProgress(proposalId: number) {
  const response = await fetch(`${BLOCKCHAIN_SERVICE_URL}/api/contract/donation-progress/${proposalId}`);

  if (!response.ok) {
    throw new Error('Failed to fetch donation progress');
  }

  return response.json();
}


