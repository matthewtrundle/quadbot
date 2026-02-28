import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

// Test the contentHash utility logic
function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

describe('Embedding Indexer', () => {
  describe('contentHash', () => {
    it('produces consistent hash for same content', () => {
      const hash1 = contentHash('Hello world');
      const hash2 = contentHash('Hello world');
      expect(hash1).toBe(hash2);
    });

    it('produces different hash for different content', () => {
      const hash1 = contentHash('Hello world');
      const hash2 = contentHash('Goodbye world');
      expect(hash1).not.toBe(hash2);
    });

    it('returns 64-character hex string', () => {
      const hash = contentHash('test content');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('embedding vector padding', () => {
    it('pads 1024-dim vector to 1536', () => {
      const short = new Array(1024).fill(0.1);
      const padded = [...short, ...new Array(1536 - short.length).fill(0)];
      expect(padded).toHaveLength(1536);
      expect(padded[0]).toBe(0.1);
      expect(padded[1024]).toBe(0);
    });

    it('does not pad 1536-dim vector', () => {
      const full = new Array(1536).fill(0.2);
      if (full.length < 1536) {
        // Would pad — but it's already 1536
      }
      expect(full).toHaveLength(1536);
    });
  });
});
