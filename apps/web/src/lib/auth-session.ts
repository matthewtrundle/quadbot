import { headers } from 'next/headers';
import { auth } from './auth';

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
  const brandId = (session.user as any).brandId;
  if (!brandId) {
    throw new Error('No brand associated with user');
  }
  return brandId;
}

export function isAdmin(session: { user: any }): boolean {
  return session.user.role === 'admin';
}
