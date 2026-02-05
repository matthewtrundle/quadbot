import { db } from '@quadbot/db';
import { evaluationRuns } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';

export type CalibrationReport = {
  brandId: string;
  recentCalibrationError: number | null;
  trend: 'improving' | 'degrading' | 'stable' | 'insufficient_data';
  runsAnalyzed: number;
};

/**
 * Phase 3: Confidence Calibrator
 * Compares predicted confidence vs actual acceptance rate over time.
 * Returns calibration report for a brand.
 */
export async function getCalibrationReport(brandId: string): Promise<CalibrationReport> {
  const runs = await db
    .select()
    .from(evaluationRuns)
    .where(eq(evaluationRuns.brand_id, brandId))
    .orderBy(desc(evaluationRuns.created_at))
    .limit(10);

  if (runs.length === 0) {
    return {
      brandId,
      recentCalibrationError: null,
      trend: 'insufficient_data',
      runsAnalyzed: 0,
    };
  }

  const recentCalibrationError = runs[0].calibration_error;

  if (runs.length < 3) {
    return {
      brandId,
      recentCalibrationError,
      trend: 'insufficient_data',
      runsAnalyzed: runs.length,
    };
  }

  // Compare recent 3 runs vs older 3 runs
  const recent = runs.slice(0, 3);
  const older = runs.slice(3, 6);

  if (older.length === 0) {
    return {
      brandId,
      recentCalibrationError,
      trend: 'insufficient_data',
      runsAnalyzed: runs.length,
    };
  }

  const avgRecentError = recent.reduce((sum, r) => sum + (r.calibration_error || 0), 0) / recent.length;
  const avgOlderError = older.reduce((sum, r) => sum + (r.calibration_error || 0), 0) / older.length;

  const delta = avgRecentError - avgOlderError;

  let trend: CalibrationReport['trend'];
  if (Math.abs(delta) < 0.02) {
    trend = 'stable';
  } else if (delta < 0) {
    trend = 'improving';
  } else {
    trend = 'degrading';
  }

  return {
    brandId,
    recentCalibrationError,
    trend,
    runsAnalyzed: runs.length,
  };
}
