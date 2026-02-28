import { describe, it, expect } from 'vitest';

/**
 * Tests for health endpoint response building logic.
 * Replicates the pure function that constructs the health
 * check response to validate status, DB flag, and uptime.
 */

interface HealthResponse {
  status: string;
  db: boolean;
  uptime: number;
}

function buildHealthResponse(
  dbOk: boolean,
  startedAt: number
): HealthResponse {
  return {
    status: dbOk ? 'ok' : 'error',
    db: dbOk,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  };
}

describe('Health Check Response Builder', () => {
  describe('status field', () => {
    it('returns "ok" status when database is healthy', () => {
      const response = buildHealthResponse(true, Date.now());
      expect(response.status).toBe('ok');
    });

    it('returns "error" status when database check fails', () => {
      const response = buildHealthResponse(false, Date.now());
      expect(response.status).toBe('error');
    });
  });

  describe('db field', () => {
    it('returns true for db when database is healthy', () => {
      const response = buildHealthResponse(true, Date.now());
      expect(response.db).toBe(true);
    });

    it('returns false for db when database check fails', () => {
      const response = buildHealthResponse(false, Date.now());
      expect(response.db).toBe(false);
    });
  });

  describe('uptime calculation', () => {
    it('reports uptime as zero when just started', () => {
      const response = buildHealthResponse(true, Date.now());
      expect(response.uptime).toBe(0);
    });

    it('reports correct uptime for a known start time', () => {
      // Started 120 seconds ago
      const startedAt = Date.now() - 120_000;
      const response = buildHealthResponse(true, startedAt);
      // Allow small margin for test execution time
      expect(response.uptime).toBeGreaterThanOrEqual(119);
      expect(response.uptime).toBeLessThanOrEqual(121);
    });

    it('returns integer uptime (floor division)', () => {
      // Started 1500ms ago should be 1 second, not 1.5
      const startedAt = Date.now() - 1_500;
      const response = buildHealthResponse(true, startedAt);
      expect(Number.isInteger(response.uptime)).toBe(true);
      expect(response.uptime).toBe(1);
    });

    it('handles large uptimes correctly', () => {
      // 24 hours = 86400 seconds
      const startedAt = Date.now() - 86_400_000;
      const response = buildHealthResponse(true, startedAt);
      expect(response.uptime).toBeGreaterThanOrEqual(86399);
      expect(response.uptime).toBeLessThanOrEqual(86401);
    });
  });

  describe('response structure', () => {
    it('contains exactly status, db, and uptime keys', () => {
      const response = buildHealthResponse(true, Date.now());
      const keys = Object.keys(response).sort();
      expect(keys).toEqual(['db', 'status', 'uptime']);
    });

    it('status is always a string', () => {
      expect(typeof buildHealthResponse(true, Date.now()).status).toBe(
        'string'
      );
      expect(typeof buildHealthResponse(false, Date.now()).status).toBe(
        'string'
      );
    });

    it('uptime is always a non-negative number', () => {
      const response = buildHealthResponse(true, Date.now());
      expect(response.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
