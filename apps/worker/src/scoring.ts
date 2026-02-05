/**
 * Phase 5: Deterministic Scoring Functions
 *
 * computeBaseScore(rec):
 *   severity:  traffic_impact_estimate * 0.3
 *   recency:   max(0, 1 - days_old/30) * 0.2
 *   confidence: rec.confidence * 0.2
 *   effort:    inverse_effort_weight * 0.15  (minutes=1.0, hours=0.6, days=0.3)
 *   strategic: strategic_tag_match_score * 0.15
 *
 * Final: base_score + (delta_rank * 0.1), clamped to [0, 1]
 */

export type ScoringInput = {
  priority: string;       // 'low' | 'medium' | 'high' | 'critical'
  confidence: number | null;
  effortEstimate: string | null;  // 'minutes' | 'hours' | 'days'
  strategicAlignment: number | null;
  createdAt: Date;
};

const PRIORITY_IMPACT: Record<string, number> = {
  critical: 1.0,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
};

const EFFORT_WEIGHT: Record<string, number> = {
  minutes: 1.0,
  hours: 0.6,
  days: 0.3,
};

export function computeBaseScore(input: ScoringInput): number {
  // Severity: based on priority as proxy for traffic impact
  const severity = (PRIORITY_IMPACT[input.priority] || 0.5) * 0.3;

  // Recency: max(0, 1 - days_old/30)
  const daysOld = (Date.now() - input.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  const recency = Math.max(0, 1 - daysOld / 30) * 0.2;

  // Confidence
  const confidence = (input.confidence ?? 0.5) * 0.2;

  // Effort: inverse weight (quick tasks rank higher)
  const effortWeight = input.effortEstimate
    ? (EFFORT_WEIGHT[input.effortEstimate] || 0.5)
    : 0.5;
  const effort = effortWeight * 0.15;

  // Strategic alignment
  const strategic = (input.strategicAlignment ?? 0.5) * 0.15;

  return severity + recency + confidence + effort + strategic;
}

/**
 * Apply Claude's bounded delta adjustment to base score.
 * Delta is clamped to [-2, +2], scaled by 0.1.
 */
export function applyClaudeDelta(baseScore: number, deltaRank: number): number {
  const clampedDelta = Math.max(-2, Math.min(2, deltaRank));
  return Math.max(0, Math.min(1, baseScore + clampedDelta * 0.1));
}

/**
 * Convert effort estimate string to estimated review minutes.
 */
export function estimateReviewMinutes(effortEstimate: string | null): number {
  switch (effortEstimate) {
    case 'minutes': return 5;
    case 'hours': return 30;
    case 'days': return 120;
    default: return 15;
  }
}
