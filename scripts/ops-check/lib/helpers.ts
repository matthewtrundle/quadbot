export type CheckResult = {
  status: 'PASS' | 'FAIL' | 'SKIP';
  category: string;
  message: string;
  error?: string;
};

const results: CheckResult[] = [];

export function pass(category: string, message: string) {
  const r = { status: 'PASS' as const, category, message };
  results.push(r);
  console.log(`[PASS] ${category}: ${message}`);
}

export function fail(category: string, message: string, error?: string) {
  const r = { status: 'FAIL' as const, category, message, error };
  results.push(r);
  console.log(`[FAIL] ${category}: ${message}${error ? ` - ${error}` : ''}`);
}

export function skip(category: string, message: string) {
  const r = { status: 'SKIP' as const, category, message };
  results.push(r);
  console.log(`[SKIP] ${category}: ${message}`);
}

export function getResults(): CheckResult[] {
  return results;
}

export function printSummary() {
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  console.log('');
  console.log(`Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  return failed;
}

export async function pollUntil<T>(
  fn: () => Promise<T | null>,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T | null> {
  const { timeoutMs = 60000, intervalMs = 2000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await sleep(intervalMs);
  }

  return null;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
