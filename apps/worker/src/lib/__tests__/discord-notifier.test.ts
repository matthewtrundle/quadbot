import { describe, it, expect } from 'vitest';
import { formatDiscordEmbed, isValidDiscordWebhookUrl } from '../discord-notifier.js';

describe('Discord Notifier', () => {
  describe('formatDiscordEmbed', () => {
    it('formats notification as Discord embed', () => {
      const result = formatDiscordEmbed({
        title: 'Test Alert',
        body: 'Something happened',
        priority: 'high',
        source: 'anomaly_detector',
        brandName: 'TestBrand',
      }) as { embeds: Array<Record<string, unknown>> };

      expect(result.embeds).toHaveLength(1);
      expect(result.embeds[0].title).toBe('Test Alert');
      expect(result.embeds[0].description).toBe('Something happened');
      expect(result.embeds[0].color).toBe(0xffa500); // orange for high
    });

    it('uses correct colors for each priority', () => {
      const priorities = ['critical', 'high', 'medium', 'low'];
      const expectedColors = [0xed4245, 0xffa500, 0xfee75c, 0x57f287];

      for (let i = 0; i < priorities.length; i++) {
        const result = formatDiscordEmbed({
          title: 'Test',
          body: 'Body',
          priority: priorities[i],
          source: 'test',
          brandName: 'Brand',
        }) as { embeds: Array<Record<string, unknown>> };

        expect(result.embeds[0].color).toBe(expectedColors[i]);
      }
    });

    it('includes brand, source, and priority fields', () => {
      const result = formatDiscordEmbed({
        title: 'Test',
        body: 'Body',
        priority: 'medium',
        source: 'gsc_digest',
        brandName: 'MyBrand',
      }) as { embeds: Array<{ fields: Array<{ name: string; value: string }> }> };

      const fields = result.embeds[0].fields;
      expect(fields).toHaveLength(3);
      expect(fields[0].value).toBe('MyBrand');
      expect(fields[1].value).toBe('gsc_digest');
      expect(fields[2].value).toBe('MEDIUM');
    });

    it('adds URL when provided', () => {
      const result = formatDiscordEmbed({
        title: 'Test',
        body: 'Body',
        priority: 'low',
        source: 'test',
        brandName: 'Brand',
        url: 'https://example.com',
      }) as { embeds: Array<Record<string, unknown>> };

      expect(result.embeds[0].url).toBe('https://example.com');
    });

    it('truncates long body text', () => {
      const longBody = 'x'.repeat(5000);
      const result = formatDiscordEmbed({
        title: 'Test',
        body: longBody,
        priority: 'low',
        source: 'test',
        brandName: 'Brand',
      }) as { embeds: Array<{ description: string }> };

      expect(result.embeds[0].description.length).toBeLessThanOrEqual(4000);
    });
  });

  describe('isValidDiscordWebhookUrl', () => {
    it('accepts valid Discord webhook URLs', () => {
      expect(isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123/abc')).toBe(true);
    });

    it('rejects non-discord URLs', () => {
      expect(isValidDiscordWebhookUrl('https://evil.com/api/webhooks/123/abc')).toBe(false);
    });

    it('rejects URLs without /api/webhooks path', () => {
      expect(isValidDiscordWebhookUrl('https://discord.com/other/path')).toBe(false);
    });

    it('rejects HTTP URLs', () => {
      expect(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false);
    });

    it('rejects invalid URLs', () => {
      expect(isValidDiscordWebhookUrl('not-a-url')).toBe(false);
    });
  });
});
