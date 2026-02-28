/**
 * HubSpot CRM bi-directional sync job.
 * Pulls new/updated contacts from HubSpot into the leads table,
 * and pushes QuadBot outreach leads that have no HubSpot contact.
 */

import { brands, brandIntegrations, leads, encrypt, decrypt } from '@quadbot/db';
import { eq, and, isNull } from 'drizzle-orm';
import type { JobContext } from '../registry.js';
import { logger } from '../logger.js';
import {
  loadHubSpotCredentials,
  refreshHubSpotToken,
  searchRecentlyModified,
  searchByEmail,
  createContact,
  type HubSpotTokens,
  type HubSpotContact,
} from '../lib/hubspot-api.js';
import { persistRefreshedTokens } from '../lib/token-persistence.js';

// ---------------------------------------------------------------------------
// Pure helper functions (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Map a HubSpot contact to a partial lead record for upsert.
 */
export function mapHubSpotContactToLead(
  contact: HubSpotContact,
  brandId: string,
): {
  brand_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  phone: string | null;
  industry: string | null;
  location: string | null;
  custom_fields: Record<string, unknown>;
} {
  const props = contact.properties;
  const locationParts = [props.city, props.state, props.country].filter(Boolean);

  return {
    brand_id: brandId,
    email: (props.email ?? '').toLowerCase().trim(),
    first_name: props.firstname ?? null,
    last_name: props.lastname ?? null,
    company: props.company ?? null,
    title: props.jobtitle ?? null,
    phone: props.phone ?? null,
    industry: props.industry ?? null,
    location: locationParts.length > 0 ? locationParts.join(', ') : null,
    custom_fields: {
      hubspot_contact_id: contact.id,
      hubspot_lifecycle_stage: props.lifecyclestage ?? null,
      hubspot_last_synced: new Date().toISOString(),
    },
  };
}

/**
 * Determine whether a HubSpot contact should be skipped (e.g., missing email).
 */
export function shouldSkipContact(contact: HubSpotContact): boolean {
  const email = contact.properties.email;
  return !email || email.trim() === '';
}

/**
 * Build a map of existing leads keyed by lowercase email for efficient matching.
 */
export function buildEmailIndex<T extends { email: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(row.email.toLowerCase().trim(), row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Token helper
// ---------------------------------------------------------------------------

async function getValidToken(db: JobContext['db'], brandId: string, credentials: HubSpotTokens): Promise<string> {
  const expiresAt = new Date(credentials.expires_at);
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > Date.now()) {
    return credentials.access_token;
  }

  logger.info({ brandId }, 'Refreshing expired HubSpot access token');
  const freshTokens = await refreshHubSpotToken(credentials.refresh_token);
  await persistRefreshedTokens(db, brandId, 'hubspot', freshTokens);
  return freshTokens.access_token;
}

// ---------------------------------------------------------------------------
// Main job handler
// ---------------------------------------------------------------------------

export async function hubspotSync(ctx: JobContext): Promise<void> {
  const { db, jobId, brandId } = ctx;
  const startTime = Date.now();
  logger.info({ jobId, brandId, jobType: 'hubspot_sync' }, 'HubSpot sync starting');

  // 1. Load brand, check modules_enabled includes 'hubspot'
  const brand = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (brand.length === 0) throw new Error(`Brand ${brandId} not found`);

  const modulesEnabled = (brand[0].modules_enabled as string[]) || [];
  if (!modulesEnabled.includes('hubspot')) {
    logger.info({ jobId, brandId }, 'HubSpot module not enabled, skipping');
    return;
  }

  // 2. Load HubSpot integration credentials
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'hubspot')))
    .limit(1);

  if (!integration) {
    logger.info({ jobId, brandId }, 'No HubSpot integration found, skipping');
    return;
  }

  const credentials = await loadHubSpotCredentials(db, brandId);
  if (!credentials) {
    logger.info({ jobId, brandId }, 'No HubSpot credentials found, skipping');
    return;
  }

  const accessToken = await getValidToken(db, brandId, credentials);

  // 3. Get last_sync_at from integration config
  const config = (integration.config as Record<string, unknown>) || {};
  const lastSyncAt = (config.last_sync_at as string) || null;
  const syncStartedAt = new Date().toISOString();

  // ------------------------------------------------------------------
  // PULL: Fetch new/updated HubSpot contacts since last sync
  // ------------------------------------------------------------------
  let pulledCount = 0;
  let createdLeadCount = 0;
  let updatedLeadCount = 0;

  if (lastSyncAt) {
    logger.info({ jobId, brandId, lastSyncAt }, 'Pulling HubSpot contacts modified since last sync');

    try {
      const searchResult = await searchRecentlyModified(accessToken, lastSyncAt);
      const hubspotContacts = searchResult.results;

      if (hubspotContacts.length > 0) {
        // Load all existing leads for this brand to match by email
        const existingLeads = await db.select().from(leads).where(eq(leads.brand_id, brandId));

        const emailIndex = buildEmailIndex(existingLeads);

        for (const contact of hubspotContacts) {
          if (shouldSkipContact(contact)) continue;
          pulledCount++;

          const leadData = mapHubSpotContactToLead(contact, brandId);
          const existing = emailIndex.get(leadData.email);

          if (existing) {
            // Update existing lead with HubSpot data
            await db
              .update(leads)
              .set({
                first_name: leadData.first_name ?? existing.first_name,
                last_name: leadData.last_name ?? existing.last_name,
                company: leadData.company ?? existing.company,
                title: leadData.title ?? existing.title,
                phone: leadData.phone ?? existing.phone,
                industry: leadData.industry ?? existing.industry,
                location: leadData.location ?? existing.location,
                custom_fields: {
                  ...((existing.custom_fields as Record<string, unknown>) || {}),
                  ...leadData.custom_fields,
                },
                updated_at: new Date(),
              })
              .where(eq(leads.id, existing.id));
            updatedLeadCount++;
          } else {
            // Create new lead from HubSpot contact
            await db.insert(leads).values({
              brand_id: leadData.brand_id,
              email: leadData.email,
              first_name: leadData.first_name,
              last_name: leadData.last_name,
              company: leadData.company,
              title: leadData.title,
              phone: leadData.phone,
              industry: leadData.industry,
              location: leadData.location,
              custom_fields: leadData.custom_fields,
            });
            createdLeadCount++;
          }
        }
      }
    } catch (err) {
      logger.error({ jobId, brandId, err: (err as Error).message }, 'Failed to pull HubSpot contacts');
      // Continue to push phase even if pull fails
    }
  } else {
    logger.info({ jobId, brandId }, 'No last_sync_at — skipping pull (first sync will only push)');
  }

  logger.info({ jobId, brandId, pulledCount, createdLeadCount, updatedLeadCount }, 'HubSpot pull phase completed');

  // ------------------------------------------------------------------
  // PUSH: Push QuadBot leads that have no HubSpot contact
  // ------------------------------------------------------------------
  let pushedCount = 0;
  let pushErrorCount = 0;

  try {
    // Find leads without a hubspot_contact_id in custom_fields
    const allLeads = await db.select().from(leads).where(eq(leads.brand_id, brandId));

    const leadsWithoutHubSpot = allLeads.filter((lead) => {
      const cf = (lead.custom_fields as Record<string, unknown>) || {};
      return !cf.hubspot_contact_id;
    });

    for (const lead of leadsWithoutHubSpot) {
      try {
        // Search HubSpot to see if this email already exists
        const existingHsContact = await searchByEmail(accessToken, lead.email);

        if (existingHsContact) {
          // Contact exists in HubSpot — link it
          await db
            .update(leads)
            .set({
              custom_fields: {
                ...((lead.custom_fields as Record<string, unknown>) || {}),
                hubspot_contact_id: existingHsContact.id,
                hubspot_last_synced: new Date().toISOString(),
              },
              updated_at: new Date(),
            })
            .where(eq(leads.id, lead.id));
        } else {
          // Create new contact in HubSpot
          const newContact = await createContact(accessToken, {
            email: lead.email,
            firstName: lead.first_name ?? undefined,
            lastName: lead.last_name ?? undefined,
            company: lead.company ?? undefined,
            properties: {
              jobtitle: lead.title ?? undefined,
              phone: lead.phone ?? undefined,
              industry: lead.industry ?? undefined,
            },
          });

          // Store HubSpot contact ID back on the lead
          await db
            .update(leads)
            .set({
              custom_fields: {
                ...((lead.custom_fields as Record<string, unknown>) || {}),
                hubspot_contact_id: newContact.id,
                hubspot_last_synced: new Date().toISOString(),
              },
              updated_at: new Date(),
            })
            .where(eq(leads.id, lead.id));
        }

        pushedCount++;
      } catch (err) {
        pushErrorCount++;
        logger.warn(
          { jobId, brandId, email: lead.email, err: (err as Error).message },
          'Failed to push lead to HubSpot',
        );
        // Continue with next lead
      }
    }
  } catch (err) {
    logger.error({ jobId, brandId, err: (err as Error).message }, 'Failed during HubSpot push phase');
  }

  logger.info({ jobId, brandId, pushedCount, pushErrorCount }, 'HubSpot push phase completed');

  // ------------------------------------------------------------------
  // Update last_sync_at in brand_integrations config
  // ------------------------------------------------------------------
  await db
    .update(brandIntegrations)
    .set({
      config: {
        ...config,
        last_sync_at: syncStartedAt,
      },
      updated_at: new Date(),
    })
    .where(eq(brandIntegrations.id, integration.id));

  logger.info(
    {
      jobId,
      brandId,
      jobType: 'hubspot_sync',
      pulledCount,
      createdLeadCount,
      updatedLeadCount,
      pushedCount,
      pushErrorCount,
      durationMs: Date.now() - startTime,
    },
    'HubSpot sync completed',
  );
}
