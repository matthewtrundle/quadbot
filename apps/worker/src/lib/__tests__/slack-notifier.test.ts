import { describe, it, expect } from 'vitest';
import { formatSlackBlocks, isValidSlackWebhookUrl } from '../slack-notifier.js';

describe('Slack Notifier', () => {
  describe('formatSlackBlocks', () => {
    it('formats notification with header, section, and context blocks', () => {
      const result = formatSlackBlocks({
        title: 'Test Alert',
        body: 'Something happened',
        priority: 'high',
        source: 'anomaly_detector',
        brandName: 'TestBrand',
      }) as { blocks: Array<{ type: string }> };

      expect(result.blocks).toHaveLength(3);
      expect(result.blocks[0].type).toBe('header');
      expect(result.blocks[1].type).toBe('section');
      expect(result.blocks[2].type).toBe('context');
    });

    it('adds action block when URL is provided', () => {
      const result = formatSlackBlocks({
        title: 'Test',
        body: 'Body',
        priority: 'medium',
        source: 'test',
        brandName: 'Brand',
        url: 'https://example.com/dashboard',
      }) as { blocks: Array<{ type: string }> };

      expect(result.blocks).toHaveLength(4);
      expect(result.blocks[3].type).toBe('actions');
    });

    it('includes priority emoji in header', () => {
      const result = formatSlackBlocks({
        title: 'Critical Issue',
        body: 'Urgent',
        priority: 'critical',
        source: 'test',
        brandName: 'Brand',
      }) as { blocks: Array<{ type: string; text?: { text: string } }> };

      expect(result.blocks[0].text?.text).toContain(':rotating_light:');
    });

    it('truncates long body text', () => {
      const longBody = 'x'.repeat(5000);
      const result = formatSlackBlocks({
        title: 'Test',
        body: longBody,
        priority: 'low',
        source: 'test',
        brandName: 'Brand',
      }) as { blocks: Array<{ type: string; text?: { text: string } }> };

      expect(result.blocks[1].text?.text.length).toBeLessThanOrEqual(2900);
    });
  });

  describe('isValidSlackWebhookUrl', () => {
    it('accepts valid hooks.slack.com URLs', () => {
      expect(isValidSlackWebhookUrl('https://hooks.slack.com/services/T00/B00/xxx')).toBe(true);
    });

    it('rejects non-slack URLs', () => {
      expect(isValidSlackWebhookUrl('https://evil.com/services/T00/B00/xxx')).toBe(false);
    });

    it('rejects HTTP URLs', () => {
      expect(isValidSlackWebhookUrl('http://hooks.slack.com/services/T00/B00/xxx')).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(isValidSlackWebhookUrl('not-a-url')).toBe(false);
    });
  });
});
