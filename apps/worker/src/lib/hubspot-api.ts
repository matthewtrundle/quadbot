/**
 * HubSpot CRM API client utilities for the worker.
 * Uses HubSpot API v3: https://api.hubapi.com/crm/v3/objects/contacts
 */

import { brandIntegrations, sharedCredentials, decrypt } from '@quadbot/db';
import type { Database } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

export type HubSpotTokens = {
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

export type HubSpotContactProperties = {
  email?: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  jobtitle?: string;
  phone?: string;
  industry?: string;
  city?: string;
  state?: string;
  country?: string;
  lifecyclestage?: string;
  [key: string]: string | undefined;
};

export type HubSpotContact = {
  id: string;
  properties: HubSpotContactProperties;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

export type HubSpotPaginatedResponse = {
  results: HubSpotContact[];
  paging?: {
    next?: {
      after: string;
      link: string;
    };
  };
};

export type HubSpotSearchResponse = {
  total: number;
  results: HubSpotContact[];
};

const HUBSPOT_API_BASE = 'https://api.hubapi.com/crm/v3/objects/contacts';

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

/**
 * Load HubSpot credentials for a brand integration.
 * Supports both direct credentials and shared credentials.
 */
export async function loadHubSpotCredentials(db: Database, brandId: string): Promise<HubSpotTokens | null> {
  const [integration] = await db
    .select()
    .from(brandIntegrations)
    .where(and(eq(brandIntegrations.brand_id, brandId), eq(brandIntegrations.type, 'hubspot')))
    .limit(1);

  if (!integration) {
    return null;
  }

  // Check for shared credentials first
  if (integration.shared_credential_id) {
    const [shared] = await db
      .select()
      .from(sharedCredentials)
      .where(eq(sharedCredentials.id, integration.shared_credential_id))
      .limit(1);

    if (shared) {
      return JSON.parse(decrypt(shared.credentials_encrypted)) as HubSpotTokens;
    }
  }

  // Fall back to direct credentials
  if (integration.credentials_encrypted) {
    return JSON.parse(decrypt(integration.credentials_encrypted)) as HubSpotTokens;
  }

  return null;
}

/**
 * Refresh an expired HubSpot access token using the refresh token.
 */
export async function refreshHubSpotToken(refreshToken: string): Promise<HubSpotTokens> {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET must be configured');
  }

  const response = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot token refresh failed: ${error}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

/**
 * Get a valid HubSpot access token, refreshing and persisting if needed.
 */
export async function getValidHubSpotToken(db: Database, brandId: string): Promise<string | null> {
  const credentials = await loadHubSpotCredentials(db, brandId);
  if (!credentials) {
    return null;
  }

  // Check if token is expired (with 5 minute buffer)
  const expiresAt = new Date(credentials.expires_at);
  const bufferMs = 5 * 60 * 1000;

  if (expiresAt.getTime() - bufferMs > Date.now()) {
    return credentials.access_token;
  }

  // Token expired, refresh it
  logger.info({ brandId }, 'Refreshing expired HubSpot access token');
  try {
    const newTokens = await refreshHubSpotToken(credentials.refresh_token);

    // Persist refreshed tokens back to database
    const { persistRefreshedTokens } = await import('./token-persistence.js');
    await persistRefreshedTokens(db, brandId, 'hubspot', newTokens);

    return newTokens.access_token;
  } catch (error) {
    logger.error({ brandId, error }, 'Failed to refresh HubSpot access token');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Contact API methods
// ---------------------------------------------------------------------------

/**
 * List contacts with pagination cursor.
 */
export async function getContacts(
  accessToken: string,
  options: { after?: string; limit?: number } = {},
): Promise<HubSpotPaginatedResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 100),
    properties: 'email,firstname,lastname,company,jobtitle,phone,industry,city,state,country,lifecyclestage',
  });

  if (options.after) {
    params.set('after', options.after);
  }

  const url = HUBSPOT_API_BASE + '?' + params.toString();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot getContacts failed (${response.status}): ${error}`);
  }

  return (await response.json()) as HubSpotPaginatedResponse;
}

/**
 * Create a contact in HubSpot.
 */
export async function createContact(
  accessToken: string,
  contact: {
    email: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    properties?: HubSpotContactProperties;
  },
): Promise<HubSpotContact> {
  const properties: HubSpotContactProperties = {
    email: contact.email,
    ...contact.properties,
  };

  if (contact.firstName) properties.firstname = contact.firstName;
  if (contact.lastName) properties.lastname = contact.lastName;
  if (contact.company) properties.company = contact.company;

  const response = await fetch(HUBSPOT_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot createContact failed (${response.status}): ${error}`);
  }

  return (await response.json()) as HubSpotContact;
}

/**
 * Update contact properties by contact ID.
 */
export async function updateContact(
  accessToken: string,
  contactId: string,
  properties: HubSpotContactProperties,
): Promise<HubSpotContact> {
  const url = HUBSPOT_API_BASE + '/' + contactId;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot updateContact failed (${response.status}): ${error}`);
  }

  return (await response.json()) as HubSpotContact;
}

/**
 * Search for a contact by email address.
 * Returns the first matching contact or null.
 */
export async function searchByEmail(accessToken: string, email: string): Promise<HubSpotContact | null> {
  const url = HUBSPOT_API_BASE + '/search';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'email',
              operator: 'EQ',
              value: email,
            },
          ],
        },
      ],
      properties: [
        'email',
        'firstname',
        'lastname',
        'company',
        'jobtitle',
        'phone',
        'industry',
        'city',
        'state',
        'country',
        'lifecyclestage',
      ],
      limit: 1,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot searchByEmail failed (${response.status}): ${error}`);
  }

  const data = (await response.json()) as HubSpotSearchResponse;
  return data.results.length > 0 ? data.results[0] : null;
}

/**
 * Search for recently modified contacts using the search endpoint.
 * Returns contacts updated after the given ISO timestamp.
 */
export async function searchRecentlyModified(
  accessToken: string,
  since: string,
  options: { after?: number; limit?: number } = {},
): Promise<HubSpotSearchResponse> {
  const url = HUBSPOT_API_BASE + '/search';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lastmodifieddate',
              operator: 'GTE',
              value: new Date(since).getTime().toString(),
            },
          ],
        },
      ],
      sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
      properties: [
        'email',
        'firstname',
        'lastname',
        'company',
        'jobtitle',
        'phone',
        'industry',
        'city',
        'state',
        'country',
        'lifecyclestage',
      ],
      limit: options.limit ?? 100,
      after: options.after ?? 0,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HubSpot searchRecentlyModified failed (${response.status}): ${error}`);
  }

  return (await response.json()) as HubSpotSearchResponse;
}
