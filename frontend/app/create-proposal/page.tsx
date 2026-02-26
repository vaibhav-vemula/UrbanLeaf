'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, Shield, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/components/providers/WalletProvider';
import { getUserProfile } from '@/lib/supabase';
import CustomCursor from '@/components/ui/CustomCursor';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import WalletStatus from '@/components/ui/WalletStatus';

export default function CreateProposalPage() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  // Check authorization on mount
  useEffect(() => {
    checkAuthorization();
  }, [address]);

  const checkAuthorization = async () => {
    if (!address) {
      setIsAuthorized(false);
      setLoading(false);
      return;
    }

    try {
      const result = await getUserProfile(address);

      if (result.success && result.data) {
        // Check if user is a government employee
        setIsAuthorized(result.data.is_government_employee === true);
      } else {
        setIsAuthorized(false);
      }
    } catch (error) {
      console.error('Error checking authorization:', error);
      setIsAuthorized(false);
    } finally {
      setLoading(false);
    }
  };

  // Unauthorized view
  if (loading) {
    return (
      <ProtectedRoute>
        <CustomCursor />
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 flex items-center justify-center">
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
        </div>
      </ProtectedRoute>
    );
  }

  if (!isAuthorized) {
    return (
      <ProtectedRoute>
        <WalletStatus />
        <CustomCursor />
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950">
          {/* Back Button */}
          <button
            onClick={() => router.push('/options')}
            className="absolute top-6 left-6 z-20 group flex items-center gap-2 px-5 py-2.5 bg-slate-800/90 backdrop-blur-md text-gray-300 hover:text-white rounded-full border-2 border-emerald-500/30 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-600"
          >
            <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
            <span className="font-semibold text-sm">Back to Options</span>
          </button>

          {/* Unauthorized Message */}
          <div className="flex items-center justify-center min-h-screen px-4">
            <div className="max-w-2xl w-full">
              <div className="bg-slate-900/50 backdrop-blur-xl border-2 border-red-500/30 rounded-3xl p-12 shadow-2xl">
                {/* Icon */}
                <div className="flex justify-center mb-6">
                  <div className="relative">
                    <div className="w-24 h-24 bg-red-500/20 rounded-full flex items-center justify-center">
                      <Lock className="w-12 h-12 text-red-400" />
                    </div>
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-white" />
                    </div>
                  </div>
                </div>

                {/* Title */}
                <h1 className="text-4xl font-bold text-center mb-4 bg-gradient-to-r from-red-400 to-red-600 bg-clip-text text-transparent">
                  Access Restricted
                </h1>

                {/* Message */}
                <div className="space-y-4 text-center">
                  <p className="text-xl text-gray-300 font-semibold">
                    Only authorized employees or invited city planners are allowed to create proposals.
                  </p>

                  <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 mt-6">
                    <div className="flex items-start gap-4">
                      <Shield className="w-6 h-6 text-emerald-400 flex-shrink-0 mt-1" />
                      <div className="text-left">
                        <h3 className="text-lg font-semibold text-emerald-400 mb-2">
                          How to Get Access
                        </h3>
                        <ul className="text-sm text-gray-400 space-y-2">
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                            Register as a government employee in your profile
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                            Enter the 6-digit verification PIN provided by UrbanLeaf AI team
                          </li>
                          <li className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                            Contact your local city planning department for authorization
                          </li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-4 justify-center mt-8">
                    <button
                      onClick={() => router.push('/profile')}
                      className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/50"
                    >
                      Go to Profile
                    </button>
                    <button
                      onClick={() => router.push('/options')}
                      className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-gray-300 hover:text-white font-semibold rounded-xl transition-all border border-slate-700"
                    >
                      Back to Options
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Authorized - Show create proposal form (placeholder for now)
  return (
    <ProtectedRoute>
      <WalletStatus />
      <CustomCursor />
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 py-8 px-4">
        {/* Back Button */}
        <button
          onClick={() => router.push('/options')}
          className="absolute top-6 left-6 z-20 group flex items-center gap-2 px-5 py-2.5 bg-slate-800/90 backdrop-blur-md text-gray-300 hover:text-white rounded-full border-2 border-emerald-500/30 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-600"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
          <span className="font-semibold text-sm">Back to Options</span>
        </button>

        {/* Header */}
        <div className="max-w-4xl mx-auto pt-20 mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center">
              <Shield className="w-6 h-6 text-emerald-400" />
            </div>
            <div className="px-4 py-1.5 bg-emerald-500/20 border border-emerald-500/50 rounded-full">
              <span className="text-xs font-semibold text-emerald-400">AUTHORIZED</span>
            </div>
          </div>

          <h1 className="text-5xl font-bold text-center bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 bg-clip-text text-transparent mb-3">
            Create New Proposal
          </h1>
          <p className="text-gray-400 text-lg text-center max-w-2xl mx-auto">
            Submit a proposal for community review and voting
          </p>
        </div>

        {/* Success Message */}
        <div className="max-w-4xl mx-auto">
          <div className="bg-slate-900/50 backdrop-blur-xl border-2 border-emerald-500/30 rounded-3xl p-12 shadow-2xl text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
            </div>

            <h2 className="text-3xl font-bold text-emerald-400 mb-4">
              Access Granted!
            </h2>
            <p className="text-gray-300 text-lg mb-6">
              You are authorized to create proposals as a government employee.
            </p>

            <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 text-left max-w-2xl mx-auto">
              <h3 className="text-lg font-semibold text-white mb-4">Proposal Creation Form Coming Soon</h3>
              <p className="text-gray-400 mb-4">
                The proposal creation form is currently under development. You'll soon be able to:
              </p>
              <ul className="text-sm text-gray-400 space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  Select a park from the database
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  Provide proposal description and details
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  Include environmental data and demographics
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></span>
                  Set voting period and submit to blockchain
                </li>
              </ul>
            </div>

            <button
              onClick={() => router.push('/proposal')}
              className="mt-8 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-emerald-500/50 text-lg"
            >
              View Existing Proposals
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
