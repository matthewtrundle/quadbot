'use client';

import { Suspense, lazy } from 'react';

const ChatPanel = lazy(() => import('./chat-panel').then((m) => ({ default: m.ChatPanel })));

export function ChatProvider({ brandId, brandName }: { brandId: string; brandName: string }) {
  return (
    <Suspense fallback={null}>
      <ChatPanel brandId={brandId} brandName={brandName} />
    </Suspense>
  );
}
