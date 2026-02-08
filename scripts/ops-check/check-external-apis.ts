import { pass, fail, skip } from './lib/helpers.js';

export async function checkExternalApis() {
  // 1. Claude API ping
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Say "ok"' }],
        }),
      });

      if (res.ok) {
        pass('External', 'Claude API ping');
      } else {
        const body = await res.json().catch(() => ({}));
        fail('External', 'Claude API ping', `HTTP ${res.status}: ${JSON.stringify(body)}`);
      }
    } catch (err: any) {
      fail('External', 'Claude API ping', err.message);
    }
  } else {
    skip('External', 'Claude API - ANTHROPIC_API_KEY not set');
  }

  // 2. Google token refresh
  // Check if any brand has GSC credentials by looking for the env var
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (googleClientId && googleClientSecret) {
    // We don't actually refresh here since we'd need a stored refresh token
    // Just verify the OAuth config is present
    pass('External', 'Google OAuth config present');
  } else {
    skip('External', 'Google OAuth - credentials not configured');
  }
}
