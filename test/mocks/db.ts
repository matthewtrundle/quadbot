import { vi } from 'vitest';

/**
 * Creates a mock Drizzle-like database object.
 *
 * Usage:
 *   const db = createMockDb();
 *   db._results.set('select', [{ id: '1', name: 'Test' }]);
 *   await someJobHandler({ db, ... });
 *   expect(db.insert).toHaveBeenCalled();
 *
 * For chained queries like db.select().from(table).where(...).limit(1),
 * the mock returns _results.get('select') at the end of the chain.
 *
 * For db.insert(table).values(data).returning(), use _results.get('insert').
 */
export function createMockDb() {
  const results = new Map<string, unknown[]>();

  function createChain(key: string) {
    const chain: Record<string, unknown> = {};
    const chainFn = (..._args: unknown[]) => chain;

    // All chainable methods just return the same chain
    for (const method of ['from', 'where', 'limit', 'orderBy', 'offset', 'innerJoin', 'leftJoin', 'set', 'groupBy']) {
      chain[method] = vi.fn().mockImplementation(() => chain);
    }

    // Terminal methods resolve the chain
    chain.returning = vi.fn().mockImplementation(() => Promise.resolve(results.get(key) ?? []));
    chain.execute = vi.fn().mockImplementation(() => Promise.resolve(results.get(key) ?? []));

    // Make the chain itself thenable (for `await db.select().from(t).where(...)`)
    chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
      return Promise.resolve(results.get(key) ?? []).then(resolve, reject);
    };

    return vi.fn().mockImplementation(chainFn);
  }

  const db = {
    select: createChain('select'),
    insert: createChain('insert'),
    update: createChain('update'),
    delete: createChain('delete'),
    _results: results,
  };

  return db as typeof db & { _results: Map<string, unknown[]> };
}

export type MockDb = ReturnType<typeof createMockDb>;
