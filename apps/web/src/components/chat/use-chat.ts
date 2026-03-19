'use client';

import { useState, useCallback, useRef } from 'react';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: { tool: string; summary: string }[];
  timestamp: Date;
};

export function useChat(brandId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      setError(null);

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '',
        toolCalls: [],
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      abortRef.current = new AbortController();

      try {
        const res = await fetch(`/api/brands/${brandId}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: content.trim(),
            conversation_id: conversationId,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          throw new Error(`Chat request failed: ${res.status}`);
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              switch (event.type) {
                case 'text':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        content: last.content + event.content,
                      };
                    }
                    return updated;
                  });
                  break;

                case 'tool_use':
                  // tool_use fires first (no summary yet), we'll update on tool_result
                  break;

                case 'tool_result':
                  setMessages((prev) => {
                    const updated = [...prev];
                    const last = updated[updated.length - 1];
                    if (last.role === 'assistant') {
                      updated[updated.length - 1] = {
                        ...last,
                        toolCalls: [...(last.toolCalls || []), { tool: event.tool, summary: event.summary }],
                      };
                    }
                    return updated;
                  });
                  break;

                case 'done':
                  if (event.conversation_id) {
                    setConversationId(event.conversation_id);
                  }
                  break;

                case 'error':
                  setError(event.message || 'An error occurred');
                  break;
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          const message = err instanceof Error ? err.message : 'Failed to send message';
          setError(message);
          // Remove the empty assistant message on error
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant' && !last.content) {
              updated.pop();
            }
            return updated;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [brandId, conversationId, isStreaming],
  );

  const startNewChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setConversationId(null);
    setIsStreaming(false);
    setError(null);
  }, []);

  return { messages, sendMessage, startNewChat, isStreaming, error };
}
