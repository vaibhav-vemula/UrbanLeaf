'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Shield, Clock, CheckCircle2, XCircle, Loader2, Users, TrendingUp, DollarSign, AlertCircle, Lock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/components/providers/WalletProvider';
import { getProposals, getDonationProgress } from '@/lib/api';
import { getUserProfile } from '@/lib/supabase';
import CustomCursor from '@/components/ui/CustomCursor';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import WalletStatus from '@/components/ui/WalletStatus';

type ProposalStatus = 'active' | 'passed' | 'rejected';

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

export default function DashboardPage() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [closingProposal, setClosingProposal] = useState(false);
  const [donationProgress, setDonationProgress] = useState<DonationProgress | null>(null);
  const [isGovernmentEmployee, setIsGovernmentEmployee] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultMessage, setResultMessage] = useState({ success: false, message: '', txId: '' });

  // Check if user is government employee (from Supabase profile)
  useEffect(() => {
    const checkGovernmentAccess = async () => {
      if (!isConnected || !address) {
        setIsGovernmentEmployee(false);
        setCheckingAuth(false);
        return;
      }

      try {
        // Check user profile in Supabase for government employee status
        const result = await getUserProfile(address);

        if (result.success && result.data) {
          const isGovEmployee = result.data.is_government_employee === true;
          setIsGovernmentEmployee(isGovEmployee);
          console.log('Government access check:', { address, isGovEmployee });
        } else {
          setIsGovernmentEmployee(false);
        }
      } catch (error) {
        console.error('Error checking government access:', error);
        setIsGovernmentEmployee(false);
      } finally {
        setCheckingAuth(false);
      }
    };

    checkGovernmentAccess();
  }, [address, isConnected]);

  // Fetch proposals on mount
  useEffect(() => {
    if (isGovernmentEmployee) {
      fetchProposals();
    }
  }, [isGovernmentEmployee]);

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

  const handleProposalClick = async (proposal: Proposal) => {
    setSelectedProposal(proposal);

    // Fetch donation progress if proposal is accepted
    if (normalizeStatus(proposal.status) === 'passed') {
      try {
        const progress = await getDonationProgress(proposal.id);
        if (progress.success) {
          setDonationProgress({
            raised: progress.raised || 0,
            goal: progress.goal || 0,
            percentage: progress.percentage || 0
          });
        }
      } catch (error) {
        console.error('Error fetching donation progress:', error);
        setDonationProgress(null);
      }
    } else {
      setDonationProgress(null);
    }
  };

  const handleCloseProposalClick = () => {
    setShowCloseConfirmModal(true);
  };

  const handleCloseProposal = async () => {
    if (!selectedProposal) return;

    setShowCloseConfirmModal(false);
    setClosingProposal(true);

    try {
      // Call backend API to close proposal (backend has owner credentials)
      const response = await fetch('http://localhost:5000/api/contract/close-proposal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          proposalId: selectedProposal.id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setResultMessage({
          success: true,
          message: `Proposal closed successfully! Status: ${selectedProposal.yesVotes > selectedProposal.noVotes ? 'ACCEPTED ✓' : 'REJECTED ✗'}`,
          txId: result.transactionId
        });
        setShowResultModal(true);

        // Refresh proposals after a short delay to allow blockchain to update
        setTimeout(() => {
          setSelectedProposal(null);
          fetchProposals();
        }, 2000);
      } else {
        throw new Error(result.error || 'Failed to close proposal');
      }

    } catch (error: any) {
      console.error('Error closing proposal:', error);
      setResultMessage({
        success: false,
        message: `Failed to close proposal: ${error.message}`,
        txId: ''
      });
      setShowResultModal(true);
    } finally {
      setClosingProposal(false);
    }
  };

  const getStatusBadge = (proposal: Proposal) => {
    const status = normalizeStatus(proposal.status);
    switch (status) {
      case 'active':
        return (
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-semibold flex items-center gap-1">
            <Clock size={14} />
            Active
          </span>
        );
      case 'passed':
        return (
          <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-semibold flex items-center gap-1">
            <CheckCircle2 size={14} />
            Accepted
          </span>
        );
      case 'rejected':
        return (
          <span className="px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-sm font-semibold flex items-center gap-1">
            <XCircle size={14} />
            Rejected
          </span>
        );
    }
  };

  const canCloseProposal = (proposal: Proposal) => {
    const status = normalizeStatus(proposal.status);
    // Government employees can close any active proposal
    return status === 'active';
  };

  // Show loading while checking auth
  if (checkingAuth) {
    return (
      <ProtectedRoute>
        <CustomCursor />
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="animate-spin text-emerald-400" size={48} />
            <p className="text-gray-400">Verifying access...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Show access denied if not government employee
  if (!isGovernmentEmployee) {
    return (
      <ProtectedRoute>
        <WalletStatus />
        <CustomCursor />
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-emerald-950 to-slate-900 p-8">
          <div className="max-w-2xl mx-auto mt-20">
            <div className="bg-red-500/10 border-2 border-red-500/30 rounded-2xl p-8 text-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <Lock size={40} className="text-red-400" />
              </div>
              <h1 className="text-3xl font-bold text-red-400 mb-4">Access Denied</h1>
              <p className="text-gray-300 mb-6">
                This dashboard is only accessible to government employees.
              </p>
              <p className="text-sm text-gray-400 mb-8">
                Your wallet: <span className="text-gray-300 font-mono">{address}</span>
              </p>
              <button
                onClick={() => router.push('/')}
                className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-700 transition-all"
              >
                Return to Home
              </button>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <WalletStatus />
      <CustomCursor />
      <div className="min-h-screen bg-slate-950 relative overflow-hidden p-8">
        {/* Animated Background */}
        <div className="fixed inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)] -z-10"></div>

        {/* Gradient Orbs */}
        <div className="fixed inset-0 overflow-hidden -z-10">
          <div className="absolute w-[600px] h-[600px] rounded-full bg-emerald-500/20 blur-[120px] animate-float" style={{ top: '20%', left: '10%' }}></div>
          <div className="absolute w-[500px] h-[500px] rounded-full bg-teal-500/20 blur-[100px] animate-float-delayed" style={{ top: '60%', right: '10%' }}></div>
          <div className="absolute w-[400px] h-[400px] rounded-full bg-orange-500/15 blur-[90px] animate-float-slow" style={{ top: '40%', left: '50%' }}></div>
        </div>

        {/* Back Button */}
        <button
          onClick={() => router.push('/')}
          className="absolute top-6 left-6 z-20 group flex items-center gap-2 px-5 py-2.5 bg-slate-800/90 backdrop-blur-md text-gray-300 hover:text-white rounded-full border-2 border-emerald-500/30 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-600"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
          <span className="font-semibold text-sm">Back</span>
        </button>

        <div className="relative z-10">
        {/* Header */}
        <div className="max-w-7xl mx-auto mb-8 pt-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Shield size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  Government Dashboard
                </h1>
                <p className="text-gray-400 mt-1">Manage all proposals and fundraising</p>
              </div>
            </div>

            <div className="text-right">
              <div className="text-sm text-gray-400">Total Proposals</div>
              <div className="text-3xl font-bold text-emerald-400">{proposals.length}</div>
            </div>
          </div>
        </div>

        {/* Proposals Table */}
        <div className="max-w-7xl mx-auto">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-32">
              <Loader2 className="animate-spin text-emerald-400 mb-4" size={56} />
              <p className="text-gray-400 font-medium">Loading proposals...</p>
            </div>
          ) : proposals.length === 0 ? (
            <div className="text-center py-32">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield size={40} className="text-emerald-400" />
              </div>
              <p className="text-xl font-semibold text-gray-200 mb-2">No proposals found</p>
              <p className="text-gray-400">Proposals will appear here once created</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 backdrop-blur-sm rounded-2xl border border-emerald-500/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">ID</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Park Name</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Status</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Votes</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Funds Raised</th>
                      <th className="px-6 py-4 text-left text-sm font-semibold text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {proposals.map((proposal) => {
                      const totalVotes = proposal.yesVotes + proposal.noVotes;
                      const yesPercentage = totalVotes > 0 ? (proposal.yesVotes / totalVotes) * 100 : 0;

                      return (
                        <tr
                          key={proposal.id}
                          onClick={() => handleProposalClick(proposal)}
                          className="hover:bg-slate-800/30 cursor-pointer transition-all"
                        >
                          <td className="px-6 py-4 text-gray-300 font-mono">#{proposal.id}</td>
                          <td className="px-6 py-4">
                            <div className="font-semibold text-gray-200">{proposal.parkName}</div>
                            <div className="text-sm text-gray-400">{proposal.parkId}</div>
                          </td>
                          <td className="px-6 py-4">{getStatusBadge(proposal)}</td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <div className="text-green-400 font-semibold">{proposal.yesVotes}</div>
                              <div className="text-gray-500">/</div>
                              <div className="text-red-400 font-semibold">{proposal.noVotes}</div>
                            </div>
                            {totalVotes > 0 && yesPercentage > 0 && (
                              <div className="text-xs text-gray-400 mt-1">
                                {yesPercentage.toFixed(0)}% in favor
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {proposal.fundingEnabled ? (
                              <div>
                                <div className="text-emerald-400 font-semibold">
                                  {(proposal.totalFundsRaised || 0).toFixed(2)} USDC
                                </div>
                                <div className="text-xs text-gray-400">
                                  Goal: {(proposal.fundingGoal || 0) >= 0.01 ? `${(proposal.fundingGoal).toFixed(2)} USDC` : 'Not set'}
                                </div>
                              </div>
                            ) : (
                              <div className="text-gray-500 text-sm">No fundraising</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleProposalClick(proposal);
                              }}
                              className="px-4 py-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-sm font-semibold hover:bg-emerald-500/30 transition-all"
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Proposal Detail Modal */}
        {selectedProposal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setSelectedProposal(null)}
          >
            <div
              className="bg-slate-900 border-2 border-emerald-500/30 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="sticky top-0 bg-slate-900 border-b border-emerald-500/20 p-6 flex justify-between items-start z-10">
                <div>
                  <h2 className="text-2xl font-bold text-emerald-400 mb-1">{selectedProposal.parkName}</h2>
                  <p className="text-gray-400 text-sm">Proposal #{selectedProposal.id}</p>
                </div>
                <button
                  onClick={() => setSelectedProposal(null)}
                  className="text-gray-400 hover:text-gray-200 transition-colors"
                >
                  <XCircle size={28} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Status */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Status</h3>
                  {getStatusBadge(selectedProposal)}
                </div>

                {/* Voting Results */}
                <div className="bg-slate-800/50 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-gray-200 mb-4 flex items-center gap-2">
                    <Users size={20} className="text-emerald-400" />
                    Voting Results
                  </h3>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">Yes Votes</div>
                      <div className="text-3xl font-bold text-green-400">{selectedProposal.yesVotes}</div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                      <div className="text-sm text-gray-400 mb-1">No Votes</div>
                      <div className="text-3xl font-bold text-red-400">{selectedProposal.noVotes}</div>
                    </div>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-8 overflow-hidden flex">
                    {(selectedProposal.yesVotes + selectedProposal.noVotes) > 0 ? (
                      <>
                        <div
                          className="bg-gradient-to-r from-green-500 to-emerald-500 h-8 flex items-center justify-center transition-all duration-500"
                          style={{
                            width: `${(selectedProposal.yesVotes / (selectedProposal.yesVotes + selectedProposal.noVotes)) * 100}%`
                          }}
                        >
                          {((selectedProposal.yesVotes / (selectedProposal.yesVotes + selectedProposal.noVotes)) * 100) > 10 && (
                            <span className="text-xs font-bold text-white">
                              {((selectedProposal.yesVotes / (selectedProposal.yesVotes + selectedProposal.noVotes)) * 100).toFixed(0)}% Yes
                            </span>
                          )}
                        </div>
                        <div
                          className="bg-gradient-to-r from-red-500 to-rose-500 h-8 flex items-center justify-center transition-all duration-500"
                          style={{
                            width: `${(selectedProposal.noVotes / (selectedProposal.yesVotes + selectedProposal.noVotes)) * 100}%`
                          }}
                        >
                          {((selectedProposal.noVotes / (selectedProposal.yesVotes + selectedProposal.noVotes)) * 100) > 10 && (
                            <span className="text-xs font-bold text-white">
                              {((selectedProposal.noVotes / (selectedProposal.yesVotes + selectedProposal.noVotes)) * 100).toFixed(0)}% No
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="h-8 flex items-center justify-center text-xs text-gray-400 w-full">
                        No votes yet
                      </div>
                    )}
                  </div>
                  <div className="text-center mt-3 text-sm text-gray-400">
                    Total Votes: {selectedProposal.yesVotes + selectedProposal.noVotes}
                  </div>
                </div>

                {/* Fundraising Status - Show for all proposals */}
                <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-emerald-400 mb-4 flex items-center gap-2">
                    <DollarSign size={20} />
                    Fundraising Status
                  </h3>
                  {normalizeStatus(selectedProposal.status) === 'passed' && selectedProposal.fundingEnabled ? (
                    <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Raised</div>
                        <div className="text-xl font-bold text-emerald-400">
                          {donationProgress
                            ? donationProgress.raised.toFixed(2)
                            : (selectedProposal.totalFundsRaised || 0).toFixed(2)
                          } USDC
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Goal</div>
                        <div className="text-xl font-bold text-gray-300">
                          {(() => {
                            const goal = donationProgress
                              ? donationProgress.goal
                              : (selectedProposal.fundingGoal || 0);
                            return goal >= 0.01 ? `${goal.toFixed(2)} USDC` : 'Not set';
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-sm text-gray-400 mb-1">Progress</div>
                        <div className="text-xl font-bold text-teal-400">
                          {(() => {
                            if (donationProgress) {
                              return donationProgress.percentage.toFixed(0);
                            }
                            const raised = (selectedProposal.totalFundsRaised || 0) / 100000000;
                            const goal = (selectedProposal.fundingGoal || 0) / 100000000;
                            return goal > 0 ? ((raised / goal) * 100).toFixed(0) : '0';
                          })()}%
                        </div>
                      </div>
                    </div>
                    <div className="w-full bg-slate-700/50 rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-500 h-6 rounded-full transition-all duration-500"
                        style={{
                          width: `${(() => {
                            if (donationProgress) {
                              return Math.min(donationProgress.percentage, 100);
                            }
                            const raised = (selectedProposal.totalFundsRaised || 0) / 100000000;
                            const goal = (selectedProposal.fundingGoal || 0) / 100000000;
                            return goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;
                          })()}%`
                        }}
                      />
                    </div>
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-gray-400">
                        {normalizeStatus(selectedProposal.status) === 'active'
                          ? 'Fundraising will be enabled after the proposal is accepted'
                          : normalizeStatus(selectedProposal.status) === 'rejected'
                          ? 'Proposal was rejected - no fundraising'
                          : 'No fundraising data available'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Description */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Description</h3>
                  <p className="text-gray-300 leading-relaxed">{selectedProposal.description}</p>
                </div>

                {/* Voting Period */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-400 mb-2">Voting Period</h3>
                  <div className="flex items-center gap-2 text-gray-300">
                    <Clock size={16} />
                    <span>
                      Ends: {new Date(selectedProposal.endDate * 1000).toLocaleDateString()} at{' '}
                      {new Date(selectedProposal.endDate * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  {Date.now() > selectedProposal.endDate * 1000 && (
                    <div className="mt-2 text-sm text-orange-400 flex items-center gap-2">
                      <AlertCircle size={16} />
                      Voting period has ended
                    </div>
                  )}
                </div>

                {/* Close Proposal Button */}
                {canCloseProposal(selectedProposal) && (
                  <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-orange-400 mb-2">Close Proposal</h3>
                        <p className="text-sm text-gray-300 mb-1">
                          Close this proposal to finalize the voting results.
                        </p>
                        {Date.now() < selectedProposal.endDate * 1000 && (
                          <p className="text-sm text-orange-400 mb-1">
                            ⚠️ Warning: Voting period hasn't ended yet. Closing now will stop all voting.
                          </p>
                        )}
                        <p className="text-sm text-gray-400">
                          Based on the vote count, this proposal will be{' '}
                          <span className={selectedProposal.yesVotes > selectedProposal.noVotes ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                            {selectedProposal.yesVotes > selectedProposal.noVotes ? 'ACCEPTED' : 'REJECTED'}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={handleCloseProposalClick}
                        disabled={closingProposal}
                        className="px-6 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-red-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      >
                        {closingProposal ? (
                          <>
                            <Loader2 size={20} className="animate-spin" />
                            Closing...
                          </>
                        ) : (
                          <>
                            <XCircle size={20} />
                            Close Proposal
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Close Confirmation Modal */}
        {showCloseConfirmModal && selectedProposal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
            onClick={() => setShowCloseConfirmModal(false)}
          >
            <div
              className="bg-slate-900 border-2 border-orange-500/30 rounded-2xl max-w-lg w-full shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-orange-500/20 rounded-full flex items-center justify-center">
                    <AlertCircle size={24} className="text-orange-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-orange-400">Confirm Close Proposal</h2>
                </div>

                <div className="space-y-4 mb-6">
                  <p className="text-gray-300">
                    Are you sure you want to close this proposal?
                  </p>

                  <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Proposal:</span>
                      <span className="text-gray-200 font-semibold">{selectedProposal.parkName}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Yes Votes:</span>
                      <span className="text-green-400 font-bold">{selectedProposal.yesVotes}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">No Votes:</span>
                      <span className="text-red-400 font-bold">{selectedProposal.noVotes}</span>
                    </div>
                    <div className="border-t border-slate-700 pt-2 mt-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Result:</span>
                        <span className={selectedProposal.yesVotes > selectedProposal.noVotes ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                          {selectedProposal.yesVotes > selectedProposal.noVotes ? 'ACCEPTED ✓' : 'REJECTED ✗'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {Date.now() < selectedProposal.endDate * 1000 && (
                    <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-3">
                      <p className="text-orange-400 text-sm">
                        ⚠️ Warning: Voting period hasn't ended yet. Closing now will stop all voting.
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCloseConfirmModal(false)}
                    className="flex-1 px-4 py-3 bg-slate-700 text-gray-200 rounded-xl font-semibold hover:bg-slate-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCloseProposal}
                    disabled={closingProposal}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-orange-500 to-red-600 text-white rounded-xl font-bold hover:from-orange-600 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {closingProposal ? (
                      <>
                        <Loader2 size={18} className="animate-spin" />
                        Closing...
                      </>
                    ) : (
                      'Close Proposal'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Result Modal */}
        {showResultModal && (
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
            onClick={() => setShowResultModal(false)}
          >
            <div
              className={`bg-slate-900 border-2 ${resultMessage.success ? 'border-green-500/30' : 'border-red-500/30'} rounded-2xl max-w-lg w-full shadow-2xl`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-12 h-12 ${resultMessage.success ? 'bg-green-500/20' : 'bg-red-500/20'} rounded-full flex items-center justify-center`}>
                    {resultMessage.success ? (
                      <CheckCircle2 size={24} className="text-green-400" />
                    ) : (
                      <XCircle size={24} className="text-red-400" />
                    )}
                  </div>
                  <h2 className={`text-2xl font-bold ${resultMessage.success ? 'text-green-400' : 'text-red-400'}`}>
                    {resultMessage.success ? 'Success' : 'Error'}
                  </h2>
                </div>

                <p className="text-gray-300 mb-4">{resultMessage.message}</p>

                {resultMessage.txId && (
                  <div className="bg-slate-800/50 rounded-lg p-4 mb-4">
                    <div className="text-sm text-gray-400 mb-1">Transaction ID:</div>
                    <div className="text-emerald-400 font-mono text-sm break-all">{resultMessage.txId}</div>
                  </div>
                )}

                <button
                  onClick={() => setShowResultModal(false)}
                  className={`w-full px-4 py-3 ${resultMessage.success ? 'bg-green-500 hover:bg-green-600' : 'bg-red-500 hover:bg-red-600'} text-white rounded-xl font-semibold transition-all`}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Animation Keyframes */}
        <style jsx>{`
          @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-20px); }
          }
          @keyframes float-delayed {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-30px); }
          }
          @keyframes float-slow {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-15px); }
          }
        `}</style>
      </div>
    </ProtectedRoute>
  );
}
