'use client';

import { useState, KeyboardEvent, useRef, useImperativeHandle, forwardRef } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  showSuggestions?: boolean;
}

export interface ChatInputRef {
  focus: () => void;
}

const ChatInput = forwardRef<ChatInputRef, ChatInputProps>(({ onSendMessage, disabled, isLoading, showSuggestions = true }, ref) => {
  const [input, setInput] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.focus();
        // Ensure cursor is at the end
        const length = textarea.value.length;
        textarea.setSelectionRange(length, length);
      }
    }
  }));

  const handleSend = () => {
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
    }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const suggestions = [
    { text: 'Parks in Austin', query: 'show parks in Austin', icon: '🌳' },
    { text: 'Parks in 22202', query: 'show parks in 22202', icon: '🏞️' },
    { text: 'Parks in 20008', query: 'show parks in 20008', icon: '🌲' },
  ];

  return (
    <div className="border-t border-slate-700 bg-slate-900/90 backdrop-blur-sm p-6">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyPress}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Ask about parks, green spaces, or environmental data..."
            disabled={disabled || isLoading}
            tabIndex={0}
            aria-label="Chat input"
            className={`w-full h-14 px-5 py-3 rounded-2xl border-2 focus:outline-none resize-none transition-all duration-200 ${
              isFocused
                ? 'border-emerald-400 bg-slate-800 shadow-lg ring-4 ring-emerald-500/20'
                : 'border-slate-700 bg-slate-800/90 hover:border-emerald-500/50'
            } text-gray-100 placeholder-gray-500 disabled:opacity-50 disabled:cursor-not-allowed`}
            rows={1}
            style={{ cursor: 'text' }}
          />
          {!input && (
            <Sparkles className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-500/50 pointer-events-none" size={18} />
          )}
        </div>

        <button
          onClick={handleSend}
          disabled={!input.trim() || disabled || isLoading}
          tabIndex={0}
          aria-label="Send message"
          className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-emerald-600 text-white flex items-center justify-center transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 active:scale-95 disabled:transform-none relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          {isLoading ? (
            <Loader2 size={22} className="animate-spin relative z-10" strokeWidth={2.5} />
          ) : (
            <Send size={22} className="relative z-10" strokeWidth={2.5} />
          )}
        </button>
      </div>

      {showSuggestions && (
        <div className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onSendMessage(suggestion.query)}
              disabled={disabled || isLoading}
              tabIndex={0}
              aria-label={`Suggestion: ${suggestion.text}`}
              className="group flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl bg-slate-800/90 border border-slate-700 hover:border-emerald-400 hover:bg-emerald-500/10 text-gray-300 hover:text-emerald-400 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
            >
              <span className="text-base group-hover:scale-110 transition-transform">{suggestion.icon}</span>
              <span className="font-medium">{suggestion.text}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 text-center">
        <p className="text-xs text-emerald-400/70 font-medium">
          Powered by AI • Ask anything about urban green spaces
        </p>
      </div>
    </div>
  );
});

ChatInput.displayName = 'ChatInput';

export default ChatInput;
