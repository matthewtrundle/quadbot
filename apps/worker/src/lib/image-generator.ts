import { config } from '../config.js';
import { logger } from '../logger.js';

export interface GeneratedImage {
  /** Base64-encoded image data */
  base64: string;
  /** MIME type */
  mimeType: string;
  /** File extension */
  extension: string;
}

/**
 * Generate a hero image for a blog post using OpenRouter's chat completions API
 * with an image-capable model (openai/gpt-5-image-mini).
 *
 * Falls back gracefully — returns null if no API key or generation fails.
 */
export async function generateHeroImage(prompt: string): Promise<GeneratedImage | null> {
  if (!config.OPENROUTER_API_KEY) {
    logger.debug('No OPENROUTER_API_KEY configured, skipping image generation');
    return null;
  }

  const enhancedPrompt = `Generate a professional blog hero image. ${prompt}. High quality, editorial photography style, 16:9 aspect ratio, no text overlays, no watermarks.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://quadbot.ai',
        'X-Title': 'QuadBot Content Pipeline',
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
      logger.error(
        { status: response.status, error: errorText.slice(0, 500) },
        'OpenRouter image generation API error',
      );
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
      logger.warn('OpenRouter returned no message in response');
      return null;
    }

    // GPT image models return images in message.images array
    const images = message.images;
    if (Array.isArray(images) && images.length > 0) {
      for (const img of images) {
        if (img.type === 'image_url' && img.image_url?.url) {
          const dataUri = img.image_url.url;
          const match = dataUri.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
          if (match) {
            const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            logger.info(
              { promptLength: prompt.length, imageSize: match[2].length },
              'Hero image generated successfully',
            );
            return { base64: match[2], extension: ext, mimeType: `image/${match[1]}` };
          }
        }
      }
    }

    // Fallback: check message.content array (some models use this)
    const content = message.content;
    if (Array.isArray(content)) {
      for (const part of content as Array<{ type: string; image_url?: { url: string } }>) {
        if (part.type === 'image_url' && part.image_url?.url) {
          const dataUri = part.image_url.url;
          const match = dataUri.match(/^data:image\/(png|jpeg|webp);base64,(.+)$/);
          if (match) {
            const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
            logger.info(
              { promptLength: prompt.length, imageSize: match[2].length },
              'Hero image generated successfully (from content)',
            );
            return { base64: match[2], extension: ext, mimeType: `image/${match[1]}` };
          }
        }
      }
    }

    logger.warn('Could not extract image from OpenRouter response');
    return null;
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: msg }, 'Failed to generate hero image');
    return null;
  }
}
