import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { leads, leadLists } from '@quadbot/db';
import { eq, sql } from 'drizzle-orm';
import Papa from 'papaparse';
import { withRateLimit } from '@/lib/rate-limit';

const FIELD_MAP: Record<string, string> = {
  email: 'email',
  'e-mail': 'email',
  first_name: 'first_name',
  firstname: 'first_name',
  'first name': 'first_name',
  last_name: 'last_name',
  lastname: 'last_name',
  'last name': 'last_name',
  company: 'company',
  'company name': 'company',
  organization: 'company',
  title: 'title',
  'job title': 'title',
  position: 'title',
  linkedin_url: 'linkedin_url',
  linkedin: 'linkedin_url',
  'linkedin url': 'linkedin_url',
  phone: 'phone',
  'phone number': 'phone',
  industry: 'industry',
  employee_count: 'employee_count',
  'company size': 'employee_count',
  '# employees': 'employee_count',
  employees: 'employee_count',
  location: 'location',
  city: 'location',
};

const STANDARD_FIELDS = new Set([
  'email', 'first_name', 'last_name', 'company', 'title',
  'linkedin_url', 'phone', 'industry', 'employee_count', 'location',
]);

const _POST = async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const brandId = formData.get('brandId') as string | null;
  const listId = formData.get('listId') as string | null;
  const columnMappingStr = formData.get('columnMapping') as string | null;

  if (!file || !brandId) {
    return NextResponse.json({ error: 'file and brandId required' }, { status: 400 });
  }

  const csvText = await file.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json({ error: 'Failed to parse CSV', details: parsed.errors }, { status: 400 });
  }

  // Determine column mapping
  const columnMapping: Record<string, string> = columnMappingStr
    ? JSON.parse(columnMappingStr)
    : autoMapColumns(parsed.meta.fields || []);

  // Create or update lead list
  let leadListId = listId;
  if (!leadListId) {
    const [newList] = await db
      .insert(leadLists)
      .values({
        brand_id: brandId,
        name: file.name.replace(/\.csv$/i, ''),
        original_filename: file.name,
        total_rows: parsed.data.length,
        column_mapping: columnMapping,
      })
      .returning();
    leadListId = newList.id;
  }

  let imported = 0;
  let duplicates = 0;
  let errors = 0;

  for (const row of parsed.data as Record<string, string>[]) {
    try {
      const mapped = mapRow(row, columnMapping);
      if (!mapped.email) {
        errors++;
        continue;
      }

      const email = mapped.email as string;

      // Upsert on (brand_id, email)
      const result = await db
        .insert(leads)
        .values({
          brand_id: brandId,
          lead_list_id: leadListId,
          email,
          first_name: mapped.first_name as string | undefined,
          last_name: mapped.last_name as string | undefined,
          company: mapped.company as string | undefined,
          title: mapped.title as string | undefined,
          linkedin_url: mapped.linkedin_url as string | undefined,
          phone: mapped.phone as string | undefined,
          industry: mapped.industry as string | undefined,
          employee_count: mapped.employee_count as string | undefined,
          location: mapped.location as string | undefined,
          custom_fields: mapped.custom_fields as Record<string, unknown> | undefined,
        })
        .onConflictDoUpdate({
          target: [leads.brand_id, leads.email],
          set: {
            first_name: sql`COALESCE(EXCLUDED.first_name, ${leads.first_name})`,
            last_name: sql`COALESCE(EXCLUDED.last_name, ${leads.last_name})`,
            company: sql`COALESCE(EXCLUDED.company, ${leads.company})`,
            title: sql`COALESCE(EXCLUDED.title, ${leads.title})`,
            linkedin_url: sql`COALESCE(EXCLUDED.linkedin_url, ${leads.linkedin_url})`,
            phone: sql`COALESCE(EXCLUDED.phone, ${leads.phone})`,
            industry: sql`COALESCE(EXCLUDED.industry, ${leads.industry})`,
            employee_count: sql`COALESCE(EXCLUDED.employee_count, ${leads.employee_count})`,
            location: sql`COALESCE(EXCLUDED.location, ${leads.location})`,
            updated_at: new Date(),
          },
        })
        .returning();

      // Check if it was an insert or update by comparing created_at with now
      const wasInsert = result[0] && new Date(result[0].created_at).getTime() > Date.now() - 5000;
      if (wasInsert) {
        imported++;
      } else {
        duplicates++;
      }
    } catch {
      errors++;
    }
  }

  // Update list stats
  await db
    .update(leadLists)
    .set({ imported_count: imported, duplicate_count: duplicates, error_count: errors })
    .where(eq(leadLists.id, leadListId));

  return NextResponse.json({
    list_id: leadListId,
    total_rows: parsed.data.length,
    imported,
    duplicates,
    errors,
  }, { status: 201 });
};
export const POST = withRateLimit(_POST);

function autoMapColumns(fields: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const field of fields) {
    const normalized = field.toLowerCase().trim();
    if (FIELD_MAP[normalized]) {
      mapping[field] = FIELD_MAP[normalized];
    }
  }
  return mapping;
}

function mapRow(
  row: Record<string, string>,
  columnMapping: Record<string, string>,
): Record<string, any> {
  const result: Record<string, any> = {};
  const customFields: Record<string, string> = {};

  for (const [csvCol, targetField] of Object.entries(columnMapping)) {
    const value = row[csvCol]?.trim();
    if (!value) continue;

    if (STANDARD_FIELDS.has(targetField)) {
      result[targetField] = value;
    } else {
      customFields[targetField] = value;
    }
  }

  // Any unmapped columns go to custom_fields
  for (const [key, value] of Object.entries(row)) {
    if (!columnMapping[key] && value?.trim()) {
      customFields[key] = value.trim();
    }
  }

  if (Object.keys(customFields).length > 0) {
    result.custom_fields = customFields;
  }

  return result;
}
