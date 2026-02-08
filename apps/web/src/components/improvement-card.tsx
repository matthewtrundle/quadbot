'use client';

import { useState } from 'react';

type Suggestion = {
  id: string;
  brand_id: string | null;
  category: string;
  title: string;
  description: string;
  rationale: string;
  expected_impact: string;
  implementation_effort: string;
  priority: string;
  status: string;
  votes: number;
  user_feedback: string | null;
  context: Record<string, unknown> | null;
  created_at: Date;
};

const categoryColors: Record<string, string> = {
  integration: 'bg-quad-purple/15 text-quad-purple',
  data_source: 'bg-quad-blue/15 text-quad-blue',
  feature: 'bg-success/15 text-success',
  analysis: 'bg-warning/15 text-warning',
  automation: 'bg-quad-cyan/15 text-quad-cyan',
};

const priorityColors: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive',
  high: 'bg-warning/15 text-warning',
  medium: 'bg-warning/15 text-warning',
  low: 'bg-secondary text-muted-foreground',
};

const effortLabels: Record<string, string> = {
  low: 'Easy',
  medium: 'Moderate',
  high: 'Complex',
};

export function ImprovementCard({ suggestion }: { suggestion: Suggestion }) {
  const [votes, setVotes] = useState(suggestion.votes);
  const [status, setStatus] = useState(suggestion.status);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleVote = async (delta: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/improvements/${suggestion.id}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes);
      }
    } catch (err) {
      console.error('Failed to vote:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/improvements/${suggestion.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setStatus(newStatus);
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const context = (suggestion.context || {}) as {
    prerequisites?: string[];
    example_use_case?: string;
    current_capabilities?: Array<{ name: string; quality_score: number }>;
  };

  return (
    <div className="border border-border/50 rounded-lg p-4 bg-card transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex justify-between items-start mb-2">
        <div className="flex gap-2 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[suggestion.category] || 'bg-secondary text-muted-foreground'}`}
          >
            {suggestion.category}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[suggestion.priority] || 'bg-secondary text-muted-foreground'}`}
          >
            {suggestion.priority}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
            {effortLabels[suggestion.implementation_effort] || suggestion.implementation_effort}
          </span>
        </div>

        {/* Vote buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote(1)}
            disabled={isLoading || status !== 'pending'}
            className="p-1 hover:bg-success/10 rounded disabled:opacity-50"
            title="Upvote"
          >
            <svg className="w-4 h-4 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-sm font-medium min-w-[2rem] text-center">{votes}</span>
          <button
            onClick={() => handleVote(-1)}
            disabled={isLoading || status !== 'pending'}
            className="p-1 hover:bg-destructive/10 rounded disabled:opacity-50"
            title="Downvote"
          >
            <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <h4 className="font-medium text-sm mb-1">{suggestion.title}</h4>
      <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-xs text-quad-cyan hover:underline mb-2"
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </button>

      {isExpanded && (
        <div className="space-y-3 mt-3 pt-3 border-t">
          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-1">Rationale</h5>
            <p className="text-sm">{suggestion.rationale}</p>
          </div>

          <div>
            <h5 className="text-xs font-medium text-muted-foreground mb-1">Expected Impact</h5>
            <p className="text-sm">{suggestion.expected_impact}</p>
          </div>

          {context.example_use_case && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">Example Use Case</h5>
              <p className="text-sm">{context.example_use_case}</p>
            </div>
          )}

          {context.prerequisites && context.prerequisites.length > 0 && (
            <div>
              <h5 className="text-xs font-medium text-muted-foreground mb-1">Prerequisites</h5>
              <ul className="text-sm list-disc list-inside">
                {context.prerequisites.map((prereq, i) => (
                  <li key={i}>{prereq}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {status === 'pending' && (
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <button
            onClick={() => handleStatusChange('approved')}
            disabled={isLoading}
            className="flex-1 text-xs py-1.5 px-3 bg-success text-success-foreground rounded hover:bg-success/90 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => handleStatusChange('dismissed')}
            disabled={isLoading}
            className="flex-1 text-xs py-1.5 px-3 bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 disabled:opacity-50"
          >
            Dismiss
          </button>
        </div>
      )}

      {status === 'approved' && (
        <div className="flex gap-2 mt-3 pt-3 border-t">
          <button
            onClick={() => handleStatusChange('implemented')}
            disabled={isLoading}
            className="flex-1 text-xs py-1.5 px-3 bg-quad-blue text-white rounded hover:bg-quad-blue/90 disabled:opacity-50"
          >
            Mark Implemented
          </button>
        </div>
      )}

      <div className="text-xs text-muted-foreground mt-2">
        {new Date(suggestion.created_at).toLocaleDateString()}
      </div>
    </div>
  );
}
