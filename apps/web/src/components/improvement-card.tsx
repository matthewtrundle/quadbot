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
  integration: 'bg-purple-100 text-purple-800',
  data_source: 'bg-blue-100 text-blue-800',
  feature: 'bg-green-100 text-green-800',
  analysis: 'bg-orange-100 text-orange-800',
  automation: 'bg-cyan-100 text-cyan-800',
};

const priorityColors: Record<string, string> = {
  critical: 'bg-red-100 text-red-800',
  high: 'bg-orange-100 text-orange-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-gray-100 text-gray-800',
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
    <div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="flex justify-between items-start mb-2">
        <div className="flex gap-2 flex-wrap">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${categoryColors[suggestion.category] || 'bg-gray-100 text-gray-800'}`}
          >
            {suggestion.category}
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${priorityColors[suggestion.priority] || 'bg-gray-100 text-gray-800'}`}
          >
            {suggestion.priority}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
            {effortLabels[suggestion.implementation_effort] || suggestion.implementation_effort}
          </span>
        </div>

        {/* Vote buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleVote(1)}
            disabled={isLoading || status !== 'pending'}
            className="p-1 hover:bg-green-50 rounded disabled:opacity-50"
            title="Upvote"
          >
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>
          <span className="text-sm font-medium min-w-[2rem] text-center">{votes}</span>
          <button
            onClick={() => handleVote(-1)}
            disabled={isLoading || status !== 'pending'}
            className="p-1 hover:bg-red-50 rounded disabled:opacity-50"
            title="Downvote"
          >
            <svg className="w-4 h-4 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <h4 className="font-medium text-sm mb-1">{suggestion.title}</h4>
      <p className="text-sm text-muted-foreground mb-2">{suggestion.description}</p>

      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="text-xs text-blue-600 hover:underline mb-2"
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
            className="flex-1 text-xs py-1.5 px-3 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={() => handleStatusChange('dismissed')}
            disabled={isLoading}
            className="flex-1 text-xs py-1.5 px-3 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 disabled:opacity-50"
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
            className="flex-1 text-xs py-1.5 px-3 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
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
