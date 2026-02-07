import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { improvementSuggestions, improvementOutcomes } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const statusSchema = z.object({
  status: z.enum(['pending', 'approved', 'dismissed', 'implemented']),
  feedback: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, feedback } = statusSchema.parse(body);

    // Get current suggestion
    const [suggestion] = await db
      .select()
      .from(improvementSuggestions)
      .where(eq(improvementSuggestions.id, id))
      .limit(1);

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    // Update status
    await db
      .update(improvementSuggestions)
      .set({
        status,
        user_feedback: feedback || suggestion.user_feedback,
        updated_at: new Date(),
      })
      .where(eq(improvementSuggestions.id, id));

    // If marked as implemented, create an outcome record
    if (status === 'implemented') {
      await db.insert(improvementOutcomes).values({
        suggestion_id: id,
        implemented_at: new Date(),
        before_metrics: {}, // Will be populated when outcome is measured
        notes: feedback || null,
      });
    }

    return NextResponse.json({ status });
  } catch (err) {
    console.error('Status update error:', err);
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
