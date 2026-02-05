import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiKeys, generateApiKey } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const createKeySchema = z.object({
  name: z.string().min(1).max(255),
  expires_at: z.string().datetime().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      key_prefix: apiKeys.key_prefix,
      last_used_at: apiKeys.last_used_at,
      expires_at: apiKeys.expires_at,
      created_at: apiKeys.created_at,
    })
    .from(apiKeys)
    .where(eq(apiKeys.brand_id, brandId));

  return NextResponse.json(keys);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const body = await req.json();
  const parsed = createKeySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { key, prefix, hash } = generateApiKey();

  const [created] = await db
    .insert(apiKeys)
    .values({
      brand_id: brandId,
      name: parsed.data.name,
      key_hash: hash,
      key_prefix: prefix,
      expires_at: parsed.data.expires_at ? new Date(parsed.data.expires_at) : null,
    })
    .returning();

  // Return the full key ONLY on creation (never stored, never retrievable again)
  return NextResponse.json(
    {
      id: created.id,
      name: created.name,
      key,
      key_prefix: prefix,
      expires_at: created.expires_at,
      created_at: created.created_at,
    },
    { status: 201 },
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const { searchParams } = new URL(req.url);
  const keyId = searchParams.get('keyId');

  if (!keyId) {
    return NextResponse.json({ error: 'keyId query parameter required' }, { status: 400 });
  }

  const [deleted] = await db
    .delete(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.brand_id, brandId)))
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: 'API key not found' }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
