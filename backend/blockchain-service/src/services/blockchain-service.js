import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BlockchainService {
  constructor() {
    this.network = 'arbitrum_sepolia';
    this.chainId = 421614;
    this.rpcUrl = process.env.ARBITRUM_SEPOLIA_RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
    this.privateKey = process.env.PRIVATE_KEY;
    this.contractAddress = process.env.CONTRACT_ADDRESS;
    this.explorerBase = 'https://sepolia.arbiscan.io';

    this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
    this.wallet = new ethers.Wallet(this.privateKey, this.provider);

    const abiPath = path.join(__dirname, '../../artifacts/contracts/UrbanLeafCommunity.sol/UrbanLeafCommunity.json');
    if (fs.existsSync(abiPath)) {
      const artifact = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
      this.abi = artifact.abi;
    } else {
      console.warn('Contract ABI not found. Run npm run compile first.');
      this.abi = [];
    }

    if (this.contractAddress && this.abi.length > 0) {
      this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
    }

    console.log('\n=== Blockchain Service initialized ===');
    console.log(`Network: Arbitrum Sepolia (chainId: ${this.chainId})`);
    console.log(`RPC: ${this.rpcUrl}`);
    console.log(`Deployer: ${this.wallet.address}`);
    console.log(`Contract: ${this.contractAddress || 'Not deployed'}`);
    console.log('======================================\n');
  }

  async getBalance() {
    const balance = await this.provider.getBalance(this.wallet.address);
    return ethers.formatEther(balance);
  }

  async createProposal(proposalData) {
    if (!this.contract) throw new Error('Contract not deployed');

    const {
      parkName, parkId, description, endDate,
      environmentalData, demographics, creator,
      fundraisingEnabled, fundingGoal
    } = proposalData;

    const tx = await this.contract.createProposal(
      parkName,
      parkId,
      description,
      endDate,
      [
        environmentalData.ndviBefore,
        environmentalData.ndviAfter,
        environmentalData.pm25Before,
        environmentalData.pm25After,
        environmentalData.pm25IncreasePercent,
        environmentalData.vegetationLossPercent
      ],
      [
        demographics.children,
        demographics.adults,
        demographics.seniors,
        demographics.totalAffectedPopulation
      ],
      creator || this.wallet.address,
      fundraisingEnabled || false,
      fundingGoal || 0
    );

    const receipt = await tx.wait();

    // Extract the proposalId from the ProposalCreated event so the backend
    // can pass it to the CRE scoring workflow
    let proposalId = null;
    for (const log of receipt.logs) {
      try {
        const parsed = this.contract.interface.parseLog(log);
        if (parsed && parsed.name === 'ProposalCreated') {
          proposalId = Number(parsed.args.proposalId);
          break;
        }
      } catch {
        // log not from this contract — skip
      }
    }

    return {
      success: true,
      proposalId,
      transactionHash: receipt.hash,
      status: receipt.status === 1 ? 'SUCCESS' : 'FAILED',
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  async submitVote(proposalId, vote, voter) {
    if (!this.contract) throw new Error('Contract not deployed');

    const tx = await this.contract.vote(proposalId, vote, voter);
    const receipt = await tx.wait();

    return {
      success: true,
      transactionHash: receipt.hash,
      status: receipt.status === 1 ? 'SUCCESS' : 'FAILED',
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  async getProposal(proposalId) {
    if (!this.contract) throw new Error('Contract not deployed');

    try {
      const proposal = await this.contract.getProposal(proposalId);

      return {
        success: true,
        proposal: {
          id: Number(proposal.id),
          parkName: proposal.parkName,
          parkId: proposal.parkId,
          description: proposal.description,
          endDate: Number(proposal.endDate),
          status: Number(proposal.status),
          yesVotes: Number(proposal.yesVotes),
          noVotes: Number(proposal.noVotes),
          environmentalData: {
            ndviBefore: Number(proposal.environmentalData.ndviBefore),
            ndviAfter: Number(proposal.environmentalData.ndviAfter),
            pm25Before: Number(proposal.environmentalData.pm25Before),
            pm25After: Number(proposal.environmentalData.pm25After),
            pm25IncreasePercent: Number(proposal.environmentalData.pm25IncreasePercent),
            vegetationLossPercent: Number(proposal.environmentalData.vegetationLossPercent)
          },
          demographics: {
            children: Number(proposal.demographics.children),
            adults: Number(proposal.demographics.adults),
            seniors: Number(proposal.demographics.seniors),
            totalAffectedPopulation: Number(proposal.demographics.totalAffectedPopulation)
          },
          creator: proposal.creatorAccountId,
          fundingGoal: Number(proposal.fundingGoal),
          totalFundsRaised: Number(proposal.totalFundsRaised),
          fundingEnabled: Boolean(proposal.fundingEnabled),
          // CRE AI score fields — written on-chain by the CRE scoring workflows
          aiEnvironmentalScore: Number(proposal.aiEnvironmentalScore),
          aiUrgencyLevel: proposal.aiUrgencyLevel,
          aiInsight: proposal.aiInsight,
          aiScored: Boolean(proposal.aiScored)
        }
      };
    } catch (error) {
      if (error.message?.includes('Proposal does not exist')) return null;
      throw error;
    }
  }

  async getAllActiveProposals() {
    if (!this.contract) throw new Error('Contract not deployed');
    try {
      const ids = await this.contract.getAllActiveProposals();
      return { success: true, proposalIds: ids.map(Number) };
    } catch {
      return { success: true, proposalIds: [] };
    }
  }

  async getAllAcceptedProposals() {
    if (!this.contract) throw new Error('Contract not deployed');
    try {
      const ids = await this.contract.getAllAcceptedProposals();
      return { success: true, proposalIds: ids.map(Number) };
    } catch {
      return { success: true, proposalIds: [] };
    }
  }

  async getAllRejectedProposals() {
    if (!this.contract) throw new Error('Contract not deployed');
    try {
      const ids = await this.contract.getAllRejectedProposals();
      return { success: true, proposalIds: ids.map(Number) };
    } catch {
      return { success: true, proposalIds: [] };
    }
  }

  async hasUserVoted(proposalId, userAddress) {
    if (!this.contract) throw new Error('Contract not deployed');
    const voted = await this.contract.hasUserVoted(proposalId, userAddress);
    return { success: true, hasVoted: voted };
  }

  async closeProposal(proposalId) {
    if (!this.contract) throw new Error('Contract not deployed');

    const proposal = await this.contract.getProposal(proposalId);
    const votingEnded = Date.now() > Number(proposal.endDate) * 1000;

    let tx;
    if (votingEnded) {
      tx = await this.contract.updateProposalStatus(proposalId);
    } else {
      const newStatus = Number(proposal.yesVotes) > Number(proposal.noVotes) ? 1 : 2;
      tx = await this.contract.forceCloseProposal(proposalId, newStatus);
    }

    const receipt = await tx.wait();
    return {
      success: true,
      transactionHash: receipt.hash,
      status: receipt.status === 1 ? 'SUCCESS' : 'FAILED'
    };
  }

  async setFundingGoal(proposalId, goalInEth) {
    if (!this.contract) throw new Error('Contract not deployed');
    const goalInWei = ethers.parseEther(goalInEth.toString());
    const tx = await this.contract.setFundingGoal(proposalId, goalInWei);
    const receipt = await tx.wait();
    return { success: true, transactionHash: receipt.hash, goal: goalInEth };
  }

  async donateToProposal(proposalId, amountInEth) {
    if (!this.contract) throw new Error('Contract not deployed');
    const tx = await this.contract.donateToProposal(proposalId, {
      value: ethers.parseEther(amountInEth.toString())
    });
    const receipt = await tx.wait();
    return {
      success: true,
      transactionHash: receipt.hash,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  async getDonationProgress(proposalId) {
    if (!this.contract) throw new Error('Contract not deployed');
    const [raised, goal, percentage] = await this.contract.getDonationProgress(proposalId);
    return {
      success: true,
      raised: parseFloat(ethers.formatEther(raised)),
      goal: parseFloat(ethers.formatEther(goal)),
      percentage: Number(percentage)
    };
  }

  async withdrawFunds(proposalId, recipientAddress) {
    if (!this.contract) throw new Error('Contract not deployed');
    const tx = await this.contract.withdrawFunds(proposalId, recipientAddress);
    const receipt = await tx.wait();
    return {
      success: true,
      transactionHash: receipt.hash,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  async getUserBalances(userAddress) {
    const ethBalance = await this.provider.getBalance(userAddress);
    return {
      success: true,
      balances: {
        eth: parseFloat(ethers.formatEther(ethBalance))
      }
    };
  }
}
