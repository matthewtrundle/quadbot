/**
 * Persist refreshed OAuth tokens back to the database.
 * Prevents repeated token refreshes by saving fresh tokens after each refresh.
 */

import { brandIntegrations, sharedCredentials, encrypt } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';

type TokenPayload = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

/**
 * Persist refreshed tokens back to brand_integrations or shared_credentials.
 * Checks which credential source the integration uses and updates accordingly.
 */
export async function persistRefreshedTokens(
  db: Database,
  brandId: string,
  integrationType: string,
  tokens: TokenPayload,
): Promise<void> {
  try {
    const [integration] = await db
      .select()
      .from(brandIntegrations)
      .where(
        and(
          eq(brandIntegrations.brand_id, brandId),
          eq(brandIntegrations.type, integrationType),
        ),
      )
      .limit(1);

    if (!integration) {
      logger.warn({ brandId, integrationType }, 'No integration found to persist tokens');
      return;
    }

    const encrypted = encrypt(JSON.stringify(tokens));

    if (integration.shared_credential_id) {
      // Update shared credentials
      await db
        .update(sharedCredentials)
        .set({
          credentials_encrypted: encrypted,
          updated_at: new Date(),
        })
        .where(eq(sharedCredentials.id, integration.shared_credential_id));

      logger.info({ brandId, integrationType }, 'Persisted refreshed tokens to shared credentials');
    } else {
      // Update direct credentials
      await db
        .update(brandIntegrations)
        .set({
          credentials_encrypted: encrypted,
          updated_at: new Date(),
        })
        .where(eq(brandIntegrations.id, integration.id));

      logger.info({ brandId, integrationType }, 'Persisted refreshed tokens to brand integration');
    }
  } catch (err) {
    logger.error({ err, brandId, integrationType }, 'Failed to persist refreshed tokens');
    // Don't throw — token persistence failure shouldn't break the job
  }
}
