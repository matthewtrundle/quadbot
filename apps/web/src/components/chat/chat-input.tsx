'use client';

import { useState, useRef, useCallback } from 'react';
import { ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

type QuickAction = {
  label: string;
  message: string;
};

export function ChatInput({
  onSend,
  disabled,
  quickActions,
}: {
  onSend: (message: string) => void;
  disabled: boolean;
  quickActions: QuickAction[];
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput('');
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [input, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize
    const el = e.target;
    el.style.height = 'auto';
    const lineHeight = 20;
    const maxHeight = lineHeight * 4 + 16; // 4 rows + padding
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  };

  const handleQuickAction = (action: QuickAction) => {
    if (disabled) return;
    onSend(action.message);
  };

  return (
    <div className="space-y-2">
      {/* Quick action chips */}
      {quickActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={() => handleQuickAction(action)}
              disabled={disabled}
              className="rounded-full border border-border/50 bg-secondary/50 px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 rounded-xl border border-border/50 bg-secondary/30 p-2">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask QuadBot anything..."
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-50"
          style={{ minHeight: '20px' }}
        />
        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || !input.trim()}
          className="h-8 w-8 flex-shrink-0 rounded-lg"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
