import { describe, it, expect } from 'vitest';

/**
 * Unit tests for internal linking utility logic.
 * Tests pair deduplication and similarity threshold logic
 * without importing the full job module.
 */

describe('Internal Linking', () => {
  describe('pair deduplication', () => {
    it('creates canonical pair key regardless of order', () => {
      const makePairKey = (a: string, b: string) => [a, b].sort().join('::');

      expect(makePairKey('/blog/a', '/blog/b')).toBe(makePairKey('/blog/b', '/blog/a'));
      expect(makePairKey('/products/x', '/blog/y')).toBe('/blog/y::/products/x');
    });
  });

  describe('similarity filtering', () => {
    const MIN_SIMILARITY = 0.75;

    it('filters out pairs below threshold', () => {
      const pairs = [
        { similarity: 0.9, source: '/a', target: '/b' },
        { similarity: 0.5, source: '/c', target: '/d' },
        { similarity: 0.8, source: '/e', target: '/f' },
        { similarity: 0.7, source: '/g', target: '/h' },
      ];

      const filtered = pairs.filter((p) => p.similarity >= MIN_SIMILARITY);
      expect(filtered).toHaveLength(2);
      expect(filtered[0].similarity).toBe(0.9);
      expect(filtered[1].similarity).toBe(0.8);
    });

    it('sorts by similarity descending', () => {
      const pairs = [{ similarity: 0.8 }, { similarity: 0.95 }, { similarity: 0.85 }];

      pairs.sort((a, b) => b.similarity - a.similarity);
      expect(pairs[0].similarity).toBe(0.95);
      expect(pairs[2].similarity).toBe(0.8);
    });

    it('takes top N pairs', () => {
      const pairs = Array.from({ length: 20 }, (_, i) => ({
        similarity: 0.75 + i * 0.01,
      }));
      pairs.sort((a, b) => b.similarity - a.similarity);
      const top10 = pairs.slice(0, 10);
      expect(top10).toHaveLength(10);
      expect(top10[0].similarity).toBe(0.94);
    });
  });
});
