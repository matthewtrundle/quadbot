import { db } from '@/lib/db';
import { outreachAccounts } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AddAccountForm } from '@/components/outreach/add-account-form';

export const dynamic = 'force-dynamic';

export default async function AccountsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const accounts = await db
    .select({
      id: outreachAccounts.id,
      email: outreachAccounts.email,
      from_name: outreachAccounts.from_name,
      daily_limit: outreachAccounts.daily_limit,
      sent_today: outreachAccounts.sent_today,
      status: outreachAccounts.status,
      total_sent: outreachAccounts.total_sent,
      total_bounced: outreachAccounts.total_bounced,
      bounce_rate: outreachAccounts.bounce_rate,
    })
    .from(outreachAccounts)
    .where(eq(outreachAccounts.brand_id, id));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{accounts.length} sending accounts</p>
      </div>

      <AddAccountForm brandId={id} />

      {accounts.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          No sending accounts. Add one above to start sending emails.
        </p>
      ) : (
        <div className="grid gap-3">
          {accounts.map((a) => (
            <Card key={a.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{a.from_name} &lt;{a.email}&gt;</p>
                    <p className="text-sm text-muted-foreground">
                      Today: {a.sent_today}/{a.daily_limit} | Total: {a.total_sent} sent, {a.total_bounced} bounced
                    </p>
                  </div>
                  <Badge variant={a.status === 'active' ? 'default' : 'secondary'}>{a.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
