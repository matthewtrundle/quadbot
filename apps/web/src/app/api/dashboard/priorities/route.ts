import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recommendations, brands } from '@quadbot/db';
import { desc, isNotNull, eq } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  // Get top 20 ranked recommendations across all brands
  const ranked = await db
    .select({
      id: recommendations.id,
      brand_id: recommendations.brand_id,
      brand_name: brands.name,
      title: recommendations.title,
      source: recommendations.source,
      priority: recommendations.priority,
      priority_rank: recommendations.priority_rank,
      base_score: recommendations.base_score,
      roi_score: recommendations.roi_score,
      effort_estimate: recommendations.effort_estimate,
      confidence: recommendations.confidence,
      created_at: recommendations.created_at,
    })
    .from(recommendations)
    .innerJoin(brands, eq(recommendations.brand_id, brands.id))
    .where(isNotNull(recommendations.priority_rank))
    .orderBy(recommendations.priority_rank)
    .limit(20);

  return NextResponse.json(ranked);
}
