import Handlebars from 'handlebars';

export type LeadData = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  phone?: string | null;
  industry?: string | null;
  employee_count?: string | null;
  location?: string | null;
  custom_fields?: Record<string, unknown> | null;
};

/**
 * Render a Handlebars template with lead data.
 * Flattens custom_fields into the top-level context so {{custom_field_name}} works.
 */
export function renderTemplate(template: string, lead: LeadData): string {
  const context: Record<string, unknown> = {
    email: lead.email,
    first_name: lead.first_name || '',
    last_name: lead.last_name || '',
    company: lead.company || '',
    title: lead.title || '',
    linkedin_url: lead.linkedin_url || '',
    phone: lead.phone || '',
    industry: lead.industry || '',
    employee_count: lead.employee_count || '',
    location: lead.location || '',
    // Flatten custom fields into context
    ...(lead.custom_fields || {}),
  };

  const compiled = Handlebars.compile(template);
  return compiled(context);
}

/**
 * Strip HTML tags to generate a plain text fallback.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
