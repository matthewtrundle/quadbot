import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys, actionDrafts } from '@quadbot/db';
import { hashApiKey } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';

export type AuthResult = {
  brandId: string;
  role: 'service' | 'brand';
};

/**
 * Authenticate a request using API key from Authorization header.
 * Returns brandId and role, or null if invalid.
 */
export async function authenticateRequest(req: NextRequest): Promise<AuthResult | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;

  const key = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  if (!key) return null;

  const hash = hashApiKey(key);

  const [apiKey] = await db
    .select({
      id: apiKeys.id,
      brand_id: apiKeys.brand_id,
      expires_at: apiKeys.expires_at,
    })
    .from(apiKeys)
    .where(eq(apiKeys.key_hash, hash))
    .limit(1);

  if (!apiKey) return null;

  // Check expiry
  if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
    return null;
  }

  // Update last_used_at (fire-and-forget)
  db.update(apiKeys)
    .set({ last_used_at: new Date() })
    .where(eq(apiKeys.id, apiKey.id))
    .then(() => {})
    .catch(() => {});

  return {
    brandId: apiKey.brand_id,
    role: 'brand',
  };
}

/**
 * Guard: verify the authenticated brand has access to the requested brand resource.
 * Returns true if access is allowed.
 */
export async function requireBrandAccess(brandId: string, req: NextRequest): Promise<AuthResult | null> {
  const auth = await authenticateRequest(req);
  if (!auth) return null;

  // Service role can access any brand
  if (auth.role === 'service') return auth;

  // Brand role must match the requested brand
  if (auth.brandId !== brandId) return null;

  return auth;
}

/**
 * Guard: verify the action draft belongs to the authenticated brand.
 */
export async function requireActionDraftAccess(actionDraftId: string, req: NextRequest): Promise<AuthResult | null> {
  const auth = await authenticateRequest(req);
  if (!auth) return null;

  if (auth.role === 'service') return auth;

  const [draft] = await db
    .select({ brand_id: actionDrafts.brand_id })
    .from(actionDrafts)
    .where(eq(actionDrafts.id, actionDraftId))
    .limit(1);

  if (!draft || draft.brand_id !== auth.brandId) return null;

  return auth;
}
