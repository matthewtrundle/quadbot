import { headers } from 'next/headers';
import { auth } from './auth';

/**
 * Extended user type that includes custom fields from better-auth additionalFields.
 * The base better-auth User type doesn't include brandId/role,
 * so we use this when accessing those properties.
 */
export type UserWithBrand = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  role?: string | null;
  brandId?: string | null;
};

/** Helper to safely extract brandId from a session user. */
export function getUserBrandId(user: UserWithBrand): string | null {
  return user.brandId ?? null;
}

export async function getSession() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session;
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized');
  }
  return session;
}

export async function requireBrandId(): Promise<string> {
  const session = await requireSession();
  const brandId = (session.user as UserWithBrand).brandId;
  if (!brandId) {
    throw new Error('No brand associated with user');
  }
  return brandId;
}

export function isAdmin(session: { user: UserWithBrand }): boolean {
  return session.user.role === 'admin';
}
