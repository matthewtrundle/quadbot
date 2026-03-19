'use client';

import { useMemo } from 'react';
import { Bot, User, Wrench } from 'lucide-react';
import type { ChatMessage as ChatMessageType } from './use-chat';

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) return 'just now';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function renderMarkdown(text: string): React.ReactNode[] {
  return text.split('\n').map((line, lineIdx) => {
    // Bullet list items
    const bulletMatch = line.match(/^[-*]\s+(.*)/);
    const isBullet = !!bulletMatch;
    const lineContent = isBullet ? bulletMatch![1] : line;

    // Process inline formatting
    const parts: React.ReactNode[] = [];
    let remaining = lineContent;
    let key = 0;

    while (remaining.length > 0) {
      // Bold
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Inline code
      const codeMatch = remaining.match(/`([^`]+)`/);

      // Find which match comes first
      const boldIdx = boldMatch?.index ?? Infinity;
      const codeIdx = codeMatch?.index ?? Infinity;

      if (boldIdx === Infinity && codeIdx === Infinity) {
        parts.push(remaining);
        break;
      }

      if (boldIdx <= codeIdx && boldMatch) {
        parts.push(remaining.slice(0, boldIdx));
        parts.push(
          <strong key={key++} className="font-semibold">
            {boldMatch[1]}
          </strong>,
        );
        remaining = remaining.slice(boldIdx + boldMatch[0].length);
      } else if (codeMatch) {
        parts.push(remaining.slice(0, codeIdx));
        parts.push(
          <code key={key++} className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono">
            {codeMatch[1]}
          </code>,
        );
        remaining = remaining.slice(codeIdx + codeMatch[0].length);
      }
    }

    if (isBullet) {
      return (
        <li key={lineIdx} className="ml-4 list-disc text-sm leading-relaxed">
          {parts}
        </li>
      );
    }

    if (line.trim() === '') {
      return <br key={lineIdx} />;
    }

    return (
      <p key={lineIdx} className="text-sm leading-relaxed">
        {parts}
      </p>
    );
  });
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1">
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

export function ChatMessage({ message, isStreaming }: { message: ChatMessageType; isStreaming?: boolean }) {
  const isUser = message.role === 'user';
  const relativeTime = useMemo(() => formatRelativeTime(message.timestamp), [message.timestamp]);

  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full ${
          isUser ? 'bg-primary/20 text-primary' : 'bg-quad-purple/20 text-quad-purple'
        }`}
      >
        {isUser ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </div>

      {/* Content */}
      <div className={`max-w-[80%] space-y-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {message.toolCalls.map((tc, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-quad-purple/10 px-2.5 py-0.5 text-[11px] text-quad-purple"
              >
                <Wrench className="h-3 w-3" />
                {tc.summary}
              </span>
            ))}
          </div>
        )}

        {/* Message bubble */}
        <div
          className={`rounded-xl px-3.5 py-2.5 ${
            isUser ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground'
          }`}
        >
          {message.content ? renderMarkdown(message.content) : null}
          {isStreaming && !message.content && <StreamingDots />}
        </div>

        {/* Timestamp */}
        <p className={`text-[10px] text-muted-foreground ${isUser ? 'text-right' : 'text-left'}`}>{relativeTime}</p>
      </div>
    </div>
  );
}
