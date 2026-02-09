'use client';

import { useState } from 'react';
import { ActionDraftCard } from '@/components/action-draft-card';

type ActionDraft = {
  id: string;
  type: string;
  risk: string;
  status: string;
  requires_approval: boolean;
  payload: Record<string, unknown>;
  created_at: Date;
};

type Tab = 'pending' | 'completed' | 'rejected';

const tabs: { key: Tab; label: string; filter: (d: ActionDraft) => boolean }[] = [
  { key: 'pending', label: 'Pending', filter: (d) => d.status === 'pending' },
  { key: 'completed', label: 'Completed', filter: (d) => ['approved', 'executed', 'executed_stub'].includes(d.status) },
  { key: 'rejected', label: 'Rejected', filter: (d) => d.status === 'rejected' },
];

export function ActionDraftsList({ drafts }: { drafts: ActionDraft[] }) {
  const counts = {
    pending: drafts.filter(tabs[0].filter).length,
    completed: drafts.filter(tabs[1].filter).length,
    rejected: drafts.filter(tabs[2].filter).length,
  };

  // Default to pending if any exist, otherwise completed
  const [activeTab, setActiveTab] = useState<Tab>(
    counts.pending > 0 ? 'pending' : counts.completed > 0 ? 'completed' : 'rejected',
  );

  const filtered = drafts.filter(tabs.find((t) => t.key === activeTab)!.filter);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className={`ml-1.5 text-xs ${
                activeTab === tab.key ? 'text-foreground/60' : 'text-muted-foreground'
              }`}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-8">
          {activeTab === 'pending' && 'No actions awaiting review.'}
          {activeTab === 'completed' && 'No completed actions yet.'}
          {activeTab === 'rejected' && 'No rejected actions.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((draft) => (
            <ActionDraftCard
              key={draft.id}
              draft={{
                ...draft,
                payload: (draft.payload as Record<string, unknown>) || {},
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
