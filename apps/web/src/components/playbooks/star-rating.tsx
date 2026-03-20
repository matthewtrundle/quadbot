'use client';

import { useState } from 'react';

interface StarRatingProps {
  rating: number;
  count?: number;
  interactive?: boolean;
  onRate?: (rating: number) => void;
}

export function StarRating({ rating, count, interactive = false, onRate }: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);

  const displayRating = hoverRating || rating;

  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`text-sm ${
              interactive ? 'cursor-pointer' : ''
            } ${star <= displayRating ? 'text-yellow-400' : 'text-muted-foreground/30'}`}
            onClick={() => {
              if (interactive && onRate) {
                onRate(star);
              }
            }}
            onMouseEnter={() => {
              if (interactive) setHoverRating(star);
            }}
            onMouseLeave={() => {
              if (interactive) setHoverRating(0);
            }}
          >
            {star <= displayRating ? '\u2605' : '\u2606'}
          </span>
        ))}
      </div>
      {typeof count === 'number' && <span className="text-xs text-muted-foreground">({count})</span>}
    </div>
  );
}
