import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSession, isAdmin, type UserWithBrand } from '@/lib/auth-session';
import { db } from '@/lib/db';
import {
  brands,
  chatConversations,
  chatMessages,
  recommendations,
  actionDrafts,
  artifacts,
  signals,
  metricSnapshots,
} from '@quadbot/db';
import { eq, and, desc, gte } from 'drizzle-orm';
import { checkRateLimit } from '@/lib/rate-limit';

// ---------------------------------------------------------------------------
// Claude client (lazy singleton)
// ---------------------------------------------------------------------------
let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

// ---------------------------------------------------------------------------
// Tool definitions for Claude
// ---------------------------------------------------------------------------
const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_recommendations',
    description:
      'List recent recommendations for the brand. Returns title, priority, status, source, and created date.',
    input_schema: {
      type: 'object' as const,
      properties: {
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high', 'critical'],
          description: 'Optional priority filter',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_brand_health',
    description:
      'Get a health overview for the brand including pending actions count, recent recommendations, and evaluation scores.',
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_metric_snapshots',
    description:
      'Get time-series metric data for the brand (e.g. GSC impressions, clicks). Can filter by source and metric key.',
    input_schema: {
      type: 'object' as const,
      properties: {
        source: {
          type: 'string',
          description: 'Filter by source (e.g. gsc, ga4, ads)',
        },
        metric_key: {
          type: 'string',
          description: 'Filter by metric key',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 30)',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_action_drafts',
    description:
      'List pending action drafts waiting for approval. Shows what the system wants to do on behalf of the brand.',
    input_schema: {
      type: 'object' as const,
      properties: {
        status: {
          type: 'string',
          enum: ['pending', 'approved', 'rejected', 'executed_stub', 'executed'],
          description: 'Filter by status (default: pending)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_signals',
    description: 'List active cross-brand signals — trends, opportunities, and insights detected across the ecosystem.',
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: {
          type: 'string',
          description: 'Filter by signal domain',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: [],
    },
  },
  {
    name: 'list_artifacts',
    description: 'List content artifacts (briefs, drafts, published posts) for the brand.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'Filter by artifact type (e.g. trend_content_brief, blog_post)',
        },
        status: {
          type: 'string',
          description: 'Filter by status (e.g. draft, published)',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 10)',
        },
      },
      required: [],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool executor — runs DB queries matching the MCP tool logic
// ---------------------------------------------------------------------------
async function executeTool(toolName: string, input: Record<string, unknown>, brandId: string): Promise<string> {
  switch (toolName) {
    case 'list_recommendations': {
      const conditions = [eq(recommendations.brand_id, brandId)];
      if (input.priority) {
        conditions.push(eq(recommendations.priority, input.priority as 'low' | 'medium' | 'high' | 'critical'));
      }
      const results = await db
        .select({
          id: recommendations.id,
          title: recommendations.title,
          priority: recommendations.priority,
          status: recommendations.status,
          source: recommendations.source,
          created_at: recommendations.created_at,
        })
        .from(recommendations)
        .where(and(...conditions))
        .orderBy(desc(recommendations.created_at))
        .limit((input.limit as number) || 10);
      return JSON.stringify(results, null, 2);
    }

    case 'get_brand_health': {
      const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);

      const pendingActions = await db
        .select()
        .from(actionDrafts)
        .where(and(eq(actionDrafts.brand_id, brandId), eq(actionDrafts.status, 'pending')));

      const recentRecs = await db
        .select({
          id: recommendations.id,
          title: recommendations.title,
          priority: recommendations.priority,
          status: recommendations.status,
          created_at: recommendations.created_at,
        })
        .from(recommendations)
        .where(eq(recommendations.brand_id, brandId))
        .orderBy(desc(recommendations.created_at))
        .limit(5);

      return JSON.stringify(
        {
          brand: { name: brand?.name, mode: brand?.mode, is_active: brand?.is_active },
          pending_actions_count: pendingActions.length,
          recent_recommendations: recentRecs,
        },
        null,
        2,
      );
    }

    case 'get_metric_snapshots': {
      const conditions = [eq(metricSnapshots.brand_id, brandId)];
      if (input.source) conditions.push(eq(metricSnapshots.source, input.source as string));
      if (input.metric_key) conditions.push(eq(metricSnapshots.metric_key, input.metric_key as string));

      const results = await db
        .select()
        .from(metricSnapshots)
        .where(and(...conditions))
        .orderBy(desc(metricSnapshots.captured_at))
        .limit((input.limit as number) || 30);
      return JSON.stringify(results, null, 2);
    }

    case 'list_action_drafts': {
      const conditions = [
        eq(actionDrafts.brand_id, brandId),
        eq(
          actionDrafts.status,
          ((input.status as string) || 'pending') as 'pending' | 'approved' | 'rejected' | 'executed_stub' | 'executed',
        ),
      ];
      const results = await db
        .select()
        .from(actionDrafts)
        .where(and(...conditions))
        .orderBy(desc(actionDrafts.created_at))
        .limit((input.limit as number) || 10);
      return JSON.stringify(results, null, 2);
    }

    case 'list_signals': {
      const conditions = [gte(signals.expires_at, new Date())];
      if (input.domain) conditions.push(eq(signals.domain, input.domain as string));
      const results = await db
        .select()
        .from(signals)
        .where(and(...conditions))
        .orderBy(desc(signals.created_at))
        .limit((input.limit as number) || 10);
      return JSON.stringify(results, null, 2);
    }

    case 'list_artifacts': {
      const conditions = [eq(artifacts.brand_id, brandId)];
      if (input.type) conditions.push(eq(artifacts.type, input.type as string));
      if (input.status) conditions.push(eq(artifacts.status, input.status as string));
      const results = await db
        .select({
          id: artifacts.id,
          title: artifacts.title,
          type: artifacts.type,
          status: artifacts.status,
          created_at: artifacts.created_at,
        })
        .from(artifacts)
        .where(and(...conditions))
        .orderBy(desc(artifacts.created_at))
        .limit((input.limit as number) || 10);
      return JSON.stringify(results, null, 2);
    }

    default:
      return JSON.stringify({ error: `Unknown tool: ${toolName}` });
  }
}

// ---------------------------------------------------------------------------
// Build the system prompt
// ---------------------------------------------------------------------------
async function buildSystemPrompt(brandId: string): Promise<string> {
  const [brand] = await db
    .select({ name: brands.name, mode: brands.mode })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  const recentRecs = await db
    .select({ title: recommendations.title, priority: recommendations.priority, status: recommendations.status })
    .from(recommendations)
    .where(eq(recommendations.brand_id, brandId))
    .orderBy(desc(recommendations.created_at))
    .limit(5);

  const recsSummary =
    recentRecs.length > 0
      ? recentRecs.map((r) => `- [${r.priority}] ${r.title} (${r.status})`).join('\n')
      : 'No recent recommendations.';

  return `You are QuadBot, an AI marketing assistant for the brand "${brand?.name || 'Unknown'}".
The brand is currently in "${brand?.mode || 'observe'}" mode.

You help the user understand their brand's performance, review recommendations, check metrics, and manage pending actions. You have access to tools that let you query real-time data from the QuadBot system.

## Recent Recommendations
${recsSummary}

## Guidelines
- Be concise and actionable. Use bullet points when listing data.
- When the user asks about metrics, recommendations, or actions, use the appropriate tool to fetch current data rather than guessing.
- If you're unsure about something, say so. Don't fabricate data.
- Format numbers clearly (e.g. "1,234 clicks" not "1234").
- When showing recommendations or actions, include their IDs so the user can refer to them.`;
}

// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
function sseEvent(type: string, data: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ type, ...data })}\n\n`;
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: brandId } = await params;

  // --- Auth ---
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = session.user as UserWithBrand;
  if (user.brandId !== brandId && !isAdmin(session as { user: UserWithBrand })) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // --- Rate limit: 50 messages per hour per user ---
  const rl = await checkRateLimit(`chat:${user.id}`, {
    maxRequests: 50,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again later.' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
      },
    });
  }

  // --- Parse body ---
  let body: { message: string; conversation_id?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!body.message || typeof body.message !== 'string' || body.message.trim().length === 0) {
    return new Response(JSON.stringify({ error: 'message is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const userMessage = body.message.trim();

  // --- Conversation: load existing or create new ---
  let conversationId = body.conversation_id;

  if (conversationId) {
    const [existing] = await db
      .select()
      .from(chatConversations)
      .where(and(eq(chatConversations.id, conversationId), eq(chatConversations.brand_id, brandId)))
      .limit(1);

    if (!existing) {
      return new Response(JSON.stringify({ error: 'Conversation not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // Create new conversation
    const [created] = await db
      .insert(chatConversations)
      .values({
        brand_id: brandId,
        user_id: user.id,
        title: userMessage.slice(0, 100),
      })
      .returning();
    conversationId = created.id;
  }

  // --- Save user message ---
  await db.insert(chatMessages).values({
    conversation_id: conversationId,
    role: 'user',
    content: userMessage,
  });

  // --- Load conversation history (last 20 messages) ---
  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversation_id, conversationId))
    .orderBy(desc(chatMessages.created_at))
    .limit(20);

  // Reverse to chronological order and convert to Claude message format
  const claudeMessages: Anthropic.MessageParam[] = history
    .reverse()
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

  // --- Build system prompt ---
  const systemPrompt = await buildSystemPrompt(brandId);

  // --- Stream response ---
  const startTime = Date.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(sseEvent(type, data)));
      };

      try {
        const anthropic = getAnthropic();
        let messages = [...claudeMessages];
        let fullContent = '';
        const allToolCalls: Record<string, unknown>[] = [];
        const allToolResults: Record<string, unknown>[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        // Tool-use loop (max 5 rounds to prevent infinite loops)
        const MAX_ROUNDS = 5;
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const response = anthropic.messages.stream({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            system: systemPrompt,
            tools: CHAT_TOOLS,
            messages,
          });

          // Collect content blocks from the stream
          const contentBlocks: Anthropic.ContentBlock[] = [];
          let currentTextContent = '';

          response.on('text', (text) => {
            currentTextContent += text;
            send('text', { content: text });
          });

          const finalMessage = await response.finalMessage();
          totalInputTokens += finalMessage.usage.input_tokens;
          totalOutputTokens += finalMessage.usage.output_tokens;

          // Process content blocks
          for (const block of finalMessage.content) {
            contentBlocks.push(block);
          }

          fullContent += currentTextContent;

          // Check for tool use
          const toolUseBlocks = finalMessage.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

          if (toolUseBlocks.length === 0 || finalMessage.stop_reason === 'end_turn') {
            // No more tool calls — we're done
            break;
          }

          // Execute tools and continue
          messages = [...messages, { role: 'assistant', content: finalMessage.content }];

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolUse of toolUseBlocks) {
            send('tool_use', { tool: toolUse.name, input: toolUse.input });

            allToolCalls.push({
              id: toolUse.id,
              name: toolUse.name,
              input: toolUse.input,
            });

            const resultText = await executeTool(toolUse.name, toolUse.input as Record<string, unknown>, brandId);

            // Create a short summary for the client
            let parsed: unknown;
            try {
              parsed = JSON.parse(resultText);
            } catch {
              parsed = resultText;
            }
            const summary = Array.isArray(parsed)
              ? `Returned ${parsed.length} result(s)`
              : typeof parsed === 'object' && parsed !== null
                ? `Retrieved data successfully`
                : resultText.slice(0, 200);

            send('tool_result', { tool: toolUse.name, summary });

            allToolResults.push({
              tool_use_id: toolUse.id,
              name: toolUse.name,
              result: resultText.slice(0, 2000), // cap stored result
            });

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: resultText,
            });
          }

          messages.push({ role: 'user', content: toolResults });
        }

        // --- Save assistant message ---
        const durationMs = Date.now() - startTime;
        const [savedMessage] = await db
          .insert(chatMessages)
          .values({
            conversation_id: conversationId!,
            role: 'assistant',
            content: fullContent,
            tool_calls: allToolCalls.length > 0 ? allToolCalls : null,
            tool_results: allToolResults.length > 0 ? allToolResults : null,
            tokens_used: totalInputTokens + totalOutputTokens,
            duration_ms: durationMs,
          })
          .returning();

        // Update conversation timestamp
        await db
          .update(chatConversations)
          .set({ updated_at: new Date() })
          .where(eq(chatConversations.id, conversationId!));

        send('done', {
          conversation_id: conversationId!,
          message_id: savedMessage.id,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        send('error', { message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
