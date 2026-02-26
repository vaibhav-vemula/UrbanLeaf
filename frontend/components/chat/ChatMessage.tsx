import { Message } from '@/types';
import { User, Sparkles, ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const router = useRouter();

  const handleGoToProfile = () => {
    router.push('/profile');
  };

  return (
    <div className={`flex gap-4 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-6 animate-fade-in group`}>
      <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center shadow-md transition-transform group-hover:scale-110 ${
        isUser
          ? 'bg-gradient-to-br from-blue-500 to-blue-600'
          : 'bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 relative overflow-hidden'
      }`}>
        {!isUser && (
          <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        )}
        {isUser ? (
          <User size={20} className="text-white" strokeWidth={2.5} />
        ) : (
          <Sparkles size={20} className="text-white relative z-10" strokeWidth={2.5} />
        )}
      </div>

      <div className={`flex flex-col max-w-[80%] min-w-0 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`relative rounded-2xl px-5 py-3.5 shadow-md transition-all group-hover:shadow-lg min-w-0 w-full overflow-hidden ${
          isUser
            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-tr-md'
            : 'bg-slate-800/90 text-gray-100 rounded-tl-md border border-slate-700'
        }`}>
          {!isUser && (
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-emerald-500 to-teal-500 rounded-l-2xl" />
          )}
          <p className={`text-[15px] leading-relaxed whitespace-pre-wrap break-words overflow-wrap-anywhere ${!isUser ? 'pl-2' : ''}`}>
            {message.content}
          </p>

          {/* Show "Go to Profile" button if authorization is required */}
          {!isUser && message.showProfileButton && (
            <button
              onClick={handleGoToProfile}
              className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all transform hover:scale-105"
            >
              <span>Go to Profile</span>
              <ArrowRight size={18} />
            </button>
          )}
        </div>

        <span className="text-xs text-emerald-400/60 mt-1.5 px-2 font-medium">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}
