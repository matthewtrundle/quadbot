import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { artifacts } from '@quadbot/db';
import { eq } from 'drizzle-orm';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json();
    const { selected_variant_index, selected_title } = body;

    // Load the artifact
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .limit(1);

    if (!artifact) {
      return NextResponse.json({ error: 'Artifact not found' }, { status: 404 });
    }

    if (artifact.status !== 'draft') {
      return NextResponse.json(
        { error: 'Only draft artifacts can be approved' },
        { status: 400 },
      );
    }

    // Update the artifact with the approved selection
    const updatedContent = {
      ...artifact.content,
      approved_variant_index: selected_variant_index,
      approved_title: selected_title,
      approved_at: new Date().toISOString(),
    };

    await db
      .update(artifacts)
      .set({
        status: 'approved',
        content: updatedContent,
        updated_at: new Date(),
      })
      .where(eq(artifacts.id, id));

    return NextResponse.json({
      success: true,
      message: 'Artifact approved',
    });
  } catch (err) {
    console.error('Error approving artifact:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Approval failed' },
      { status: 500 },
    );
  }
}
