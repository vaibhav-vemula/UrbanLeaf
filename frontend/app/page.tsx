'use client';

import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Sparkles, TreePine, MapPin, Database, Shield, Zap, TrendingUp, Award, Satellite, Activity, Leaf, BarChart3 } from 'lucide-react';
import { getParksByZipcode } from '@/lib/api';
import { ParkFeatureCollection } from '@/types';
import CustomCursor from '@/components/ui/CustomCursor';
import WalletStatus from '@/components/ui/WalletStatus';
import { useWallet } from '@/components/providers/WalletProvider';

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-800">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
        <p className="text-gray-400">Loading map...</p>
      </div>
    </div>
  ),
});

// Memoized map component wrapper to prevent re-renders
const MemoizedMapView = memo(MapView);

export default function Home() {
  const router = useRouter();
  const { isConnected, connect } = useWallet();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [parks, setParks] = useState<ParkFeatureCollection | null>(null);
  const [loadingParks, setLoadingParks] = useState(false);
  const orb1Ref = useRef<HTMLDivElement>(null);
  const orb2Ref = useRef<HTMLDivElement>(null);
  const orb3Ref = useRef<HTMLDivElement>(null);

  // Generate particle positions once on mount
  const particles = useMemo(() =>
    Array.from({ length: 100 }, (_, i) => ({
      left: (i * 7.3) % 100,
      top: (i * 11.7) % 100,
      delay: (i * 0.05) % 5,
      duration: 10 + (i * 0.1) % 10,
    }))
  , []);

  useEffect(() => {
    if (isConnected) {
      router.push('/options');
    }
  }, [isConnected, router]);

  useEffect(() => {
    setIsClient(true);

    // Fetch parks for zipcode 22202
    const fetchParks = async () => {
      setLoadingParks(true);
      try {
        const response = await getParksByZipcode('22202');
        if (response.success && response.featureCollection) {
          setParks(response.featureCollection);
        }
      } catch (error) {
        console.error('Error fetching parks:', error);
      } finally {
        setLoadingParks(false);
      }
    };

    fetchParks();
  }, []);


  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = e.clientX;
      const y = e.clientY;

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

  const handleConnectWallet = async () => {
    setIsConnecting(true);
    try {
      await connect();
      router.push('/options');
    } catch (error) {
      console.error('Wallet connection failed:', error);
    } finally {
      setIsConnecting(false);
    }
  };


  return (
    <>
      <CustomCursor />
      <WalletStatus />

      <div className="min-h-screen bg-slate-950 relative overflow-hidden">
        {/* Animated Grid Background */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]"></div>

        {/* Gradient Orbs */}
        <div className="absolute inset-0 overflow-hidden">
        <div
          ref={orb1Ref}
          className="absolute w-[800px] h-[800px] rounded-full bg-emerald-500/20 blur-[120px] animate-float"
          style={{
            top: '10%',
            left: '20%',
          }}
        ></div>
        <div
          ref={orb2Ref}
          className="absolute w-[600px] h-[600px] rounded-full bg-teal-500/20 blur-[100px] animate-float-delayed"
          style={{
            top: '50%',
            right: '10%',
          }}
        ></div>
        <div
          ref={orb3Ref}
          className="absolute w-[700px] h-[700px] rounded-full bg-green-500/15 blur-[110px] animate-float-slow"
          style={{
            bottom: '5%',
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

        <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-20">
        {/* Logo Badge */}
        <div className="mb-12 relative group">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 rounded-3xl blur-2xl opacity-40 animate-pulse-slow group-hover:opacity-60 transition-opacity"></div>
          <div className="relative bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 p-6 rounded-3xl shadow-2xl border border-emerald-400/20 group-hover:scale-110 transition-transform duration-500">
            <TreePine size={64} className="text-white drop-shadow-2xl" strokeWidth={2.5} />
          </div>
          {/* Orbiting Elements */}
          <div className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-400 rounded-full animate-ping"></div>
          <div className="absolute -bottom-2 -left-2 w-3 h-3 bg-teal-400 rounded-full animate-ping animation-delay-1000"></div>
        </div>

        {/* Main Heading */}
        <div className="text-center max-w-5xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 backdrop-blur-xl rounded-full mb-8 border border-emerald-500/20 shadow-lg">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-semibold text-emerald-400 tracking-wide">AI-Powered Urban Intelligence Platform</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-extrabold mb-8 tracking-tight leading-none">
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent animate-gradient-x">
              UrbanLeaf
            </span>
            <span className="text-white">.ai</span>
          </h1>

          <p className="text-2xl md:text-3xl text-gray-300 mb-8 font-light tracking-wide">
            Transform Urban Green Spaces with Intelligence
          </p>

          <p className="text-xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Harness the power of AI and blockchain to discover, analyze, and protect urban parks.
            Join the future of <span className="text-emerald-400 font-semibold">sustainable city planning</span>.
          </p>
        </div>

        {/* Connect Wallet Button */}
        <div className="mb-20">
          <button
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className="group relative inline-flex items-center gap-3 px-12 py-5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-xl font-bold rounded-full shadow-[0_0_50px_rgba(16,185,129,0.5)] hover:shadow-[0_0_80px_rgba(16,185,129,0.8)] transition-all duration-500 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 overflow-hidden border border-emerald-400/30"
          >
            {/* Animated shimmer effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-12 group-hover:animate-shimmer"></div>

            <div className="absolute inset-0 bg-gradient-to-r from-teal-500 to-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            {isConnecting ? (
              <>
                <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin relative z-10"></div>
                <span className="relative z-10">Connecting Wallet...</span>
              </>
            ) : (
              <>
                <Zap className="w-6 h-6 relative z-10 group-hover:rotate-12 transition-transform" fill="currentColor" />
                <span className="relative z-10">Launch Application</span>
                <svg className="w-6 h-6 relative z-10 group-hover:translate-x-2 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </>
            )}
          </button>
          <p className="mt-6 text-sm text-gray-400 text-center font-medium flex items-center justify-center gap-3">
            <Shield className="w-4 h-4 text-emerald-400" />
            Secure • Decentralized • Community-Driven
          </p>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 max-w-7xl mx-auto w-full">
          <div className="group bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 border border-emerald-500/20 shadow-2xl hover:shadow-emerald-500/20 transition-all duration-500 hover:-translate-y-2 hover:border-emerald-400/40 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-emerald-500/50">
                <Sparkles className="text-white" size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-emerald-400 transition-colors">AI Assistant</h3>
              <p className="text-gray-400 leading-relaxed">
                Engage with our intelligent AI to explore parks, analyze environmental metrics, and receive data-driven insights in real-time.
              </p>
            </div>
          </div>

          <div className="group bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 border border-teal-500/20 shadow-2xl hover:shadow-teal-500/20 transition-all duration-500 hover:-translate-y-2 hover:border-teal-400/40 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-emerald-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-teal-500/50">
                <Database className="text-white" size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-teal-400 transition-colors">Live Park Data</h3>
              <p className="text-gray-400 leading-relaxed">
                Access comprehensive real-time park information, environmental analytics, and interactive visualizations at your fingertips.
              </p>
            </div>
          </div>

          <div className="group bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-3xl p-8 border border-green-500/20 shadow-2xl hover:shadow-green-500/20 transition-all duration-500 hover:-translate-y-2 hover:border-green-400/40 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative z-10">
              <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-teal-500 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all shadow-lg shadow-green-500/50">
                <Shield className="text-white" size={32} strokeWidth={2.5} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 group-hover:text-green-400 transition-colors">DAO Governance</h3>
              <p className="text-gray-400 leading-relaxed">
                Participate in decentralized decision-making. Create, vote, and shape the future of urban green spaces democratically.
              </p>
            </div>
          </div>
        </div>

        {/* Stats Section */}
        <div className="mt-24 grid grid-cols-3 gap-12 max-w-4xl mx-auto w-full">
          <div className="text-center group">
            <div className="mb-3">
              <TrendingUp className="w-8 h-8 mx-auto text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-5xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">10K+</div>
            <div className="text-sm text-gray-400 font-medium uppercase tracking-wider">Parks Analyzed</div>
          </div>
          <div className="text-center group">
            <div className="mb-3">
              <MapPin className="w-8 h-8 mx-auto text-teal-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-5xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">50+</div>
            <div className="text-sm text-gray-400 font-medium uppercase tracking-wider">Cities Covered</div>
          </div>
          <div className="text-center group">
            <div className="mb-3">
              <Award className="w-8 h-8 mx-auto text-green-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-5xl font-bold bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform">98%</div>
            <div className="text-sm text-gray-400 font-medium uppercase tracking-wider">Accuracy Rate</div>
          </div>
        </div>

        {/* Satellite Analysis Section */}
        <div className="mt-32 max-w-7xl mx-auto w-full">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-500/10 to-purple-500/10 backdrop-blur-xl rounded-full mb-6 border border-blue-500/20 shadow-lg">
              <Satellite className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-blue-400 tracking-wide">Advanced Technology</span>
            </div>
            <h2 className="text-5xl md:text-6xl font-bold text-white mb-6">
              Interactive <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">Satellite Analysis</span>
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              Leverage cutting-edge satellite imagery and AI to analyze urban parks in real-time. Get comprehensive environmental insights at your fingertips.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Left: Analysis Features */}
            <div className="space-y-6">
              <div className="group bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-2xl p-6 border border-emerald-500/20 hover:border-emerald-400/40 transition-all duration-300 hover:translate-x-2">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Leaf className="text-white" size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-emerald-400 transition-colors">NDVI Monitoring</h3>
                    <p className="text-gray-400 leading-relaxed">Track vegetation health and density using normalized difference vegetation index from satellite data.</p>
                  </div>
                </div>
              </div>

              <div className="group bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-2xl p-6 border border-blue-500/20 hover:border-blue-400/40 transition-all duration-300 hover:translate-x-2">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <Activity className="text-white" size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-blue-400 transition-colors">Air Quality Analysis</h3>
                    <p className="text-gray-400 leading-relaxed">Monitor PM2.5 levels and environmental impact on surrounding communities in real-time.</p>
                  </div>
                </div>
              </div>

              <div className="group bg-gradient-to-br from-slate-900/90 to-slate-800/90 backdrop-blur-2xl rounded-2xl p-6 border border-purple-500/20 hover:border-purple-400/40 transition-all duration-300 hover:translate-x-2">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                    <BarChart3 className="text-white" size={24} strokeWidth={2.5} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2 group-hover:text-purple-400 transition-colors">Impact Prediction</h3>
                    <p className="text-gray-400 leading-relaxed">AI-powered simulations predict environmental changes and community impact of park modifications.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Interactive Map View */}
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-3xl blur-3xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
              <div className="relative bg-gradient-to-br from-slate-900/95 to-slate-800/95 backdrop-blur-2xl rounded-3xl p-8 border border-blue-500/30 shadow-2xl">
                {/* Interactive Map */}
                <div
                  className="aspect-square bg-slate-900 rounded-2xl overflow-hidden border border-emerald-500/20 relative cursor-auto"
                >
                  {isClient && !loadingParks && (
                    <MemoizedMapView
                      parks={parks}
                      onParkClick={(id) => console.log('Park clicked:', id)}
                      selectedParkId={null}
                    />
                  )}

                  {loadingParks && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
                        <p className="text-gray-400">Loading parks...</p>
                      </div>
                    </div>
                  )}

                  {/* Data points overlay */}
                  <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-emerald-500/30 z-10">
                    <div className="text-xs text-emerald-400 font-mono">NDVI: 0.78</div>
                  </div>
                  <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-blue-500/30 z-10">
                    <div className="text-xs text-blue-400 font-mono">PM2.5: 12μg/m³</div>
                  </div>
                  <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-purple-500/30 z-10">
                    <div className="text-xs text-purple-400 font-mono">{parks?.features.length || 0} Parks</div>
                  </div>
                  <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur-sm px-3 py-2 rounded-lg border border-teal-500/30 z-10">
                    <div className="text-xs text-teal-400 font-mono">Zip: 22202</div>
                  </div>
                </div>

                {/* Status indicator */}
                <div className="mt-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-400 font-medium">Live Interactive Map</span>
                  </div>
                  <div className="text-sm text-gray-500 font-mono">Zoom & explore parks</div>
                </div>
              </div>
            </div>
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
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.6; }
        }
        @keyframes glow-pulse {
          0%, 100% {
            opacity: 0.6;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.8;
            transform: translate(-50%, -50%) scale(1.1);
          }
        }
        @keyframes glow-pulse-delayed {
          0%, 100% {
            opacity: 0.7;
            transform: translate(-50%, -50%) scale(1);
          }
          50% {
            opacity: 0.9;
            transform: translate(-50%, -50%) scale(1.15);
          }
        }
        @keyframes scan {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh);
            opacity: 0;
          }
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
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        .animate-gradient-x {
          background-size: 200% 200%;
          animation: gradient-x 3s ease infinite;
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s ease-in-out infinite;
        }
        .animate-glow-pulse {
          animation: glow-pulse 2s ease-in-out infinite;
        }
        .animate-glow-pulse-delayed {
          animation: glow-pulse-delayed 2s ease-in-out infinite 0.5s;
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
        .animation-delay-1000 {
          animation-delay: 1s;
        }
      `}</style>
      </div>
    </>
  );
}
