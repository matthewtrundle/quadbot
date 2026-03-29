#!/usr/bin/env tsx
/**
 * Backfill hero images for existing generated_content artifacts that don't have them.
 *
 * 1. Finds all generated_content artifacts missing hero_image_base64
 * 2. Uses Claude to generate an image prompt from the article title + excerpt
 * 3. Calls OpenRouter to generate the image
 * 4. Stores the base64 image data on the artifact
 *
 * Usage: pnpm tsx scripts/backfill-hero-images.ts [--dry-run] [--limit N]
 */
import 'dotenv/config';
import { db } from '@quadbot/db';
import { artifacts } from '@quadbot/db';
import { eq, and, sql } from 'drizzle-orm';

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg !== -1 ? parseInt(process.argv[limitArg + 1], 10) : 50;

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in .env');
  process.exit(1);
}
if (!ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env');
  process.exit(1);
}

async function generateImagePrompt(title: string, excerpt: string, industry: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: `Write a short (50-150 word) image generation prompt for a blog hero image.

Article title: "${title}"
Excerpt: "${excerpt}"
Industry: ${industry}

Requirements:
- Describe a visual scene, mood, colors, and composition
- NO text, logos, brand names, or human faces
- Focus on: abstract concepts, food photography, textures, landscapes, or symbolic imagery
- Style: editorial photography, professional, 16:9 aspect ratio
- Be specific about lighting, colors, and composition

Return ONLY the image prompt, nothing else.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await response.json()) as { content: Array<{ type: string; text: string }> };
  const text = data.content[0];
  if (text.type !== 'text') throw new Error('Unexpected response type');
  return text.text.trim();
}

async function generateHeroImage(
  prompt: string,
): Promise<{ base64: string; extension: string; mimeType: string } | null> {
  const enhancedPrompt = `Generate a professional blog hero image. ${prompt}. High quality, editorial photography style, 16:9 aspect ratio, no text overlays, no watermarks.`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://quadbot.ai',
      'X-Title': 'QuadBot Image Backfill',
    },
    body: JSON.stringify({
      model: 'openai/gpt-5-image-mini',
      messages: [
        {
          role: 'user',
          content: enhancedPrompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`  OpenRouter error ${response.status}: ${errorText.slice(0, 200)}`);
    return null;
  }

  const data = (await response.json()) as {
    choices: Array<{
      message: {
        content: unknown;
        images?: Array<{ type: string; image_url?: { url: string } }>;
      };
    }>;
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    console.error('  No message in response');
    return null;
  }

  // GPT image models return images in message.images array
  const sources = [
    ...(Array.isArray(message.images) ? message.images : []),
    ...(Array.isArray(message.content)
      ? (message.content as Array<{ type: string; image_url?: { url: string } }>)
      : []),
  ];

  for (const part of sources) {
    if (part.type === 'image_url' && part.image_url?.url) {
      const dataUri = part.image_url.url;
      const match = dataUri.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
      if (match) {
        return { base64: match[2], extension: match[1] === 'jpeg' ? 'jpg' : match[1], mimeType: `image/${match[1]}` };
      }
    }
  }

  console.error('  Could not extract image from response');
  return null;
}

async function main() {
  console.log(`Backfill hero images (dry_run=${DRY_RUN}, limit=${LIMIT})\n`);

  // Find generated_content artifacts without hero images
  const rows = await db
    .select({
      id: artifacts.id,
      brand_id: artifacts.brand_id,
      title: artifacts.title,
      content: artifacts.content,
    })
    .from(artifacts)
    .where(and(eq(artifacts.type, 'generated_content'), sql`(${artifacts.content}->>'hero_image_base64') IS NULL`))
    .limit(LIMIT);

  console.log(`Found ${rows.length} artifacts without hero images\n`);

  let succeeded = 0;
  let failed = 0;

  for (const row of rows) {
    const content = row.content as Record<string, unknown>;
    const title = (content.title as string) || row.title || 'Untitled';
    const excerpt = (content.excerpt as string) || '';
    const slug = (content.slug as string) || 'unknown';

    console.log(`[${succeeded + failed + 1}/${rows.length}] ${title.slice(0, 70)}`);

    try {
      // Step 1: Generate image prompt via Claude
      console.log('  Generating image prompt...');
      const imagePrompt = await generateImagePrompt(title, excerpt, 'general');
      console.log(`  Prompt: "${imagePrompt.slice(0, 100)}..."`);

      if (DRY_RUN) {
        console.log('  [DRY RUN] Skipping image generation\n');
        succeeded++;
        continue;
      }

      // Step 2: Generate the image
      console.log('  Generating hero image via OpenRouter...');
      const image = await generateHeroImage(imagePrompt);
      if (!image) {
        console.log('  FAILED: No image generated\n');
        failed++;
        continue;
      }

      // Step 3: Update the artifact
      console.log(`  Storing image (${(image.base64.length / 1024).toFixed(0)} KB base64)...`);
      await db
        .update(artifacts)
        .set({
          content: {
            ...content,
            image_prompt: imagePrompt,
            hero_image_base64: image.base64,
            hero_image_extension: image.extension,
            hero_image_mime_type: image.mimeType,
          },
          updated_at: new Date(),
        })
        .where(eq(artifacts.id, row.id));

      console.log('  OK\n');
      succeeded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR: ${msg}\n`);
      failed++;
    }
  }

  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed out of ${rows.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
