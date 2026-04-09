/**
 * Recommendation quality utilities
 *
 * Global confidence thresholds and filtering logic to prevent low-quality
 * recommendations from polluting the pipeline.
 */

/**
 * Minimum confidence scores by recommendation source.
 * Higher thresholds for sources that tend to produce more noise.
 */
export const MIN_CONFIDENCE_BY_SOURCE: Record<string, number> = {
  trend_scan: 0.75,
  gsc_daily_digest: 0.7,
  anomaly_detector: 0.8,
  default: 0.7,
};

/**
 * Minimum confidence scores by recommendation type.
 * Content opportunities require higher confidence to avoid stretch recommendations.
 */
export const MIN_CONFIDENCE_BY_TYPE: Record<string, number> = {
  content_opportunity: 0.8,
  brand_monitoring: 0.7,
  industry_awareness: 0.7,
  default: 0.7,
};

/**
 * Check if a recommendation should be created based on confidence thresholds.
 *
 * @param source - The recommendation source (e.g., 'trend_scan')
 * @param confidence - The confidence score (0-1), or null if not available
 * @param type - Optional recommendation type for type-specific thresholds
 * @returns true if the recommendation meets the confidence threshold
 */
export function shouldCreateRecommendation(source: string, confidence: number | null, type?: string): boolean {
  // If no confidence provided, allow creation (can't filter what we don't have)
  if (confidence === null || confidence === undefined) {
    return true;
  }

  // Check source threshold
  const sourceThreshold = MIN_CONFIDENCE_BY_SOURCE[source] ?? MIN_CONFIDENCE_BY_SOURCE.default;
  if (confidence < sourceThreshold) {
    return false;
  }

  // Check type threshold if provided
  if (type) {
    const typeThreshold = MIN_CONFIDENCE_BY_TYPE[type] ?? MIN_CONFIDENCE_BY_TYPE.default;
    if (confidence < typeThreshold) {
      return false;
    }
  }

  return true;
}

/**
 * Get the effective confidence threshold for a given source and type.
 * Returns the higher of the two thresholds.
 */
export function getConfidenceThreshold(source: string, type?: string): number {
  const sourceThreshold = MIN_CONFIDENCE_BY_SOURCE[source] ?? MIN_CONFIDENCE_BY_SOURCE.default;

  if (!type) {
    return sourceThreshold;
  }

  const typeThreshold = MIN_CONFIDENCE_BY_TYPE[type] ?? MIN_CONFIDENCE_BY_TYPE.default;
  return Math.max(sourceThreshold, typeThreshold);
}
