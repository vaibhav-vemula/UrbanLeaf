'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, ThumbsUp, ThumbsDown, Clock, CheckCircle2, XCircle, X, Loader2, TrendingDown, Users, Leaf, DollarSign, Target, TrendingUp, Brain, AlertTriangle, ShieldAlert, ShieldCheck, ShieldCheck as WorldIdIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/components/providers/WalletProvider';
import { getProposals, getProposalDetails, getDonationProgress } from '@/lib/api';
import { hasUserVoted, donateToProposal } from '@/lib/wallet';
import { IDKitRequestWidget, deviceLegacy } from '@worldcoin/idkit';
import type { IDKitResult, RpContext } from '@worldcoin/idkit';
import CustomCursor from '@/components/ui/CustomCursor';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import WalletStatus from '@/components/ui/WalletStatus';

const BLOCKCHAIN_SERVICE_URL = process.env.NEXT_PUBLIC_BLOCKCHAIN_SERVICE_URL || 'http://localhost:5000';
const WORLD_ID_APP_ID = (process.env.NEXT_PUBLIC_WORLD_ID_APP_ID || 'app_staging_YOUR_APP_ID') as `app_${string}`;
// When set, World ID proofs are verified by the Chainlink CRE workflow (off-chain DON consensus)
// rather than the backend directly — enabling World ID on Arbitrum Sepolia via CRE.
const CRE_VERIFY_URL = process.env.NEXT_PUBLIC_CRE_VERIFY_URL || null;

type ProposalStatus = 'active' | 'passed' | 'rejected';
type TabType = 'active' | 'accepted' | 'rejected';

interface Proposal {
  id: number;
  parkName: string;
  parkId: string;
  description: string;
  status: ProposalStatus | number;
  yesVotes: number;
  noVotes: number;
  totalVotes: number;
  endDate: number;
  creator: string;
  fundingGoal?: number;
  totalFundsRaised?: number;
  fundingEnabled?: boolean;
  environmentalData?: {
    ndviBefore: number;
    ndviAfter: number;
    pm25Before: number;
    pm25After: number;
    pm25IncreasePercent: number;
    vegetationLossPercent: number;
  };
  demographics?: {
    children: number;
    adults: number;
    seniors: number;
    totalAffectedPopulation: number;
  };
  aiEnvironmentalScore?: number;
  aiUrgencyLevel?: string;
  aiInsight?: string;
  aiScored?: boolean;
}

interface DonationProgress {
  raised: number;
  goal: number;
  percentage: number;
}

// Convert numeric status from contract to string
const normalizeStatus = (status: ProposalStatus | number): ProposalStatus => {
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'active';
      case 1: return 'passed';
      case 2: return 'rejected';
      default: return 'active';
    }
  }
  return status;
};

export default function ProposalPage() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [pendingVote, setPendingVote] = useState<'yes' | 'no' | null>(null);
  const [worldIdOpen, setWorldIdOpen] = useState(false);
  const [rpContext, setRpContext] = useState<RpContext | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [checkingVoteStatus, setCheckingVoteStatus] = useState(false);
  const [voteSuccess, setVoteSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState<string | null>(null);

  // Donation modal state
  const [showDonateModal, setShowDonateModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState('');
  const [donating, setDonating] = useState(false);
  const [donationProgress, setDonationProgress] = useState<DonationProgress | null>(null);
  const [showDonationResultModal, setShowDonationResultModal] = useState(false);
  const [donationResult, setDonationResult] = useState({ success: false, message: '', txId: '', amount: '' });
  const [paymentMethod, setPaymentMethod] = useState<'eth' | 'usdc' | 'card'>('eth');

  // Fetch proposals on mount
  useEffect(() => {
    fetchProposals();
  }, []);

  const fetchProposals = async () => {
    setLoading(true);
    try {
      const data = await getProposals();
      if (data && data.proposals) {
        setProposals(data.proposals);
      }
    } catch (error) {
      console.error('Error fetching proposals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProposalClick = async (proposalId: number) => {
    try {
      const data = await getProposalDetails(proposalId);
      if (data && data.proposal) {
        setSelectedProposal(data.proposal);

        // Check if current user has voted on this proposal
        if (address) {
          setCheckingVoteStatus(true);
          const voted = await hasUserVoted(proposalId, address);
          setHasVoted(voted);
          setCheckingVoteStatus(false);
        }

        // Fetch donation progress if it's an accepted proposal
        if (normalizeStatus(data.proposal.status) === 'passed') {
          try {
            const progress = await getDonationProgress(proposalId);
            if (progress.success) {
              setDonationProgress({
                raised: progress.raised || 0,
                goal: progress.goal || 0,
                percentage: progress.percentage || 0
              });
            }
          } catch (error) {
            console.error('Error fetching donation progress:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching proposal details:', error);
      setCheckingVoteStatus(false);
    }
  };

  // Step 1: Fetch a fresh rp_context from backend, then open the World ID modal.
  const handleVoteClick = async (vote: 'yes' | 'no') => {
    if (!selectedProposal || !address) return;
    setPendingVote(vote);
    try {
      const res = await fetch(`${BLOCKCHAIN_SERVICE_URL}/api/contract/world-id/request?action=urbanleaf-vote`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to get RP context');
      setRpContext(data.rp_context);
      setWorldIdOpen(true);
    } catch (error: any) {
      console.error('World ID init error:', error);
      alert(`Failed to initialize World ID verification: ${error?.message || 'Unknown error'}`);
      setPendingVote(null);
    }
  };

  // Step 2: Called by IDKitRequestWidget after World App returns the proof.
  // Routes through Chainlink CRE (preferred) for off-chain World ID verification
  // on Arbitrum Sepolia, falling back to direct backend verification.
  const handleVerify = async (result: IDKitResult) => {
    if (!pendingVote || !selectedProposal || !address || !rpContext) return;

    const payload = {
      proposalId: String(selectedProposal.id),
      vote: pendingVote === 'yes',
      voter: address,
      idkitResult: result,
      rp_id: rpContext.rp_id,
    };

    // Primary path: CRE workflow verifies the World ID proof off-chain (DON consensus)
    // and casts the vote on Arbitrum Sepolia via /api/contract/cast-verified-vote.
    const url = CRE_VERIFY_URL
      ? CRE_VERIFY_URL
      : `${BLOCKCHAIN_SERVICE_URL}/api/contract/vote-world-id`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.success) throw new Error(data.error || 'Vote submission failed');
    setTransactionId(data.transactionHash || data.txHash);
  };

  // Step 3: Called by IDKitRequestWidget after handleVerify resolves — update UI.
  const onWorldIdSuccess = () => {
    setVoteSuccess(true);
    setHasVoted(true);
    setWorldIdOpen(false);
    setRpContext(null);
    setPendingVote(null);
    setTimeout(() => { fetchProposals(); }, 2000);
  };

  const handleDonate = async () => {
    if (!selectedProposal || !donationAmount || parseFloat(donationAmount) <= 0) {
      setDonationResult({
        success: false,
        message: 'Please enter a valid donation amount',
        txId: '',
        amount: ''
      });
      setShowDonationResultModal(true);
      return;
    }

    setDonating(true);
    setShowDonateModal(false);

    try {
      console.log(`Donating ${donationAmount} ETH to proposal ${selectedProposal.id}`);

      // Submit donation transaction to Arbitrum via MetaMask
      const txId = await donateToProposal(selectedProposal.id, parseFloat(donationAmount));

      console.log('Donation transaction successful:', txId);

      // Show success modal
      setDonationResult({
        success: true,
        message: 'Your donation has been successfully processed!',
        txId: txId,
        amount: donationAmount
      });
      setShowDonationResultModal(true);

      // Reset form
      setDonationAmount('');

      // Refresh donation progress
      const progress = await getDonationProgress(selectedProposal.id);
      if (progress.success) {
        setDonationProgress({
          raised: progress.raised || 0,
          goal: progress.goal || 0,
          percentage: progress.percentage || 0
        });
      }

      // Refresh proposals after a delay
      setTimeout(() => {
        fetchProposals();
      }, 2000);

    } catch (error: any) {
      console.error('Error donating:', error);

      // Show error modal
      const errorMessage = error?.message || 'Failed to process donation';
      setDonationResult({
        success: false,
        message: `Donation failed: ${errorMessage}. Please make sure your MetaMask wallet is connected to Arbitrum Sepolia.`,
        txId: '',
        amount: donationAmount
      });
      setShowDonationResultModal(true);
    } finally {
      setDonating(false);
    }
  };

  const getStatusColor = (status: ProposalStatus) => {
    switch (status) {
      case 'active':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'passed':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'rejected':
        return 'bg-red-100 text-red-700 border-red-200';
    }
  };

  const getStatusIcon = (status: ProposalStatus) => {
    switch (status) {
      case 'active':
        return <Clock size={16} />;
      case 'passed':
        return <CheckCircle2 size={16} />;
      case 'rejected':
        return <XCircle size={16} />;
    }
  };

  const getUrgencyStyle = (level?: string) => {
    switch (level) {
      case 'Critical': return { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/40', bar: 'from-red-500 to-red-600' };
      case 'High':     return { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/40', bar: 'from-orange-500 to-amber-500' };
      case 'Medium':   return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/40', bar: 'from-yellow-500 to-yellow-400' };
      case 'Low':      return { bg: 'bg-teal-500/20', text: 'text-teal-400', border: 'border-teal-500/40', bar: 'from-teal-500 to-emerald-500' };
      default:         return { bg: 'bg-slate-700/40', text: 'text-slate-400', border: 'border-slate-600/40', bar: 'from-slate-500 to-slate-400' };
    }
  };

  const getUrgencyIcon = (level?: string) => {
    switch (level) {
      case 'Critical': return <ShieldAlert size={14} />;
      case 'High':     return <AlertTriangle size={14} />;
      case 'Medium':   return <Brain size={14} />;
      case 'Low':      return <ShieldCheck size={14} />;
      default:         return <Brain size={14} />;
    }
  };

  // Filter proposals based on active tab
  const filteredProposals = proposals.filter(proposal => {
    const status = normalizeStatus(proposal.status);
    if (activeTab === 'active') return status === 'active';
    if (activeTab === 'accepted') return status === 'passed';
    if (activeTab === 'rejected') return status === 'rejected';
    return false;
  });

  return (
    <ProtectedRoute>
      <WalletStatus />
      <CustomCursor />
      <div className="min-h-screen bg-slate-950 py-8 px-4 relative">
        {/* Back Button - Top Left Corner */}
        <button
          onClick={() => router.push('/options')}
          className="absolute top-6 left-6 z-20 group flex items-center gap-2 px-5 py-2.5 bg-slate-800/90 backdrop-blur-md text-gray-300 hover:text-white rounded-full border-2 border-emerald-500/30 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-600"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
          <span className="font-semibold text-sm">Back</span>
        </button>

      {/* Header */}
      <div className="max-w-6xl mx-auto mb-10 pt-16">

        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 bg-clip-text text-transparent mb-3">
            Community Proposals
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Vote on proposals affecting urban green spaces in your community
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 justify-center mb-6">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'active'
                ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25'
                : 'bg-slate-800/50 text-gray-400 hover:bg-slate-800 hover:text-gray-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Clock size={18} />
              <span>Active</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {proposals.filter(p => normalizeStatus(p.status) === 'active').length}
              </span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('accepted')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'accepted'
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                : 'bg-slate-800/50 text-gray-400 hover:bg-slate-800 hover:text-gray-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 size={18} />
              <span>Accepted</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {proposals.filter(p => normalizeStatus(p.status) === 'passed').length}
              </span>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('rejected')}
            className={`px-6 py-3 rounded-xl font-semibold transition-all ${
              activeTab === 'rejected'
                ? 'bg-red-500 text-white shadow-lg shadow-red-500/25'
                : 'bg-slate-800/50 text-gray-400 hover:bg-slate-800 hover:text-gray-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <XCircle size={18} />
              <span>Rejected</span>
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs">
                {proposals.filter(p => normalizeStatus(p.status) === 'rejected').length}
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* Proposals Grid */}
      <div className="max-w-6xl mx-auto">
        {loading ? (
          <div className="flex flex-col justify-center items-center py-32">
            <Loader2 className="animate-spin text-emerald-400 mb-4" size={56} />
            <p className="text-gray-400 font-medium">Loading proposals...</p>
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Leaf size={40} className="text-emerald-400" />
            </div>
            <p className="text-xl font-semibold text-gray-200 mb-2">No {activeTab} proposals found</p>
            <p className="text-gray-400">Check back later or switch to another tab</p>
          </div>
        ) : (
          <div className="space-y-5">
            {filteredProposals.map((proposal) => {
              const totalVotes = proposal.yesVotes + proposal.noVotes;
              const votePercentage = totalVotes > 0 ? (proposal.yesVotes / totalVotes) * 100 : 0;
              const totalPopulation = proposal.demographics
                ? proposal.demographics.children + proposal.demographics.adults + proposal.demographics.seniors
                : 0;

              return (
                <div
                  key={proposal.id}
                  onClick={() => handleProposalClick(proposal.id)}
                  className="group bg-slate-900/80 backdrop-blur-sm rounded-2xl p-6 border-2 border-slate-700 hover:border-emerald-400 shadow-md hover:shadow-2xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2 flex-wrap">
                        <h3 className="text-2xl font-bold text-gray-100 group-hover:text-emerald-400 transition-colors">
                          {proposal.parkName}
                        </h3>
                        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 ${getStatusColor(normalizeStatus(proposal.status))}`}>
                          {getStatusIcon(normalizeStatus(proposal.status))}
                          {normalizeStatus(proposal.status).charAt(0).toUpperCase() + normalizeStatus(proposal.status).slice(1)}
                        </span>
                        {/* CRE AI Urgency Badge */}
                        {proposal.aiScored ? (
                          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border ${getUrgencyStyle(proposal.aiUrgencyLevel).bg} ${getUrgencyStyle(proposal.aiUrgencyLevel).text} ${getUrgencyStyle(proposal.aiUrgencyLevel).border}`}>
                            {getUrgencyIcon(proposal.aiUrgencyLevel)}
                            {proposal.aiUrgencyLevel} · {proposal.aiEnvironmentalScore}/100
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border bg-slate-700/40 text-slate-400 border-slate-600/40">
                            <Brain size={12} className="animate-pulse" />
                            CRE Analyzing…
                          </span>
                        )}
                      </div>
                      <p className="text-gray-400 leading-relaxed line-clamp-2 mb-3">{proposal.description}</p>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {proposal.environmentalData && (
                      <>
                        <div className="bg-emerald-500/10 rounded-lg p-3 border border-emerald-500/30">
                          <div className="flex items-center gap-2 mb-1">
                            <Leaf size={16} className="text-emerald-400" />
                            <span className="text-xs font-semibold text-emerald-400">NDVI Loss</span>
                          </div>
                          <div className="text-lg font-bold text-emerald-300">
                            {proposal.environmentalData.vegetationLossPercent.toFixed(1)}%
                          </div>
                        </div>
                        <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
                          <div className="flex items-center gap-2 mb-1">
                            <TrendingDown size={16} className="text-red-400" />
                            <span className="text-xs font-semibold text-red-400">PM2.5 Increase</span>
                          </div>
                          <div className="text-lg font-bold text-red-300">
                            +{proposal.environmentalData.pm25IncreasePercent.toFixed(1)}%
                          </div>
                        </div>
                      </>
                    )}
                    <div className="bg-blue-500/10 rounded-lg p-3 border border-blue-500/30">
                      <div className="flex items-center gap-2 mb-1">
                        <Users size={16} className="text-blue-400" />
                        <span className="text-xs font-semibold text-blue-400">Affected</span>
                      </div>
                      <div className="text-lg font-bold text-blue-300">
                        {totalPopulation.toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {/* Vote Progress Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm font-bold mb-2">
                      <div className="flex items-center gap-2">
                        <ThumbsUp size={16} className="text-emerald-400" />
                        <span className="text-emerald-400">For: {proposal.yesVotes}</span>
                        {totalVotes > 0 && (
                          <span className="text-emerald-300/60">({votePercentage.toFixed(1)}%)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {totalVotes > 0 && (
                          <span className="text-red-300/60">({(100 - votePercentage).toFixed(1)}%)</span>
                        )}
                        <span className="text-red-400">Against: {proposal.noVotes}</span>
                        <ThumbsDown size={16} className="text-red-400" />
                      </div>
                    </div>
                    {totalVotes > 0 ? (
                      <div className="h-4 bg-red-500/20 rounded-full overflow-hidden shadow-inner relative">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500 absolute left-0"
                          style={{ width: `${votePercentage}%` }}
                        ></div>
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500 absolute right-0"
                          style={{ width: `${100 - votePercentage}%` }}
                        ></div>
                      </div>
                    ) : (
                      <div className="h-4 bg-slate-800 rounded-full overflow-hidden shadow-inner flex items-center justify-center">
                        <span className="text-xs text-gray-500 font-medium">No votes yet</span>
                      </div>
                    )}
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-xs text-gray-500">{totalVotes} total votes</span>
                      <span className="text-xs text-gray-500">Ends {new Date(proposal.endDate * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-700">
                    <span className="text-xs text-gray-500">
                      By {proposal.creator.substring(0, 8)}...{proposal.creator.substring(proposal.creator.length - 6)}
                    </span>
                    <span className="text-sm text-emerald-400 font-semibold group-hover:text-emerald-300">
                      View Details {activeTab === 'accepted' ? '& Donate' : activeTab === 'active' ? '& Vote' : ''} →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Proposal Details Modal */}
      {selectedProposal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setSelectedProposal(null)}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-8 max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto scrollbar-hide" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1">
                <h2 className="text-3xl font-bold text-gray-100 mb-2">{selectedProposal.parkName}</h2>
                <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(normalizeStatus(selectedProposal.status))}`}>
                  {getStatusIcon(normalizeStatus(selectedProposal.status))}
                  {normalizeStatus(selectedProposal.status).charAt(0).toUpperCase() + normalizeStatus(selectedProposal.status).slice(1)}
                </span>
              </div>
              <button onClick={() => setSelectedProposal(null)} className="text-gray-400 hover:text-gray-200 transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-2">Description</h3>
              <p className="text-gray-300 leading-relaxed">{selectedProposal.description}</p>
            </div>

            {/* Fundraising Section for Accepted Proposals */}
            {normalizeStatus(selectedProposal.status) === 'passed' && donationProgress && (
              <div className="mb-6 bg-gradient-to-br from-emerald-900/30 to-teal-900/30 border-2 border-emerald-500/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Target size={24} className="text-emerald-400" />
                  <h3 className="text-xl font-bold text-emerald-400">Support This Proposal</h3>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-300 font-semibold">
                      <DollarSign size={14} className="inline" />
                      {donationProgress.raised.toFixed(4)} ETH raised
                    </span>
                    <span className="text-gray-400">
                      Goal: {donationProgress.goal > 0 ? `${donationProgress.goal.toFixed(4)} ETH` : 'Not set'}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-6 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-emerald-500 to-teal-500 h-6 rounded-full transition-all duration-500 flex items-center justify-center"
                      style={{width: `${Math.min(donationProgress.percentage, 100)}%`}}
                    >
                      {donationProgress.percentage > 10 && (
                        <span className="text-xs font-bold text-white">{donationProgress.percentage.toFixed(0)}%</span>
                      )}
                    </div>
                  </div>
                  {donationProgress.percentage < 10 && donationProgress.percentage > 0 && (
                    <p className="text-xs text-emerald-400/70 mt-1 text-center">{donationProgress.percentage.toFixed(1)}% funded</p>
                  )}
                </div>

                {/* Donate Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDonateModal(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-105"
                >
                  <TrendingUp size={20} />
                  Donate to This Proposal
                </button>
              </div>
            )}

            {/* CRE AI Analysis */}
            {selectedProposal.aiScored ? (
              <div className="mb-6">
                <div className={`rounded-xl p-5 border ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).bg} ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).border}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Brain size={18} className={getUrgencyStyle(selectedProposal.aiUrgencyLevel).text} />
                      <span className={`text-sm font-bold uppercase tracking-wide ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).text}`}>
                        CRE AI Analysis
                      </span>
                    </div>
                    <span className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-bold border ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).bg} ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).text} ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).border}`}>
                      {getUrgencyIcon(selectedProposal.aiUrgencyLevel)}
                      {selectedProposal.aiUrgencyLevel}
                    </span>
                  </div>

                  {/* Score Bar */}
                  <div className="mb-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs text-gray-400">Environmental Urgency Score</span>
                      <span className={`text-2xl font-black ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).text}`}>
                        {selectedProposal.aiEnvironmentalScore}<span className="text-sm font-normal text-gray-500">/100</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${getUrgencyStyle(selectedProposal.aiUrgencyLevel).bar} rounded-full transition-all duration-700`}
                        style={{ width: `${selectedProposal.aiEnvironmentalScore}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] text-gray-600 mt-1">
                      <span>Low</span><span>Medium</span><span>High</span><span>Critical</span>
                    </div>
                  </div>

                  {/* AI Insight */}
                  {selectedProposal.aiInsight && (
                    <p className="text-sm text-gray-300 italic leading-relaxed">
                      "{selectedProposal.aiInsight}"
                    </p>
                  )}

                  <p className="text-[10px] text-gray-600 mt-3 flex items-center gap-1">
                    <span>⬡</span>
                    Scored by Chainlink CRE · Gemini 2.0 Flash · Written on-chain
                  </p>
                </div>
              </div>
            ) : (
              <div className="mb-6 rounded-xl p-4 border border-slate-700 bg-slate-800/40 flex items-center gap-3">
                <Brain size={20} className="text-slate-500 animate-pulse shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-slate-400">CRE AI Analysis Pending</p>
                  <p className="text-xs text-slate-500">The Chainlink CRE workflow is processing environmental data for this proposal.</p>
                </div>
              </div>
            )}

            {/* Environmental Data */}
            {selectedProposal.environmentalData && (
              <div className="mb-6 grid grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 p-4 rounded-lg border border-emerald-500/30">
                  <h4 className="text-sm font-semibold text-emerald-400 mb-2">Vegetation Health (NDVI)</h4>
                  <div className="text-2xl font-bold text-emerald-300">
                    {selectedProposal.environmentalData.ndviBefore.toFixed(3)} → {selectedProposal.environmentalData.ndviAfter.toFixed(3)}
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Loss: {selectedProposal.environmentalData.vegetationLossPercent.toFixed(1)}%
                  </div>
                </div>

                <div className="bg-red-500/10 p-4 rounded-lg border border-red-500/30">
                  <h4 className="text-sm font-semibold text-red-400 mb-2">Air Quality (PM2.5)</h4>
                  <div className="text-2xl font-bold text-red-300">
                    {selectedProposal.environmentalData.pm25Before.toFixed(1)} → {selectedProposal.environmentalData.pm25After.toFixed(1)} μg/m³
                  </div>
                  <div className="text-sm text-gray-400 mt-1">
                    Increase: +{selectedProposal.environmentalData.pm25IncreasePercent.toFixed(1)}%
                  </div>
                </div>
              </div>
            )}

            {/* Demographics */}
            {selectedProposal.demographics && (
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Affected Population</h3>
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-blue-500/10 p-3 rounded-lg text-center border border-blue-500/30">
                    <div className="text-2xl font-bold text-blue-300">
                      {(selectedProposal.demographics.children + selectedProposal.demographics.adults + selectedProposal.demographics.seniors).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">Total</div>
                  </div>
                  <div className="bg-purple-500/10 p-3 rounded-lg text-center border border-purple-500/30">
                    <div className="text-2xl font-bold text-purple-300">{selectedProposal.demographics.children.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-1">Children</div>
                  </div>
                  <div className="bg-teal-500/10 p-3 rounded-lg text-center border border-teal-500/30">
                    <div className="text-2xl font-bold text-teal-300">{selectedProposal.demographics.adults.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-1">Adults</div>
                  </div>
                  <div className="bg-amber-500/10 p-3 rounded-lg text-center border border-amber-500/30">
                    <div className="text-2xl font-bold text-amber-300">{selectedProposal.demographics.seniors.toLocaleString()}</div>
                    <div className="text-xs text-gray-400 mt-1">Seniors</div>
                  </div>
                </div>
              </div>
            )}

            {/* Voting Stats */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-400 uppercase mb-3">Voting Results</h3>
              {(() => {
                const actualTotalVotes = selectedProposal.yesVotes + selectedProposal.noVotes;
                const yesPercentage = actualTotalVotes > 0 ? (selectedProposal.yesVotes / actualTotalVotes) * 100 : 0;
                const noPercentage = actualTotalVotes > 0 ? (selectedProposal.noVotes / actualTotalVotes) * 100 : 0;

                return (
                  <>
                    <div className="flex justify-between text-base font-bold mb-3">
                      <div className="flex items-center gap-2">
                        <ThumbsUp size={18} className="text-emerald-400" />
                        <span className="text-emerald-400">For: {selectedProposal.yesVotes}</span>
                        {actualTotalVotes > 0 && (
                          <span className="text-emerald-300/70">
                            ({yesPercentage.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {actualTotalVotes > 0 && (
                          <span className="text-red-300/70">
                            ({noPercentage.toFixed(1)}%)
                          </span>
                        )}
                        <span className="text-red-400">Against: {selectedProposal.noVotes}</span>
                        <ThumbsDown size={18} className="text-red-400" />
                      </div>
                    </div>
                    {actualTotalVotes > 0 ? (
                      <div className="h-5 bg-red-500/20 rounded-full overflow-hidden shadow-inner relative">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-600 transition-all duration-500 absolute left-0"
                          style={{ width: `${yesPercentage}%` }}
                        ></div>
                        <div
                          className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-500 absolute right-0"
                          style={{ width: `${noPercentage}%` }}
                        ></div>
                      </div>
                    ) : (
                      <div className="h-5 bg-slate-800 rounded-full overflow-hidden shadow-inner flex items-center justify-center">
                        <span className="text-xs text-gray-500 font-medium">No votes yet - Be the first to vote!</span>
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-3 text-center">
                      {actualTotalVotes} total votes • Ends {new Date(selectedProposal.endDate * 1000).toLocaleString()}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Vote Buttons */}
            {normalizeStatus(selectedProposal.status) === 'active' && (
              <>
                {checkingVoteStatus ? (
                  <div className="flex items-center justify-center gap-2 py-6 border-t border-slate-700">
                    <Loader2 size={20} className="animate-spin text-emerald-400" />
                    <span className="text-gray-400">Checking vote status...</span>
                  </div>
                ) : voteSuccess ? (
                  <div className="pt-4 border-t border-slate-700">
                    <div className="bg-emerald-500/10 border-2 border-emerald-500/30 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center">
                          <CheckCircle2 size={24} className="text-white" />
                        </div>
                        <div>
                          <h4 className="text-lg font-bold text-emerald-400">Vote Successful!</h4>
                          <p className="text-sm text-gray-400">World ID verified · Vote recorded on Arbitrum Sepolia</p>
                        </div>
                      </div>
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="text-xs text-gray-400 mb-1">Transaction ID:</div>
                        <div className="text-sm text-emerald-400 font-mono break-all">{transactionId}</div>
                      </div>
                    </div>
                  </div>
                ) : hasVoted ? (
                  <div className="pt-4 border-t border-slate-700">
                    <div className="flex items-center justify-center gap-2 px-6 py-4 bg-slate-800 border-2 border-emerald-500/30 text-emerald-400 rounded-xl font-semibold">
                      <CheckCircle2 size={20} />
                      Already Voted - Thank you for participating!
                    </div>
                  </div>
                ) : (
                  <div className="pt-4 border-t border-slate-700 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <WorldIdIcon size={14} className="text-indigo-400" />
                      <span>Voting requires <span className="text-indigo-400 font-medium">World ID</span> verification — one human, one vote</span>
                    </div>
                    <div className="flex gap-4">
                      <button
                        onClick={() => handleVoteClick('yes')}
                        disabled={voting || worldIdOpen}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {voting && pendingVote === 'yes' ? <Loader2 size={20} className="animate-spin" /> : <ThumbsUp size={20} />}
                        Vote For
                      </button>
                      <button
                        onClick={() => handleVoteClick('no')}
                        disabled={voting || worldIdOpen}
                        className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {voting && pendingVote === 'no' ? <Loader2 size={20} className="animate-spin" /> : <ThumbsDown size={20} />}
                        Vote Against
                      </button>
                    </div>
                    {/* IDKit v4 controlled modal — rendered once, driven by worldIdOpen state */}
                    {rpContext && (
                      <IDKitRequestWidget
                        app_id={WORLD_ID_APP_ID}
                        action="urbanleaf-vote"
                        rp_context={rpContext}
                        preset={deviceLegacy({ signal: `${selectedProposal.id}-${pendingVote}` })}
                        allow_legacy_proofs={true}
                        open={worldIdOpen}
                        onOpenChange={(open) => {
                          setWorldIdOpen(open);
                          if (!open) { setRpContext(null); setPendingVote(null); }
                        }}
                        handleVerify={handleVerify}
                        onSuccess={onWorldIdSuccess}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            {/* Metadata */}
            <div className="mt-6 pt-4 border-t border-slate-700 text-xs text-gray-500">
              <div className="flex justify-between">
                <span>Proposal ID: {selectedProposal.id}</span>
                <span>Park ID: {selectedProposal.parkId}</span>
              </div>
              <div className="mt-1">Creator: {selectedProposal.creator}</div>
            </div>
          </div>
        </div>
      )}

      {/* Donate Modal */}
      {showDonateModal && selectedProposal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onClick={() => setShowDonateModal(false)}>
          <div className="bg-slate-900 border-2 border-emerald-500/50 rounded-2xl p-8 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-bold text-emerald-400 mb-1">Support This Proposal</h3>
                <p className="text-sm text-gray-400">{selectedProposal.parkName}</p>
              </div>
              <button onClick={() => setShowDonateModal(false)} className="text-gray-400 hover:text-gray-200">
                <X size={24} />
              </button>
            </div>

            {/* Payment Method Selection */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-300 mb-3">
                Payment Method
              </label>
              <div className="grid grid-cols-3 gap-3">
                {/* ETH - Active */}
                <button
                  onClick={() => setPaymentMethod('eth')}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    paymentMethod === 'eth'
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-gray-400 hover:border-slate-600'
                  }`}
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1">Ξ</div>
                    <div className="text-xs font-semibold">ETH</div>
                  </div>
                </button>

                {/* USDC - Disabled */}
                <button
                  disabled
                  className="p-4 rounded-xl border-2 bg-slate-800/50 border-slate-700/50 text-gray-600 cursor-not-allowed opacity-50"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1">$</div>
                    <div className="text-xs font-semibold">USDC</div>
                    <div className="text-[10px] mt-1">Coming Soon</div>
                  </div>
                </button>

                {/* Debit Card - Disabled */}
                <button
                  disabled
                  className="p-4 rounded-xl border-2 bg-slate-800/50 border-slate-700/50 text-gray-600 cursor-not-allowed opacity-50"
                >
                  <div className="text-center">
                    <div className="text-2xl mb-1">💳</div>
                    <div className="text-xs font-semibold">Card</div>
                    <div className="text-[10px] mt-1">Coming Soon</div>
                  </div>
                </button>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-300 mb-2">
                Donation Amount ({paymentMethod === 'eth' ? 'ETH' : paymentMethod === 'usdc' ? 'USDC' : 'USD'})
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={donationAmount}
                  onChange={(e) => setDonationAmount(e.target.value)}
                  placeholder="Enter amount (e.g. 10)"
                  className="w-full px-4 py-3 bg-slate-800 border-2 border-slate-700 focus:border-emerald-500 rounded-xl text-white placeholder-gray-500 outline-none transition-all"
                  disabled={donating}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                  {paymentMethod === 'eth' ? 'ETH' : paymentMethod === 'usdc' ? 'USDC' : 'USD'}
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDonateModal(false)}
                disabled={donating}
                className="flex-1 px-6 py-3 bg-slate-800 text-gray-300 rounded-xl font-semibold hover:bg-slate-700 transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDonate}
                disabled={donating || !donationAmount || parseFloat(donationAmount) <= 0}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-bold hover:from-emerald-600 hover:to-teal-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {donating ? (
                  <>
                    <Loader2 size={20} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <DollarSign size={20} />
                    Donate
                  </>
                )}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-4 text-center">
              Your wallet will open to approve the transaction
            </p>
          </div>
        </div>
      )}

      {/* Donation Result Modal */}
      {showDonationResultModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
          onClick={() => setShowDonationResultModal(false)}
        >
          <div
            className={`bg-slate-900 border-2 ${donationResult.success ? 'border-green-500/30' : 'border-red-500/30'} rounded-2xl max-w-lg w-full shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 ${donationResult.success ? 'bg-green-500/20' : 'bg-red-500/20'} rounded-full flex items-center justify-center`}>
                  {donationResult.success ? (
                    <CheckCircle2 size={24} className="text-green-400" />
                  ) : (
                    <XCircle size={24} className="text-red-400" />
                  )}
                </div>
                <h2 className={`text-2xl font-bold ${donationResult.success ? 'text-green-400' : 'text-red-400'}`}>
                  {donationResult.success ? 'Donation Successful!' : 'Donation Failed'}
                </h2>
              </div>

              <p className="text-gray-300 mb-4">{donationResult.message}</p>

              {donationResult.success && donationResult.amount && (
                <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-400">Amount Donated:</span>
                    <span className="text-emerald-400 font-bold text-lg">{donationResult.amount} ETH</span>
                  </div>
                  {donationResult.txId && (
                    <>
                      <div className="border-t border-slate-700 pt-2 mt-2">
                        <div className="text-sm text-gray-400 mb-1">Transaction ID:</div>
                        <div className="text-emerald-400 font-mono text-xs break-all">{donationResult.txId}</div>
                      </div>
                    </>
                  )}
                </div>
              )}

              <button
                onClick={() => setShowDonationResultModal(false)}
                className={`w-full px-4 py-3 ${donationResult.success ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white rounded-xl font-semibold transition-all`}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      </div>
    </ProtectedRoute>
  );
}
