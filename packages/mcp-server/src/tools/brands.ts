import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, brands, brandIntegrations } from '@quadbot/db';
import { eq } from 'drizzle-orm';

export function registerBrandTools(server: McpServer) {
  server.tool(
    'list_brands',
    'List all brands with their status and mode',
    {},
    async () => {
      const allBrands = await db.select().from(brands);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(allBrands, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_brand',
    'Get brand details including integrations (credentials redacted)',
    { brandId: z.string().uuid().describe('Brand UUID') },
    async ({ brandId }) => {
      const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
      if (!brand) {
        return { content: [{ type: 'text', text: 'Brand not found' }], isError: true };
      }

      const integrations = await db
        .select({
          id: brandIntegrations.id,
          type: brandIntegrations.type,
          config: brandIntegrations.config,
          shared_credential_id: brandIntegrations.shared_credential_id,
          created_at: brandIntegrations.created_at,
          updated_at: brandIntegrations.updated_at,
        })
        .from(brandIntegrations)
        .where(eq(brandIntegrations.brand_id, brandId));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ...brand, integrations }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'update_brand',
    'Update brand settings: mode, modules, guardrails, active status',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
      mode: z.enum(['observe', 'assist']).optional().describe('Operating mode'),
      is_active: z.boolean().optional().describe('Active status'),
      modules_enabled: z.array(z.string()).optional().describe('Enabled module list'),
      guardrails: z.record(z.unknown()).optional().describe('Guardrail configuration'),
    },
    async ({ brandId, mode, is_active, modules_enabled, guardrails }) => {
      const updates: Record<string, unknown> = { updated_at: new Date() };
      if (mode !== undefined) updates.mode = mode;
      if (is_active !== undefined) updates.is_active = is_active;
      if (modules_enabled !== undefined) updates.modules_enabled = modules_enabled;
      if (guardrails !== undefined) updates.guardrails = guardrails;

      const [updated] = await db
        .update(brands)
        .set(updates)
        .where(eq(brands.id, brandId))
        .returning();

      if (!updated) {
        return { content: [{ type: 'text', text: 'Brand not found' }], isError: true };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(updated, null, 2),
        }],
      };
    },
  );
}
