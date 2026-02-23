import { db } from '@/lib/db';
import { leadLists, leads } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function LeadListDetailPage({
  params,
}: {
  params: Promise<{ id: string; lid: string }>;
}) {
  const { id: brandId, lid } = await params;

  const [list] = await db.select().from(leadLists).where(eq(leadLists.id, lid)).limit(1);
  if (!list) notFound();

  const listLeads = await db.select().from(leads).where(eq(leads.lead_list_id, lid));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">{list.name}</h3>
        <p className="text-sm text-muted-foreground">
          {listLeads.length} leads | Imported from {list.original_filename}
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Email</th>
                  <th className="text-left p-3 font-medium">Name</th>
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-left p-3 font-medium">Title</th>
                  <th className="text-left p-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {listLeads.map((lead) => (
                  <tr key={lead.id} className="border-b">
                    <td className="p-3">{lead.email}</td>
                    <td className="p-3">{lead.first_name} {lead.last_name}</td>
                    <td className="p-3">{lead.company || '-'}</td>
                    <td className="p-3">{lead.title || '-'}</td>
                    <td className="p-3">
                      {lead.is_bounced ? <span className="text-red-500">Bounced</span> :
                       lead.is_unsubscribed ? <span className="text-yellow-500">Unsub</span> :
                       <span className="text-green-500">Active</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
