import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth-session';
import Papa from 'papaparse';

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

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 });

  const csvText = await file.text();
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true, preview: 5 });

  const fields = parsed.meta.fields || [];
  const autoMapping: Record<string, string> = {};
  for (const field of fields) {
    const normalized = field.toLowerCase().trim();
    if (FIELD_MAP[normalized]) {
      autoMapping[field] = FIELD_MAP[normalized];
    }
  }

  return NextResponse.json({
    columns: fields,
    auto_mapping: autoMapping,
    preview_rows: parsed.data.slice(0, 5),
    total_rows: csvText.split('\n').length - 1,
  });
}
