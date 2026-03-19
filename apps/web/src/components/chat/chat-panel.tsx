'use client';

import { useState, useRef, useEffect } from 'react';
import { Bot, X, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from './chat-message';
import { ChatInput } from './chat-input';
import { useChat } from './use-chat';

const QUICK_ACTIONS = [
  { label: 'What changed today?', message: 'What changed today?' },
  { label: 'Show top recommendations', message: 'Show top recommendations' },
  { label: 'Brand health check', message: 'Brand health check' },
];

export function ChatPanel({ brandId, brandName }: { brandId: string; brandName: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, startNewChat, isStreaming, error } = useChat(brandId);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Prevent body scroll when panel is open on mobile
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [isOpen]);

  return (
    <>
      {/* Toggle button - fixed bottom-right */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:shadow-[0_0_20px_rgba(34,211,238,0.3)]"
        aria-label="Open chat"
      >
        <Bot className="h-6 w-6" />
      </button>

      {/* Dark overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-200"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel */}
      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full flex-col border-l border-border/50 bg-card/95 backdrop-blur-md transition-transform duration-200 ease-out sm:w-[420px] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Ask QuadBot</h2>
            <p className="truncate text-xs text-muted-foreground">{brandName}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                startNewChat();
              }}
              className="h-8 w-8"
              title="New chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="h-8 w-8" title="Close">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scrollbar-none">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-quad-purple/10 mb-3">
                <Bot className="h-6 w-6 text-quad-purple" />
              </div>
              <p className="text-sm font-medium text-foreground">How can I help?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ask me about your brand&apos;s performance, recommendations, or any SEO questions.
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <ChatMessage
              key={msg.id}
              message={msg}
              isStreaming={isStreaming && idx === messages.length - 1 && msg.role === 'assistant'}
            />
          ))}

          {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</div>}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t border-border/50 px-4 py-3">
          <ChatInput
            onSend={sendMessage}
            disabled={isStreaming}
            quickActions={messages.length === 0 ? QUICK_ACTIONS : []}
          />
        </div>
      </aside>
    </>
  );
}
