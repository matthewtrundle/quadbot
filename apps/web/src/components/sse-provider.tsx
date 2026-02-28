'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useSSE, type UseSSEReturn } from '@/hooks/use-sse';

const SSEContext = createContext<UseSSEReturn>({
  events: [],
  isConnected: false,
  lastEvent: null,
});

export function useSSEContext() {
  return useContext(SSEContext);
}

export function SSEProvider({ brandId, children }: { brandId: string | null; children: ReactNode }) {
  const sse = useSSE(brandId);
  return <SSEContext.Provider value={sse}>{children}</SSEContext.Provider>;
}
