import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

const startedAt = Date.now();

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({
      status: 'ok',
      db: true,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
    });
  } catch {
    return NextResponse.json(
      { status: 'error', db: false, uptime: Math.floor((Date.now() - startedAt) / 1000) },
      { status: 503 },
    );
  }
}
