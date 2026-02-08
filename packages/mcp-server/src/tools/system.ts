import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, events, promptVersions, improvementSuggestions } from '@quadbot/db';
import { eq, desc, and } from 'drizzle-orm';

export function registerSystemTools(server: McpServer) {
  server.tool(
    'list_events',
    'List recent events with optional filters',
    {
      brandId: z.string().uuid().optional().describe('Filter by brand'),
      type: z.string().optional().describe('Filter by event type'),
      status: z.string().optional().describe('Filter by status'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, type, status, limit }) => {
      const conditions = [];
      if (brandId) conditions.push(eq(events.brand_id, brandId));
      if (type) conditions.push(eq(events.type, type));
      if (status) conditions.push(eq(events.status, status));

      const results = await db
        .select()
        .from(events)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(events.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'get_prompt_versions',
    'Get active prompt templates',
    {
      name: z.string().optional().describe('Filter by prompt name'),
    },
    async ({ name }) => {
      const conditions = [eq(promptVersions.is_active, true)];
      if (name) conditions.push(eq(promptVersions.name, name));

      const results = await db
        .select()
        .from(promptVersions)
        .where(and(...conditions))
        .orderBy(desc(promptVersions.created_at));

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    'list_improvements',
    'List self-improvement suggestions',
    {
      brandId: z.string().uuid().optional().describe('Filter by brand'),
      status: z.string().optional().describe('Filter by status (default: pending)'),
      category: z.string().optional().describe('Filter by category'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, status, category, limit }) => {
      const conditions = [];
      if (brandId) conditions.push(eq(improvementSuggestions.brand_id, brandId));
      if (category) conditions.push(eq(improvementSuggestions.category, category));
      conditions.push(eq(improvementSuggestions.status, status || 'pending'));

      const results = await db
        .select()
        .from(improvementSuggestions)
        .where(and(...conditions))
        .orderBy(desc(improvementSuggestions.created_at))
        .limit(limit || 20);

      return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
    },
  );
}
