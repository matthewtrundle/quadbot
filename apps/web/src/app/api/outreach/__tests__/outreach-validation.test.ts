import { describe, it, expect } from 'vitest';
import {
  createLeadSchema,
  createCampaignSchema,
  createOutreachAccountSchema,
  updateOutreachAccountSchema,
  createSequenceStepSchema,
  addLeadsToCampaignSchema,
  sendReplySchema,
} from '@quadbot/shared';

/**
 * Tests for outreach-related Zod schemas: leads, campaigns,
 * outreach accounts, sequence steps, and reply validation.
 */

describe('Outreach Validation Schemas', () => {
  describe('createLeadSchema', () => {
    it('accepts valid lead data with all fields', () => {
      const result = createLeadSchema.safeParse({
        email: 'john@example.com',
        first_name: 'John',
        last_name: 'Doe',
        company: 'Acme Corp',
        title: 'CTO',
        linkedin_url: 'https://linkedin.com/in/johndoe',
        phone: '+1-555-0100',
        industry: 'Technology',
        employee_count: '50-100',
        location: 'Austin, TX',
        custom_fields: { source: 'conference' },
      });
      expect(result.success).toBe(true);
    });

    it('accepts minimal lead data with only email', () => {
      const result = createLeadSchema.safeParse({
        email: 'minimal@example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid email format', () => {
      const result = createLeadSchema.safeParse({
        email: 'not-an-email',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const flat = result.error.flatten();
        expect(flat.fieldErrors.email).toBeDefined();
      }
    });

    it('rejects missing email', () => {
      const result = createLeadSchema.safeParse({
        first_name: 'John',
        last_name: 'Doe',
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid linkedin_url format', () => {
      const result = createLeadSchema.safeParse({
        email: 'test@example.com',
        linkedin_url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createCampaignSchema', () => {
    it('accepts valid campaign with all fields', () => {
      const result = createCampaignSchema.safeParse({
        name: 'Q1 Outreach',
        description: 'First quarter outreach campaign',
        reply_mode: 'ai_draft_approve',
        ai_reply_context: 'We help companies with SEO.',
        ai_reply_tone: 'professional',
        timezone: 'America/New_York',
        send_days: [1, 2, 3, 4, 5],
        send_window_start: '08:00',
        send_window_end: '18:00',
        daily_send_limit: 100,
        min_spacing_seconds: 30,
        max_spacing_seconds: 600,
      });
      expect(result.success).toBe(true);
    });

    it('requires campaign name', () => {
      const result = createCampaignSchema.safeParse({
        description: 'No name campaign',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const flat = result.error.flatten();
        expect(flat.fieldErrors.name).toBeDefined();
      }
    });

    it('rejects empty campaign name', () => {
      const result = createCampaignSchema.safeParse({ name: '' });
      expect(result.success).toBe(false);
    });

    it('applies default values for optional fields', () => {
      const result = createCampaignSchema.safeParse({ name: 'Basic Campaign' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.reply_mode).toBe('manual');
        expect(result.data.timezone).toBe('America/Chicago');
        expect(result.data.send_days).toEqual([1, 2, 3, 4, 5]);
        expect(result.data.send_window_start).toBe('09:00');
        expect(result.data.send_window_end).toBe('17:00');
        expect(result.data.daily_send_limit).toBe(50);
        expect(result.data.min_spacing_seconds).toBe(60);
        expect(result.data.max_spacing_seconds).toBe(300);
      }
    });

    it('validates reply_mode enum values', () => {
      expect(
        createCampaignSchema.safeParse({
          name: 'Test',
          reply_mode: 'manual',
        }).success
      ).toBe(true);
      expect(
        createCampaignSchema.safeParse({
          name: 'Test',
          reply_mode: 'ai_draft_approve',
        }).success
      ).toBe(true);
      expect(
        createCampaignSchema.safeParse({
          name: 'Test',
          reply_mode: 'ai_auto_reply',
        }).success
      ).toBe(true);
      expect(
        createCampaignSchema.safeParse({
          name: 'Test',
          reply_mode: 'invalid_mode',
        }).success
      ).toBe(false);
    });

    it('rejects invalid send_window format', () => {
      const result = createCampaignSchema.safeParse({
        name: 'Test',
        send_window_start: '9am',
      });
      expect(result.success).toBe(false);
    });

    it('rejects daily_send_limit exceeding max', () => {
      const result = createCampaignSchema.safeParse({
        name: 'Test',
        daily_send_limit: 5000,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createOutreachAccountSchema', () => {
    it('accepts valid outreach account data', () => {
      const result = createOutreachAccountSchema.safeParse({
        email: 'outreach@company.com',
        from_name: 'Sales Team',
        resend_api_key: 're_abc123',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.daily_limit).toBe(50); // default
      }
    });

    it('rejects invalid email for outreach account', () => {
      const result = createOutreachAccountSchema.safeParse({
        email: 'bad-email',
        from_name: 'Test',
        resend_api_key: 'key123',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing resend_api_key', () => {
      const result = createOutreachAccountSchema.safeParse({
        email: 'test@example.com',
        from_name: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateOutreachAccountSchema', () => {
    it('accepts valid status updates', () => {
      for (const status of ['active', 'paused', 'disabled'] as const) {
        const result = updateOutreachAccountSchema.safeParse({ status });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid status value', () => {
      const result = updateOutreachAccountSchema.safeParse({
        status: 'deleted',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createSequenceStepSchema', () => {
    it('accepts valid sequence step', () => {
      const result = createSequenceStepSchema.safeParse({
        step_order: 1,
        delay_days: 3,
        subject_template: 'Follow up: {{company}}',
        body_template: 'Hi {{first_name}}, just checking in...',
      });
      expect(result.success).toBe(true);
    });

    it('rejects step_order of zero', () => {
      const result = createSequenceStepSchema.safeParse({
        step_order: 0,
        delay_days: 1,
        subject_template: 'Hi',
        body_template: 'Body',
      });
      expect(result.success).toBe(false);
    });

    it('rejects delay_days exceeding 90', () => {
      const result = createSequenceStepSchema.safeParse({
        step_order: 1,
        delay_days: 100,
        subject_template: 'Hi',
        body_template: 'Body',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('addLeadsToCampaignSchema', () => {
    it('accepts valid UUID array', () => {
      const result = addLeadsToCampaignSchema.safeParse({
        lead_ids: ['550e8400-e29b-41d4-a716-446655440000'],
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty lead_ids array', () => {
      const result = addLeadsToCampaignSchema.safeParse({ lead_ids: [] });
      expect(result.success).toBe(false);
    });

    it('rejects non-UUID strings in lead_ids', () => {
      const result = addLeadsToCampaignSchema.safeParse({
        lead_ids: ['not-a-uuid'],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('sendReplySchema', () => {
    it('accepts valid reply with body_text only', () => {
      const result = sendReplySchema.safeParse({
        body_text: 'Thank you for your interest.',
      });
      expect(result.success).toBe(true);
    });

    it('accepts reply with both text and HTML', () => {
      const result = sendReplySchema.safeParse({
        body_text: 'Thank you.',
        body_html: '<p>Thank you.</p>',
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty body_text', () => {
      const result = sendReplySchema.safeParse({ body_text: '' });
      expect(result.success).toBe(false);
    });
  });
});
