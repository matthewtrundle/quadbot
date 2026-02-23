'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { ThumbsUp, ThumbsDown, AlertTriangle } from 'lucide-react';

type FeedbackRating = 'helpful' | 'not_helpful' | 'harmful';

export function RecommendationFeedback({
  recId,
  existingFeedback,
}: {
  recId: string;
  existingFeedback?: { rating: string; comment?: string };
}) {
  const [rating, setRating] = useState<FeedbackRating | null>(
    (existingFeedback?.rating as FeedbackRating) || null,
  );
  const [comment, setComment] = useState(existingFeedback?.comment || '');
  const [showComment, setShowComment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(!!existingFeedback);

  const submit = async (selectedRating: FeedbackRating) => {
    setSubmitting(true);
    setRating(selectedRating);
    try {
      const res = await fetch(`/api/recommendations/${recId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: selectedRating, comment: comment || undefined }),
      });
      if (res.ok) {
        setSubmitted(true);
        toast.success('Feedback submitted');
      } else {
        toast.error('Failed to submit feedback');
      }
    } catch {
      toast.error('Failed to submit feedback');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && rating) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Feedback:</span>
        <span className={
          rating === 'helpful' ? 'text-success' :
          rating === 'harmful' ? 'text-destructive' :
          'text-muted-foreground'
        }>
          {rating === 'helpful' ? 'Helpful' : rating === 'harmful' ? 'Harmful' : 'Not helpful'}
        </span>
        {comment && <span className="text-xs">({comment})</span>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Was this helpful?</span>
        <div className="flex gap-1">
          <button
            onClick={() => submit('helpful')}
            disabled={submitting}
            className="rounded-md p-1.5 text-muted-foreground hover:text-success hover:bg-success/10 transition-colors disabled:opacity-50"
            title="Helpful"
            aria-label="Helpful"
          >
            <ThumbsUp className="h-4 w-4" />
          </button>
          <button
            onClick={() => submit('not_helpful')}
            disabled={submitting}
            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            title="Not helpful"
            aria-label="Not helpful"
          >
            <ThumbsDown className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              setShowComment(true);
              setRating('harmful');
            }}
            disabled={submitting}
            className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            title="Harmful / Wrong"
            aria-label="Harmful or wrong"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        </div>
      </div>
      {showComment && (
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="What was wrong? (optional)"
            className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => submit('harmful')}
            disabled={submitting}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground"
          >
            Submit
          </button>
        </div>
      )}
    </div>
  );
}
