const BASE_URL = process.env.OPS_CHECK_URL || 'http://localhost:3000';

export async function apiGet<T = any>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`);
  const data = await res.json() as T;
  return { ok: res.ok, status: res.status, data };
}

export async function apiPost<T = any>(path: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json() as T;
  return { ok: res.ok, status: res.status, data };
}

export async function apiDelete<T = any>(path: string): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(`${BASE_URL}${path}`, { method: 'DELETE' });
  let data: any = null;
  try { data = await res.json(); } catch {}
  return { ok: res.ok, status: res.status, data };
}

export async function isWebAppRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/brands`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
