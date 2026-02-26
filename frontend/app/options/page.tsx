'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, FileText, ArrowRight, TreePine, Map, Vote, Zap, X, Mail, UserCircle } from 'lucide-react';
import WalletStatus from '@/components/ui/WalletStatus';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import { useWallet } from '@/components/providers/WalletProvider';
import { getUserProfile } from '@/lib/supabase';

export default function Options() {
  const router = useRouter();
  const { address, isConnected } = useWallet();
  const [isClient, setIsClient] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);
  const [isGovernmentEmployee, setIsGovernmentEmployee] = useState(false);
  const cursorGlowRef = useRef<HTMLDivElement>(null);
  const customCursorRef = useRef<HTMLDivElement>(null);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);

  // Generate particle positions once on mount
  const particles = useMemo(() =>
    Array.from({ length: 60 }, (_, i) => ({
      left: (i * 7.3) % 100,
      top: (i * 11.7) % 100,
      delay: (i * 0.05) % 5,
      duration: 10 + (i * 0.1) % 10,
    }))
  , []);

  useEffect(() => {
    setIsClient(true);
    checkProfile();
    checkGovernmentAccess();
  }, [address, isConnected]);

  async function checkGovernmentAccess() {
    if (!isConnected || !address) {
      setIsGovernmentEmployee(false);
      return;
    }

    try {
      // Check user profile in Supabase for government employee status
      const result = await getUserProfile(address);

      if (result.success && result.data) {
        const isGovEmployee = result.data.is_government_employee === true;
        setIsGovernmentEmployee(isGovEmployee);
      } else {
        setIsGovernmentEmployee(false);
      }
    } catch (error) {
      console.error('Error checking government access:', error);
      setIsGovernmentEmployee(false);
    }
  }

  async function checkProfile() {
    if (!address) return;

    try {
      const result = await getUserProfile(address);
      if (result.success && result.data) {
        const profile = result.data;
        setHasProfile(true);
        // Show notification only if profile has no real data filled in yet
        if (!profile.name && !profile.email) {
          setShowNotification(true);
        }
      } else {
        // No row at all
        setShowNotification(true);
      }
    } catch (error) {
      console.error('Error checking profile:', error);
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;

      // Update cursor elements directly without re-rendering
      if (cursorGlowRef.current) {
        cursorGlowRef.current.style.left = `${x}px`;
        cursorGlowRef.current.style.top = `${y}px`;
      }
      if (customCursorRef.current) {
        customCursorRef.current.style.left = `${x}px`;
        customCursorRef.current.style.top = `${y}px`;
      }

      // Update orb positions with parallax
      if (orb1Ref.current) {
        orb1Ref.current.style.transform = `translate(${x * 0.02}px, ${y * 0.02}px)`;
      }
      if (orb2Ref.current) {
        orb2Ref.current.style.transform = `translate(${x * -0.015}px, ${y * -0.015}px)`;
      }
      if (orb3Ref.current) {
        orb3Ref.current.style.transform = `translate(${x * 0.01}px, ${y * 0.01}px)`;
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);


  return (
    <ProtectedRoute>
      <WalletStatus />

      {/* Profile Notification Popup */}
      {showNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl border border-emerald-500/30 shadow-2xl shadow-emerald-500/20 p-8 animate-slideUp">
            {/* Close button */}
            <button
              onClick={() => setShowNotification(false)}
              className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white hover:bg-slate-700/50 rounded-full transition-colors"
            >
              <X size={20} />
            </button>

            {/* Icon */}
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-2xl flex items-center justify-center mb-4 mx-auto">
              <Mail className="text-white" size={32} strokeWidth={2.5} />
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-white text-center mb-3">
              Complete Your Profile
            </h2>

            {/* Description */}
            <p className="text-gray-300 text-center mb-6 leading-relaxed">
              <span className="font-semibold text-emerald-400">Email and address</span> are required for:
            </p>

            {/* Benefits List */}
            <div className="space-y-3 mb-6">
              <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Mail className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Proposal Notifications</p>
                  <p className="text-xs text-gray-400">Receive emails when new proposals are created</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Vote className="w-4 h-4 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Voting Access</p>
                  <p className="text-xs text-gray-400">Participate in DAO governance and decisions</p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg">
                <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <TreePine className="w-4 h-4 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Parks Near You</p>
                  <p className="text-xs text-gray-400">Discover and interact with nearby parks</p>
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex flex-col gap-3">
              <button
                onClick={() => router.push('/profile')}
                className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-semibold rounded-lg transition-all shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 hover:scale-[1.02] active:scale-[0.98]"
              >
                <UserCircle size={20} />
                Go to Profile
              </button>

              <button
                onClick={() => setShowNotification(false)}
                className="w-full py-2 text-gray-400 hover:text-white font-medium text-sm transition-colors"
              >
                Skip for now
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-slate-950 relative overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_50%,#000_70%,transparent_110%)]"></div>

        {/* Gradient Orbs */}
        <div className="absolute inset-0 overflow-hidden">
          <div
            ref={orb1Ref}
            className="absolute w-[600px] h-[600px] rounded-full bg-emerald-500/20 blur-[120px] animate-float"
            style={{
              top: '20%',
              left: '10%',
            }}
          ></div>
          <div
            ref={orb2Ref}
            className="absolute w-[500px] h-[500px] rounded-full bg-teal-500/20 blur-[100px] animate-float-delayed"
            style={{
              top: '60%',
              right: '10%',
            }}
          ></div>
          <div
            ref={orb3Ref}
            className="absolute w-[550px] h-[550px] rounded-full bg-green-500/15 blur-[110px] animate-float-slow"
            style={{
              bottom: '10%',
              left: '50%',
            }}
          ></div>
        </div>

        {/* Floating Particles */}
        <div className="absolute inset-0 overflow-hidden">
          {isClient && particles.map((particle, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-emerald-400/30 rounded-full animate-particle"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
              }}
            ></div>
          ))}
        </div>

        <div className="relative z-10 h-screen flex items-center justify-center px-4 py-8">
          <div className="max-w-7xl mx-auto w-full">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 backdrop-blur-xl rounded-full mb-6 border border-emerald-500/20 shadow-lg">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="text-xs font-semibold text-emerald-400 tracking-wide">Select Your Journey</span>
              </div>

              <h1 className="text-5xl md:text-6xl font-extrabold mb-4 tracking-tight leading-none">
                <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent animate-gradient-x">
                  Choose Your Path
                </span>
              </h1>

              <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
                Explore urban green spaces with AI or shape community decisions
              </p>
            </div>

            {/* Cards Grid */}
            <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              {/* AI Assistant Card */}
              <button
                onClick={() => router.push('/chat')}
                className="group relative bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 border border-emerald-500/20 shadow-2xl hover:shadow-emerald-500/30 transition-all duration-500 hover:-translate-y-3 hover:border-emerald-400/40 overflow-hidden text-left"
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                {/* Glow effect */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-emerald-500/20 rounded-full blur-3xl"></div>
                </div>

                <div className="relative z-10">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-emerald-500/50">
                    <Sparkles className="text-white" size={32} strokeWidth={2.5} />
                  </div>

                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 backdrop-blur-sm rounded-full mb-3 border border-emerald-500/20">
                    <Zap size={12} className="text-emerald-400" />
                    <span className="text-xs font-semibold text-emerald-400">AI-Powered</span>
                  </div>

                  {/* Title */}
                  <h2 className="text-3xl font-bold text-white mb-3 group-hover:text-emerald-400 transition-colors">
                    AI Assistant
                  </h2>

                  {/* Description */}
                  <p className="text-gray-400 text-base mb-6 leading-relaxed">
                    Engage with our intelligent AI to discover parks, analyze environmental metrics, and receive data-driven insights.
                  </p>

                  {/* Features */}
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-gray-300">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      <span className="text-sm">Interactive park exploration</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      <span className="text-sm">Environmental data analysis</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full"></div>
                      <span className="text-sm">Real-time insights</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex items-center gap-3 text-emerald-400 font-bold group-hover:gap-5 transition-all">
                    <span>Start Exploring</span>
                    <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" strokeWidth={2.5} />
                  </div>
                </div>

                {/* Decorative corner elements */}
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-400 rounded-full animate-ping opacity-0 group-hover:opacity-75"></div>
                <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-teal-400 rounded-full animate-ping opacity-0 group-hover:opacity-75" style={{ animationDelay: '0.5s' }}></div>
              </button>

              {/* DAO Proposals Card */}
              <button
                onClick={() => router.push('/proposal')}
                className="group relative bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 border border-teal-500/20 shadow-2xl hover:shadow-teal-500/30 transition-all duration-500 hover:-translate-y-3 hover:border-teal-400/40 overflow-hidden text-left"
              >
                {/* Animated background gradient */}
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

                {/* Glow effect */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-teal-500/20 rounded-full blur-3xl"></div>
                </div>

                <div className="relative z-10">
                  {/* Icon */}
                  <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-green-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-teal-500/50">
                    <FileText className="text-white" size={32} strokeWidth={2.5} />
                  </div>

                  {/* Badge */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-teal-500/10 backdrop-blur-sm rounded-full mb-3 border border-teal-500/20">
                    <Vote size={12} className="text-teal-400" />
                    <span className="text-xs font-semibold text-teal-400">Decentralized</span>
                  </div>

                  {/* Title */}
                  <h2 className="text-3xl font-bold text-white mb-3 group-hover:text-teal-400 transition-colors">
                    DAO Proposals
                  </h2>

                  {/* Description */}
                  <p className="text-gray-400 text-base mb-6 leading-relaxed">
                    Participate in decentralized decision-making. View active proposals, cast votes, and shape the future of urban green spaces in your community.
                  </p>

                  {/* Features */}
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-gray-300">
                      <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                      <span className="text-sm">Browse active proposals</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                      <span className="text-sm">Vote on community decisions</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-300">
                      <div className="w-1.5 h-1.5 bg-teal-400 rounded-full"></div>
                      <span className="text-sm">Track proposal outcomes</span>
                    </div>
                  </div>

                  {/* CTA */}
                  <div className="flex items-center gap-3 text-teal-400 font-bold group-hover:gap-5 transition-all">
                    <span>View Proposals</span>
                    <ArrowRight size={20} className="group-hover:translate-x-2 transition-transform" strokeWidth={2.5} />
                  </div>
                </div>

                {/* Decorative corner elements */}
                <div className="absolute -top-2 -right-2 w-4 h-4 bg-teal-400 rounded-full animate-ping opacity-0 group-hover:opacity-75"></div>
                <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-green-400 rounded-full animate-ping opacity-0 group-hover:opacity-75" style={{ animationDelay: '0.5s' }}></div>
              </button>
            </div>

            {/* Admin Dashboard / Back to Home Link */}
            <div className="text-center mt-6">
              {isGovernmentEmployee ? (
                <button
                  onClick={() => router.push('/dashboard')}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 hover:border-orange-400/50 text-orange-400 hover:text-orange-300 transition-all font-semibold rounded-xl shadow-lg shadow-orange-500/10 hover:shadow-orange-500/20"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  <span>Admin Dashboard</span>
                  <ArrowRight size={20} />
                </button>
              ) : (
                <button
                  onClick={() => router.push('/')}
                  className="inline-flex items-center gap-2 px-6 py-3 text-gray-400 hover:text-emerald-400 transition-colors font-medium"
                >
                  <ArrowRight size={20} className="rotate-180" />
                  <span>Back to Home</span>
                </button>
              )}
            </div>
          </div>
        </div>

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
          @keyframes particle {
            0% { transform: translateY(0) translateX(0); opacity: 0; }
            10% { opacity: 0.5; }
            90% { opacity: 0.5; }
            100% { transform: translateY(-100vh) translateX(50px); opacity: 0; }
          }
          @keyframes gradient-x {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
          }

          .animate-float {
            animation: float 8s ease-in-out infinite;
          }
          .animate-float-delayed {
            animation: float-delayed 10s ease-in-out infinite;
          }
          .animate-float-slow {
            animation: float-slow 12s ease-in-out infinite;
          }
          .animate-particle {
            animation: particle linear infinite;
          }
          .animate-gradient-x {
            background-size: 200% 200%;
            animation: gradient-x 3s ease infinite;
          }
        `}</style>
      </div>

      {/* Cursor Glow Effect */}
      <div
        ref={cursorGlowRef}
        className="fixed pointer-events-none z-[100]"
        style={{
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          willChange: 'left, top',
        }}
      >
        <div className="absolute w-80 h-80 rounded-full bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 blur-[80px]"
             style={{ transform: 'translate(-50%, -50%)' }}></div>
        <div className="absolute w-56 h-56 rounded-full bg-gradient-to-r from-emerald-400/15 via-teal-400/15 to-emerald-400/15 blur-[50px]"
             style={{ transform: 'translate(-50%, -50%)' }}></div>
        <div className="absolute w-32 h-32 rounded-full bg-gradient-to-r from-emerald-300/20 via-teal-300/20 to-emerald-300/20 blur-[30px]"
             style={{ transform: 'translate(-50%, -50%)' }}></div>
      </div>

      {/* Custom Cursor */}
      <div
        ref={customCursorRef}
        className="fixed pointer-events-none z-[101]"
        style={{
          left: 0,
          top: 0,
          transform: 'translate(-50%, -50%)',
          willChange: 'left, top',
        }}
      >
        <div className="w-4 h-4 bg-emerald-400 rounded-full opacity-80"></div>
      </div>
    </ProtectedRoute>
  );
}
