import { z } from 'zod';

// ============================================================================
// Outreach Accounts
// ============================================================================

export const createOutreachAccountSchema = z.object({
  email: z.string().email(),
  from_name: z.string().min(1).max(255),
  resend_api_key: z.string().min(1),
  daily_limit: z.number().int().min(1).max(500).optional().default(50),
});

export const updateOutreachAccountSchema = z.object({
  from_name: z.string().min(1).max(255).optional(),
  daily_limit: z.number().int().min(1).max(500).optional(),
  status: z.enum(['active', 'paused', 'disabled']).optional(),
});

// ============================================================================
// Lead Lists
// ============================================================================

export const createLeadListSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
});

// ============================================================================
// Leads
// ============================================================================

export const createLeadSchema = z.object({
  email: z.string().email(),
  first_name: z.string().max(255).optional(),
  last_name: z.string().max(255).optional(),
  company: z.string().max(255).optional(),
  title: z.string().max(255).optional(),
  linkedin_url: z.string().url().max(500).optional(),
  phone: z.string().max(50).optional(),
  industry: z.string().max(255).optional(),
  employee_count: z.string().max(50).optional(),
  location: z.string().max(255).optional(),
  custom_fields: z.record(z.unknown()).optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const csvColumnMappingSchema = z.record(
  z.string(), // CSV column name
  z.string(), // Target field name
);

export const csvUploadPreviewSchema = z.object({
  lead_list_id: z.string().uuid().optional(),
  column_mapping: csvColumnMappingSchema,
});

// ============================================================================
// Campaigns
// ============================================================================

export const createCampaignSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  reply_mode: z.enum(['manual', 'ai_draft_approve', 'ai_auto_reply']).optional().default('manual'),
  ai_reply_context: z.string().max(5000).optional(),
  ai_reply_tone: z.string().max(100).optional(),
  timezone: z.string().max(100).optional().default('America/Chicago'),
  send_days: z.array(z.number().int().min(0).max(6)).optional().default([1, 2, 3, 4, 5]),
  send_window_start: z.string().regex(/^\d{2}:\d{2}$/).optional().default('09:00'),
  send_window_end: z.string().regex(/^\d{2}:\d{2}$/).optional().default('17:00'),
  daily_send_limit: z.number().int().min(1).max(1000).optional().default(50),
  min_spacing_seconds: z.number().int().min(10).max(3600).optional().default(60),
  max_spacing_seconds: z.number().int().min(10).max(7200).optional().default(300),
});

export const updateCampaignSchema = createCampaignSchema.partial();

// ============================================================================
// Campaign Sequence Steps
// ============================================================================

export const createSequenceStepSchema = z.object({
  step_order: z.number().int().min(1),
  delay_days: z.number().int().min(0).max(90).default(1),
  subject_template: z.string().min(1).max(500),
  body_template: z.string().min(1).max(50000),
  is_reply_to_previous: z.boolean().optional().default(false),
});

export const updateSequenceStepSchema = createSequenceStepSchema.partial();

export const bulkSequenceStepsSchema = z.array(createSequenceStepSchema);

// ============================================================================
// Campaign Leads (adding leads to campaign)
// ============================================================================

export const addLeadsToCampaignSchema = z.object({
  lead_ids: z.array(z.string().uuid()).min(1).max(10000),
});

// ============================================================================
// Conversations
// ============================================================================

export const sendReplySchema = z.object({
  body_text: z.string().min(1).max(50000),
  body_html: z.string().max(100000).optional(),
});

// ============================================================================
// AI Reply Output Schema (for callClaude)
// ============================================================================

export const outreachAiReplyOutputSchema = z.object({
  subject: z.string().max(500),
  body_text: z.string().max(50000),
  body_html: z.string().max(100000).optional(),
  tone: z.string().max(100).optional(),
  reasoning: z.string().max(2000).optional(),
});

export type OutreachAiReplyOutput = z.infer<typeof outreachAiReplyOutputSchema>;

// ============================================================================
// Resend Webhook Schemas
// ============================================================================

export const resendWebhookEventSchema = z.object({
  type: z.string(),
  data: z.object({
    email_id: z.string().optional(),
    from: z.string().optional(),
    to: z.union([z.string(), z.array(z.string())]).optional(),
    subject: z.string().optional(),
    created_at: z.string().optional(),
  }).passthrough(),
});

export const resendInboundEmailSchema = z.object({
  from: z.string(),
  to: z.string(),
  subject: z.string().optional(),
  text: z.string().optional(),
  html: z.string().optional(),
  headers: z.array(z.object({
    name: z.string(),
    value: z.string(),
  })).optional(),
}).passthrough();

// ============================================================================
// Analytics Output Schema
// ============================================================================

export const outreachAnalyticsQuerySchema = z.object({
  campaign_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

// ============================================================================
// Type exports
// ============================================================================

export type CreateOutreachAccount = z.infer<typeof createOutreachAccountSchema>;
export type UpdateOutreachAccount = z.infer<typeof updateOutreachAccountSchema>;
export type CreateLeadList = z.infer<typeof createLeadListSchema>;
export type CreateLead = z.infer<typeof createLeadSchema>;
export type UpdateLead = z.infer<typeof updateLeadSchema>;
export type CsvColumnMapping = z.infer<typeof csvColumnMappingSchema>;
export type CreateCampaign = z.infer<typeof createCampaignSchema>;
export type UpdateCampaign = z.infer<typeof updateCampaignSchema>;
export type CreateSequenceStep = z.infer<typeof createSequenceStepSchema>;
export type AddLeadsToCampaign = z.infer<typeof addLeadsToCampaignSchema>;
export type SendReply = z.infer<typeof sendReplySchema>;
