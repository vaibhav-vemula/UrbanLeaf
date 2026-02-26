'use client';

import { useState, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ChatMessage from '@/components/chat/ChatMessage';
import ChatInput, { ChatInputRef } from '@/components/chat/ChatInput';
import CustomCursor from '@/components/ui/CustomCursor';
import ProtectedRoute from '@/components/ui/ProtectedRoute';
import WalletStatus from '@/components/ui/WalletStatus';
import { useWallet } from '@/components/providers/WalletProvider';
import { Message, ParkFeatureCollection } from '@/types';
import { sendAgentMessage } from '@/lib/api';
import { Sparkles, ArrowLeft } from 'lucide-react';

const MapView = dynamic(() => import('@/components/map/MapView'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 rounded-lg">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto mb-4"></div>
        <p className="text-gray-600">Loading map...</p>
      </div>
    </div>
  ),
});

export default function Home() {
  const router = useRouter();
  const { address } = useWallet();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m UrbanLeaf AI, your urban green space assistant. Ask me about parks in any zipcode or city!',
      timestamp: new Date(),
    },
  ]);
  const [parks, setParks] = useState<ParkFeatureCollection | null>(null);
  const [selectedParkId, setSelectedParkId] = useState<string | null>(null);
  const [selectedParkName, setSelectedParkName] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [hcsTopicId, setHcsTopicId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showRemovalImpact, setShowRemovalImpact] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatSectionRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputRef>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-focus input after loading completes
  useEffect(() => {
    if (!isLoading && messages.length > 1) {
      const focusInput = () => {
        const textarea = document.querySelector('textarea[aria-label="Chat input"]') as HTMLTextAreaElement;
        if (textarea && !textarea.disabled) {
          // Blur any currently focused element first
          if (document.activeElement && document.activeElement !== textarea) {
            (document.activeElement as HTMLElement).blur();
          }

          // Focus the textarea
          textarea.focus({ preventScroll: true });

          // Dispatch focus and click events manually
          const focusEvent = new FocusEvent('focus', { bubbles: true });
          textarea.dispatchEvent(focusEvent);

          const mousedownEvent = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
          textarea.dispatchEvent(mousedownEvent);

          const mouseupEvent = new MouseEvent('mouseup', { bubbles: true, cancelable: true });
          textarea.dispatchEvent(mouseupEvent);

          const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
          textarea.dispatchEvent(clickEvent);

          // Set selection to end
          const length = textarea.value.length;
          textarea.setSelectionRange(length, length);
        }
      };

      // Try with increasing delays
      setTimeout(focusInput, 0);
      setTimeout(focusInput, 100);
      setTimeout(focusInput, 200);
    }
  }, [isLoading, messages.length]);


  const handleSendMessage = async (messageText: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      const response = await sendAgentMessage(
        messageText,
        sessionId || undefined,
        selectedParkId || undefined,
        address || undefined
      );

      if (response.sessionId) {
        setSessionId(response.sessionId);
      }

      if (response.hcsTopicId) {
        setHcsTopicId(response.hcsTopicId);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.reply,
        timestamp: new Date(),
        data: response.data,
        action: response.action,
        showProfileButton: response.showProfileButton,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Handle different actions
      if (response.action === 'render_parks' && response.data?.featureCollection) {
        console.log('Parks data received:', response.data.featureCollection);
        setParks(response.data.featureCollection);
        setSelectedParkId(null);
        setSelectedParkName(null);
        setShowRemovalImpact(false);
      } else if (response.action === 'removal_impact') {
        console.log('Park removal impact data received');
        setShowRemovalImpact(true);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please make sure the backend is running.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleParkClick = (parkId: string) => {
    console.log('Park clicked, parkId:', parkId);
    setSelectedParkId(parkId);
    const park = parks?.features.find((f) => {
      const featureId = f.properties.id || f.properties.Park_id || f.properties.gid?.toString();
      return featureId === parkId;
    });
    console.log('Found park:', park);
    if (park) {
      const parkName = park.properties.Park_Name || park.properties.name || park.properties.park_name || 'this park';
      console.log('Park name:', parkName);
      setSelectedParkName(parkName);
      const infoMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Selected: ${parkName}. You can ask me "how big is this park?", "what's the NDVI?", or "what happens if removed?"`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, infoMessage]);
    }
  };

  return (
    <ProtectedRoute>
      <WalletStatus />
      <CustomCursor />
      <div className="flex h-screen bg-slate-950 relative">
        {/* Back Button - Top Left Corner */}
        <button
          onClick={() => router.push('/options')}
          tabIndex={-1}
          className="absolute top-6 left-6 z-20 group flex items-center gap-2 px-5 py-2.5 bg-slate-800/90 backdrop-blur-md text-gray-300 hover:text-white rounded-full border-2 border-emerald-500/30 hover:border-emerald-400 shadow-lg hover:shadow-emerald-500/25 transition-all duration-300 hover:bg-gradient-to-r hover:from-emerald-500 hover:to-teal-600"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform duration-300" strokeWidth={2.5} />
          <span className="font-semibold text-sm">Back</span>
        </button>

        {/* Map Section */}
        <div className="w-[60%] p-4 relative">
          {/* Selected Park Name Overlay - Debug */}
          {selectedParkName ? (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 z-[999] px-6 py-3 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full shadow-xl border-2 border-emerald-400/50">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="text-white font-bold text-base">
                  Selected: {selectedParkName}
                </span>
              </div>
            </div>
          ) : null}

          <div className="h-full rounded-2xl shadow-xl overflow-hidden border border-slate-700 relative" style={{ cursor: 'auto' }}>
            <MapView
              parks={parks}
              onParkClick={handleParkClick}
              selectedParkId={selectedParkId}
              showRemovalImpact={showRemovalImpact}
            />
          </div>
        </div>

        {/* Chat Section */}
        <div ref={chatSectionRef} className="w-[40%] flex flex-col bg-slate-900/80 backdrop-blur-sm border-l border-slate-700 shadow-xl">
          <div className="p-6 border-b border-slate-700 bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-0">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                <Sparkles size={20} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
                  AI Planner
                </h2>
                <p className="text-xs text-emerald-400/70 font-medium">Powered by Gemini AI</p>
                {hcsTopicId && (
                  <a
                    href={`https://hashscan.io/testnet/topic/${hcsTopicId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-teal-400/60 hover:text-teal-300 font-mono transition-colors inline-flex items-center gap-1 mt-0.5"
                  >
                    <span className="text-xs mr-1">Topic ID - {hcsTopicId}</span>
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-2 scroll-smooth scrollbar-hide">
            {messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))}

            {/* Typing Indicator */}
            {isLoading && (
              <div className="flex gap-4 mb-6 animate-fade-in group">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-md bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent"></div>
                  <Sparkles size={20} className="text-white relative z-10 animate-pulse" strokeWidth={2.5} />
                </div>
                <div className="flex flex-col items-start">
                  <div className="relative rounded-2xl px-6 py-4 shadow-md bg-slate-800/90 backdrop-blur-sm border border-slate-700/60 rounded-tl-md">
                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-teal-500 rounded-l-2xl" />
                    <div className="flex gap-1.5 pl-2">
                      <div className="w-2.5 h-2.5 bg-emerald-400/80 rounded-full animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}></div>
                      <div className="w-2.5 h-2.5 bg-emerald-400/80 rounded-full animate-bounce" style={{ animationDelay: '200ms', animationDuration: '1s' }}></div>
                      <div className="w-2.5 h-2.5 bg-emerald-400/80 rounded-full animate-bounce" style={{ animationDelay: '400ms', animationDuration: '1s' }}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <ChatInput
            ref={chatInputRef}
            onSendMessage={handleSendMessage}
            disabled={isLoading}
            isLoading={isLoading}
            showSuggestions={messages.length === 1}
          />
        </div>
      </div>
    </ProtectedRoute>
  );
}
