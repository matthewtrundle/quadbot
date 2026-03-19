import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { reportSchedules, clientReports, brands } from '@quadbot/db';
import { eq, and, lte } from 'drizzle-orm';

/**
 * GET /api/reports/schedule/check
 * Cron endpoint — checks for due report schedules and triggers generation.
 * No auth required (called by cron/worker).
 */
export async function GET() {
  try {
    const now = new Date();

    // Find all active schedules that are due
    const dueSchedules = await db
      .select()
      .from(reportSchedules)
      .where(and(eq(reportSchedules.is_active, true), lte(reportSchedules.next_run_at, now)));

    if (dueSchedules.length === 0) {
      return NextResponse.json({ triggered: 0, message: 'No schedules due' });
    }

    let triggered = 0;

    for (const schedule of dueSchedules) {
      try {
        // Verify the brand still exists
        const [brand] = await db.select().from(brands).where(eq(brands.id, schedule.brand_id)).limit(1);

        if (!brand) {
          console.warn(`Brand ${schedule.brand_id} not found for schedule ${schedule.id}, deactivating`);
          await db
            .update(reportSchedules)
            .set({ is_active: false, updated_at: now })
            .where(eq(reportSchedules.id, schedule.id));
          continue;
        }

        // Determine report period based on frequency
        const periodEnd = now;
        const periodStart = new Date(now);
        if (schedule.frequency === 'weekly') {
          periodStart.setDate(periodStart.getDate() - 7);
        } else {
          // monthly
          periodStart.setDate(periodStart.getDate() - 30);
        }

        // Create a client report record (will be picked up by the generation worker)
        await db.insert(clientReports).values({
          brand_id: schedule.brand_id,
          title: `${brand.name} ${schedule.frequency === 'weekly' ? 'Weekly' : 'Monthly'} Report`,
          period_start: periodStart,
          period_end: periodEnd,
          status: 'generating',
          recipient_emails: schedule.recipient_emails,
        });

        // Calculate next run time
        const nextRunAt = new Date(schedule.next_run_at);
        if (schedule.frequency === 'weekly') {
          nextRunAt.setDate(nextRunAt.getDate() + 7);
        } else {
          nextRunAt.setDate(nextRunAt.getDate() + 30);
        }

        await db
          .update(reportSchedules)
          .set({
            next_run_at: nextRunAt,
            updated_at: now,
          })
          .where(eq(reportSchedules.id, schedule.id));

        triggered++;
      } catch (err) {
        console.error(`Failed to process schedule ${schedule.id}:`, err);
      }
    }

    return NextResponse.json({
      triggered,
      total_due: dueSchedules.length,
      message: `Triggered ${triggered} of ${dueSchedules.length} due schedules`,
    });
  } catch (error) {
    console.error('Schedule check error:', error);
    return NextResponse.json({ error: 'Failed to check schedules' }, { status: 500 });
  }
}
