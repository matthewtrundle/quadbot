import { NextRequest, NextResponse } from 'next/server';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { contentPublishConfigs, encrypt } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { withRateLimit } from '@/lib/rate-limit';

const createConfigSchema = z.object({
  name: z.string().min(1).max(255).default('GitHub CMS'),
  owner: z.string().min(1, 'Owner is required'),
  repo: z.string().min(1, 'Repo is required'),
  branch: z.string().default('main'),
  blog_directory: z.string().min(1, 'Blog directory is required'),
  content_format: z.enum(['nextjs_page', 'mdx', 'markdown']).default('nextjs_page'),
  site_url: z.string().url('Must be a valid URL'),
  auto_merge: z.boolean().default(false),
  github_token: z.string().optional(),
});

async function verifyBrandAccess(brandId: string): Promise<NextResponse | null> {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const userBrandId = (session.user as UserWithBrand).brandId ?? null;
  const admin = isAdmin(session);
  if (!admin && userBrandId && userBrandId !== brandId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const denied = await verifyBrandAccess(brandId);
  if (denied) return denied;

  const configs = await db
    .select({
      id: contentPublishConfigs.id,
      brand_id: contentPublishConfigs.brand_id,
      type: contentPublishConfigs.type,
      name: contentPublishConfigs.name,
      config: contentPublishConfigs.config,
      is_active: contentPublishConfigs.is_active,
      last_published_at: contentPublishConfigs.last_published_at,
      created_at: contentPublishConfigs.created_at,
      updated_at: contentPublishConfigs.updated_at,
    })
    .from(contentPublishConfigs)
    .where(eq(contentPublishConfigs.brand_id, brandId));

  return NextResponse.json(configs);
}

const _POST = async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;
  const denied = await verifyBrandAccess(brandId);
  if (denied) return denied;

  const body = await req.json();
  const parsed = createConfigSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, owner, repo, branch, blog_directory, content_format, site_url, auto_merge, github_token } = parsed.data;

  const [created] = await db
    .insert(contentPublishConfigs)
    .values({
      brand_id: brandId,
      type: 'github',
      name,
      config: {
        owner,
        repo,
        branch,
        blog_directory,
        content_format,
        site_url,
        auto_merge,
      },
      github_token_encrypted: github_token ? encrypt(github_token) : null,
    })
    .returning();

  return NextResponse.json(
    {
      id: created.id,
      brand_id: created.brand_id,
      type: created.type,
      name: created.name,
      config: created.config,
      is_active: created.is_active,
      last_published_at: created.last_published_at,
      created_at: created.created_at,
      updated_at: created.updated_at,
    },
    { status: 201 },
  );
};

export const POST = withRateLimit(_POST);
