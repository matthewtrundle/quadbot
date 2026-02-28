'use client';

import { useEffect, useState, useRef, useCallback } from 'react';

export type SSEEvent = {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
};

export type UseSSEReturn = {
  events: SSEEvent[];
  isConnected: boolean;
  lastEvent: SSEEvent | null;
};

/**
 * React hook for consuming SSE events from the dashboard endpoint.
 * Auto-reconnects on connection loss.
 */
export function useSSE(brandId: string | null): UseSSEReturn {
  const [events, setEvents] = useState<SSEEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<SSEEvent | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!brandId) return;

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `/api/sse?brandId=${encodeURIComponent(brandId)}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('connected', () => {
      setIsConnected(true);
    });

    eventSource.addEventListener('update', (event) => {
      try {
        const data = JSON.parse(event.data);
        const sseEvent: SSEEvent = {
          type: data.type || 'unknown',
          data,
          timestamp: Date.now(),
        };
        setLastEvent(sseEvent);
        setEvents((prev) => [sseEvent, ...prev].slice(0, 50)); // Keep last 50 events
      } catch {
        // Ignore parse errors
      }
    });

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();

      // Auto-reconnect after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };
  }, [brandId]);

  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return { events, isConnected, lastEvent };
}
