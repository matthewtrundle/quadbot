import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { playbookTemplates, playbookInstalls, playbooks } from '@quadbot/db';
import { eq, sql, and } from 'drizzle-orm';
import { getSession } from '@/lib/auth-session';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { templateId, brandId } = body;

    if (!templateId || !brandId) {
      return NextResponse.json({ error: 'templateId and brandId are required' }, { status: 400 });
    }

    // Check if already installed
    const [existing] = await db
      .select({ id: playbookInstalls.id })
      .from(playbookInstalls)
      .where(and(eq(playbookInstalls.template_id, templateId), eq(playbookInstalls.brand_id, brandId)))
      .limit(1);

    if (existing) {
      return NextResponse.json({ error: 'Template already installed for this brand' }, { status: 409 });
    }

    // Fetch the template
    const [template] = await db.select().from(playbookTemplates).where(eq(playbookTemplates.id, templateId)).limit(1);

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    if (!template.is_published) {
      return NextResponse.json({ error: 'Template is not published' }, { status: 400 });
    }

    // Create a new playbook from the template
    const [newPlaybook] = await db
      .insert(playbooks)
      .values({
        brand_id: brandId,
        name: template.name,
        trigger_type: template.trigger_type,
        trigger_conditions: template.trigger_conditions,
        actions: template.actions,
        is_active: true,
      })
      .returning();

    // Create the install record
    await db.insert(playbookInstalls).values({
      template_id: templateId,
      brand_id: brandId,
      playbook_id: newPlaybook.id,
    });

    // Increment install_count on the template
    await db
      .update(playbookTemplates)
      .set({
        install_count: sql`${playbookTemplates.install_count} + 1`,
        updated_at: new Date(),
      })
      .where(eq(playbookTemplates.id, templateId));

    return NextResponse.json(newPlaybook, { status: 201 });
  } catch (error) {
    console.error('Error installing marketplace template:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
