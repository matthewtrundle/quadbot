import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { z } from 'zod';
import { getGscCredentials, requestIndexing, inspectUrl, pingSitemap } from '@/lib/gsc-actions';

const actionSchema = z.object({
  action: z.enum(['inspect', 'index', 'sitemap']),
  url: z.string().min(1),
  brand_id: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const parsed = actionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { action, url, brand_id } = parsed.data;

  if (action === 'sitemap') {
    const result = await pingSitemap(url);
    return NextResponse.json(result);
  }

  // inspect and index require GSC credentials
  const creds = await getGscCredentials(brand_id);
  if (!creds) {
    return NextResponse.json(
      { error: 'GSC credentials not found or expired for this brand' },
      { status: 404 },
    );
  }

  try {
    if (action === 'inspect') {
      const result = await inspectUrl(creds.accessToken, url, creds.siteUrl);
      return NextResponse.json(result);
    }

    if (action === 'index') {
      const result = await requestIndexing(creds.accessToken, url);
      return NextResponse.json(result);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'GSC action failed';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
