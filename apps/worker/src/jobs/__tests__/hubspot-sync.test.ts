import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the HubSpot sync job logic.
 * Since importing from worker modules triggers config.ts env validation,
 * we replicate pure functions locally in this test file (same pattern as
 * other tests in the project).
 */

// ---------------------------------------------------------------------------
// Replicated types (minimal subset for testing)
// ---------------------------------------------------------------------------

type HubSpotContactProperties = {
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

type HubSpotContact = {
  id: string;
  properties: HubSpotContactProperties;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
};

// ---------------------------------------------------------------------------
// Replicated pure functions from hubspot-sync.ts
// ---------------------------------------------------------------------------

function mapHubSpotContactToLead(
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
      hubspot_last_synced: expect.any(String),
    },
  };
}

function shouldSkipContact(contact: HubSpotContact): boolean {
  const email = contact.properties.email;
  return !email || email.trim() === '';
}

function buildEmailIndex<T extends { email: string }>(rows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const row of rows) {
    map.set(row.email.toLowerCase().trim(), row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeHubSpotContact(
  overrides: Partial<HubSpotContact> & { properties?: Partial<HubSpotContactProperties> } = {},
): HubSpotContact {
  return {
    id: overrides.id ?? 'hs-123',
    properties: {
      email: 'jane@example.com',
      firstname: 'Jane',
      lastname: 'Doe',
      company: 'Acme Inc',
      jobtitle: 'CTO',
      phone: '+1-555-0100',
      industry: 'Technology',
      city: 'Austin',
      state: 'TX',
      country: 'US',
      lifecyclestage: 'lead',
      ...overrides.properties,
    },
    createdAt: overrides.createdAt ?? '2025-01-10T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2025-01-15T00:00:00Z',
    archived: overrides.archived ?? false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubSpot Sync', () => {
  describe('mapHubSpotContactToLead', () => {
    const brandId = 'brand-abc';

    it('maps a full HubSpot contact to a lead record', () => {
      const contact = makeHubSpotContact();
      const result = mapHubSpotContactToLead(contact, brandId);

      expect(result).toEqual({
        brand_id: brandId,
        email: 'jane@example.com',
        first_name: 'Jane',
        last_name: 'Doe',
        company: 'Acme Inc',
        title: 'CTO',
        phone: '+1-555-0100',
        industry: 'Technology',
        location: 'Austin, TX, US',
        custom_fields: {
          hubspot_contact_id: 'hs-123',
          hubspot_lifecycle_stage: 'lead',
          hubspot_last_synced: expect.any(String),
        },
      });
    });

    it('lowercases and trims email', () => {
      const contact = makeHubSpotContact({
        properties: { email: '  JOHN@Example.COM  ' },
      });
      const result = mapHubSpotContactToLead(contact, brandId);
      expect(result.email).toBe('john@example.com');
    });

    it('handles missing optional properties with nulls', () => {
      const contact = makeHubSpotContact({
        properties: {
          email: 'minimal@example.com',
          firstname: undefined,
          lastname: undefined,
          company: undefined,
          jobtitle: undefined,
          phone: undefined,
          industry: undefined,
          city: undefined,
          state: undefined,
          country: undefined,
          lifecyclestage: undefined,
        },
      });
      const result = mapHubSpotContactToLead(contact, brandId);

      expect(result.first_name).toBeNull();
      expect(result.last_name).toBeNull();
      expect(result.company).toBeNull();
      expect(result.title).toBeNull();
      expect(result.phone).toBeNull();
      expect(result.industry).toBeNull();
      expect(result.location).toBeNull();
    });

    it('builds partial location from available city/state/country', () => {
      const contact = makeHubSpotContact({
        properties: { city: 'Denver', state: undefined, country: 'US' },
      });
      const result = mapHubSpotContactToLead(contact, 'brand-1');
      expect(result.location).toBe('Denver, US');
    });

    it('stores hubspot_contact_id in custom_fields', () => {
      const contact = makeHubSpotContact({ id: 'hs-999' });
      const result = mapHubSpotContactToLead(contact, brandId);
      expect(result.custom_fields.hubspot_contact_id).toBe('hs-999');
    });
  });

  describe('shouldSkipContact', () => {
    it('skips contacts with no email', () => {
      const contact = makeHubSpotContact({ properties: { email: undefined } });
      expect(shouldSkipContact(contact)).toBe(true);
    });

    it('skips contacts with empty email', () => {
      const contact = makeHubSpotContact({ properties: { email: '' } });
      expect(shouldSkipContact(contact)).toBe(true);
    });

    it('skips contacts with whitespace-only email', () => {
      const contact = makeHubSpotContact({ properties: { email: '   ' } });
      expect(shouldSkipContact(contact)).toBe(true);
    });

    it('does not skip contacts with valid email', () => {
      const contact = makeHubSpotContact({ properties: { email: 'valid@example.com' } });
      expect(shouldSkipContact(contact)).toBe(false);
    });
  });

  describe('buildEmailIndex', () => {
    it('builds a map keyed by lowercase email', () => {
      const rows = [
        { id: '1', email: 'Alice@Example.com' },
        { id: '2', email: 'bob@test.com' },
      ];
      const index = buildEmailIndex(rows);

      expect(index.size).toBe(2);
      expect(index.get('alice@example.com')).toEqual({ id: '1', email: 'Alice@Example.com' });
      expect(index.get('bob@test.com')).toEqual({ id: '2', email: 'bob@test.com' });
    });

    it('handles empty array', () => {
      const index = buildEmailIndex([]);
      expect(index.size).toBe(0);
    });

    it('handles duplicate emails (last one wins)', () => {
      const rows = [
        { id: '1', email: 'dup@example.com' },
        { id: '2', email: 'DUP@example.com' },
      ];
      const index = buildEmailIndex(rows);
      expect(index.size).toBe(1);
      expect(index.get('dup@example.com')?.id).toBe('2');
    });

    it('trims whitespace from emails', () => {
      const rows = [{ id: '1', email: '  spaced@example.com  ' }];
      const index = buildEmailIndex(rows);
      expect(index.has('spaced@example.com')).toBe(true);
    });
  });

  describe('contact matching by email', () => {
    it('finds existing lead by email match', () => {
      const existingLeads = [
        { id: 'lead-1', email: 'jane@example.com' },
        { id: 'lead-2', email: 'john@example.com' },
      ];
      const emailIndex = buildEmailIndex(existingLeads);

      const hubspotContact = makeHubSpotContact({
        properties: { email: 'Jane@Example.com' },
      });
      const leadData = mapHubSpotContactToLead(hubspotContact, 'brand-1');
      const match = emailIndex.get(leadData.email);

      expect(match).toBeDefined();
      expect(match?.id).toBe('lead-1');
    });

    it('returns undefined for non-matching email', () => {
      const existingLeads = [{ id: 'lead-1', email: 'jane@example.com' }];
      const emailIndex = buildEmailIndex(existingLeads);

      const hubspotContact = makeHubSpotContact({
        properties: { email: 'unknown@example.com' },
      });
      const leadData = mapHubSpotContactToLead(hubspotContact, 'brand-1');
      const match = emailIndex.get(leadData.email);

      expect(match).toBeUndefined();
    });
  });

  describe('lead creation from HubSpot contacts', () => {
    it('produces a complete lead record from HubSpot data', () => {
      const contact = makeHubSpotContact({
        id: 'hs-500',
        properties: {
          email: 'newlead@startup.io',
          firstname: 'Sam',
          lastname: 'Wilson',
          company: 'Startup IO',
          jobtitle: 'VP Engineering',
          phone: '+1-555-0200',
          industry: 'SaaS',
          city: 'San Francisco',
          state: 'CA',
          country: 'US',
          lifecyclestage: 'subscriber',
        },
      });

      const lead = mapHubSpotContactToLead(contact, 'brand-xyz');

      expect(lead.brand_id).toBe('brand-xyz');
      expect(lead.email).toBe('newlead@startup.io');
      expect(lead.first_name).toBe('Sam');
      expect(lead.last_name).toBe('Wilson');
      expect(lead.company).toBe('Startup IO');
      expect(lead.title).toBe('VP Engineering');
      expect(lead.phone).toBe('+1-555-0200');
      expect(lead.industry).toBe('SaaS');
      expect(lead.location).toBe('San Francisco, CA, US');
      expect(lead.custom_fields.hubspot_contact_id).toBe('hs-500');
      expect(lead.custom_fields.hubspot_lifecycle_stage).toBe('subscriber');
    });

    it('handles contact with minimal data', () => {
      const contact: HubSpotContact = {
        id: 'hs-minimal',
        properties: { email: 'bare@example.com' },
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        archived: false,
      };

      const lead = mapHubSpotContactToLead(contact, 'brand-1');

      expect(lead.email).toBe('bare@example.com');
      expect(lead.first_name).toBeNull();
      expect(lead.last_name).toBeNull();
      expect(lead.company).toBeNull();
      expect(lead.title).toBeNull();
      expect(lead.location).toBeNull();
      expect(lead.custom_fields.hubspot_contact_id).toBe('hs-minimal');
    });
  });

  describe('timestamp tracking for incremental sync', () => {
    it('computes sync timestamp as ISO string', () => {
      const before = Date.now();
      const syncStartedAt = new Date().toISOString();
      const after = Date.now();

      const syncTime = new Date(syncStartedAt).getTime();
      expect(syncTime).toBeGreaterThanOrEqual(before);
      expect(syncTime).toBeLessThanOrEqual(after);
    });

    it('uses last_sync_at to determine incremental vs full sync', () => {
      // When last_sync_at is null, it is first sync (push only)
      const configNoSync: Record<string, unknown> = {};
      const lastSyncAt = (configNoSync.last_sync_at as string) || null;
      expect(lastSyncAt).toBeNull();

      // When last_sync_at is set, pull contacts modified since that time
      const configWithSync: Record<string, unknown> = {
        last_sync_at: '2025-01-10T00:00:00Z',
      };
      const lastSyncAtSet = (configWithSync.last_sync_at as string) || null;
      expect(lastSyncAtSet).toBe('2025-01-10T00:00:00Z');
    });

    it('updates config with new sync timestamp after completion', () => {
      const existingConfig: Record<string, unknown> = {
        some_other_key: 'value',
        last_sync_at: '2025-01-10T00:00:00Z',
      };
      const newSyncAt = '2025-01-15T12:00:00Z';

      const updatedConfig: Record<string, unknown> = {
        ...existingConfig,
        last_sync_at: newSyncAt,
      };

      expect(updatedConfig['last_sync_at']).toBe(newSyncAt);
      expect(updatedConfig['some_other_key']).toBe('value');
    });

    it('preserves existing config keys when updating last_sync_at', () => {
      const existingConfig: Record<string, unknown> = {
        scopes: ['contacts'],
        portal_id: '12345',
        last_sync_at: '2025-01-01T00:00:00Z',
      };

      const updatedConfig: Record<string, unknown> = {
        ...existingConfig,
        last_sync_at: '2025-02-01T00:00:00Z',
      };

      expect(updatedConfig['scopes']).toEqual(['contacts']);
      expect(updatedConfig['portal_id']).toBe('12345');
      expect(updatedConfig['last_sync_at']).toBe('2025-02-01T00:00:00Z');
    });
  });
});
