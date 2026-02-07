import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials } from '@quadbot/db';
import { desc } from 'drizzle-orm';

/**
 * GET /api/credentials
 *
 * Lists all shared credentials (without decrypting sensitive data)
 */
export async function GET() {
  try {
    const credentials = await db
      .select({
        id: sharedCredentials.id,
        type: sharedCredentials.type,
        name: sharedCredentials.name,
        config: sharedCredentials.config,
        created_at: sharedCredentials.created_at,
      })
      .from(sharedCredentials)
      .orderBy(desc(sharedCredentials.created_at));

    return NextResponse.json({ credentials });
  } catch (error) {
    console.error('Failed to fetch credentials:', error);
    return NextResponse.json({ error: 'Failed to fetch credentials' }, { status: 500 });
  }
}
