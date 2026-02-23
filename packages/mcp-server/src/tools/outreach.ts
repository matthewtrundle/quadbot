import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { db, campaigns, outreachConversations, leads, outreachAccounts, campaignLeads, outreachEmails } from '@quadbot/db';
import { eq, desc, and, sql } from 'drizzle-orm';

export function registerOutreachTools(server: McpServer) {
  server.tool(
    'list_campaigns',
    'List outreach campaigns for a brand',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
    },
    async ({ brandId }) => {
      const rows = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.brand_id, brandId))
        .orderBy(desc(campaigns.created_at));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(rows, null, 2),
        }],
      };
    },
  );

  server.tool(
    'get_campaign',
    'Get campaign details with sequence steps, lead stats, and email stats',
    {
      campaignId: z.string().uuid().describe('Campaign UUID'),
    },
    async ({ campaignId }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return { content: [{ type: 'text', text: 'Campaign not found' }], isError: true };
      }

      const leadStats = await db
        .select({
          total: sql<number>`count(*)`,
          pending: sql<number>`count(*) filter (where ${campaignLeads.status} = 'pending')`,
          scheduled: sql<number>`count(*) filter (where ${campaignLeads.status} = 'scheduled')`,
          replied: sql<number>`count(*) filter (where ${campaignLeads.status} = 'replied')`,
          completed: sql<number>`count(*) filter (where ${campaignLeads.status} = 'completed')`,
          bounced: sql<number>`count(*) filter (where ${campaignLeads.status} = 'bounced')`,
        })
        .from(campaignLeads)
        .where(eq(campaignLeads.campaign_id, campaignId));

      const emailStats = await db
        .select({
          total: sql<number>`count(*)`,
          delivered: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('delivered', 'opened', 'clicked'))`,
          opened: sql<number>`count(*) filter (where ${outreachEmails.status} IN ('opened', 'clicked'))`,
          bounced: sql<number>`count(*) filter (where ${outreachEmails.status} = 'bounced')`,
        })
        .from(outreachEmails)
        .where(eq(outreachEmails.campaign_id, campaignId));

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...campaign,
            lead_stats: leadStats[0],
            email_stats: emailStats[0],
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    'start_campaign',
    'Start a draft or paused outreach campaign',
    {
      campaignId: z.string().uuid().describe('Campaign UUID'),
    },
    async ({ campaignId }) => {
      const [campaign] = await db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, campaignId))
        .limit(1);

      if (!campaign) {
        return { content: [{ type: 'text', text: 'Campaign not found' }], isError: true };
      }

      if (campaign.status !== 'draft' && campaign.status !== 'paused') {
        return {
          content: [{ type: 'text', text: `Campaign is ${campaign.status}, can only start draft or paused campaigns` }],
          isError: true,
        };
      }

      const now = new Date();
      await db
        .update(campaignLeads)
        .set({ status: 'scheduled', next_send_at: now, updated_at: now })
        .where(and(eq(campaignLeads.campaign_id, campaignId), eq(campaignLeads.status, 'pending')));

      const [updated] = await db
        .update(campaigns)
        .set({ status: 'active', started_at: campaign.started_at || now, paused_at: null, updated_at: now })
        .where(eq(campaigns.id, campaignId))
        .returning();

      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  server.tool(
    'pause_campaign',
    'Pause an active outreach campaign',
    {
      campaignId: z.string().uuid().describe('Campaign UUID'),
    },
    async ({ campaignId }) => {
      const now = new Date();
      const [updated] = await db
        .update(campaigns)
        .set({ status: 'paused', paused_at: now, updated_at: now })
        .where(eq(campaigns.id, campaignId))
        .returning();

      if (!updated) {
        return { content: [{ type: 'text', text: 'Campaign not found' }], isError: true };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(updated, null, 2) }],
      };
    },
  );

  server.tool(
    'list_outreach_conversations',
    'List outreach conversations for a brand',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, limit }) => {
      const rows = await db
        .select({
          conversation: outreachConversations,
          lead: leads,
        })
        .from(outreachConversations)
        .innerJoin(leads, eq(outreachConversations.lead_id, leads.id))
        .where(eq(outreachConversations.brand_id, brandId))
        .orderBy(desc(outreachConversations.last_message_at))
        .limit(limit || 20);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(rows.map(r => ({
            ...r.conversation,
            lead_email: r.lead.email,
            lead_name: `${r.lead.first_name || ''} ${r.lead.last_name || ''}`.trim(),
            lead_company: r.lead.company,
          })), null, 2),
        }],
      };
    },
  );

  server.tool(
    'list_outreach_leads',
    'List leads for a brand with optional filtering',
    {
      brandId: z.string().uuid().describe('Brand UUID'),
      limit: z.number().min(1).max(100).optional().describe('Max results (default 20)'),
    },
    async ({ brandId, limit }) => {
      const rows = await db
        .select()
        .from(leads)
        .where(eq(leads.brand_id, brandId))
        .orderBy(desc(leads.created_at))
        .limit(limit || 20);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(rows, null, 2),
        }],
      };
    },
  );
}
