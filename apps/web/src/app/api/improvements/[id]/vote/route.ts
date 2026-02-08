import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { improvementSuggestions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const voteSchema = z.object({
  delta: z.number().min(-1).max(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const { delta } = voteSchema.parse(body);

    // Get current suggestion
    const [suggestion] = await db
      .select()
      .from(improvementSuggestions)
      .where(eq(improvementSuggestions.id, id))
      .limit(1);

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    // Update votes
    const newVotes = suggestion.votes + delta;
    await db
      .update(improvementSuggestions)
      .set({ votes: newVotes, updated_at: new Date() })
      .where(eq(improvementSuggestions.id, id));

    return NextResponse.json({ votes: newVotes });
  } catch (err) {
    console.error('Vote error:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
