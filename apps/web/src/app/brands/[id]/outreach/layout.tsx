import Link from 'next/link';

export default async function OutreachLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Outreach</h2>
      </div>
      <nav className="flex gap-3 border-b pb-2 text-sm">
        <Link href={`/brands/${id}/outreach`} className="font-medium hover:text-primary">
          Campaigns
        </Link>
        <Link href={`/brands/${id}/outreach/leads`} className="font-medium hover:text-primary">
          Leads
        </Link>
        <Link href={`/brands/${id}/outreach/conversations`} className="font-medium hover:text-primary">
          Conversations
        </Link>
        <Link href={`/brands/${id}/outreach/analytics`} className="font-medium hover:text-primary">
          Analytics
        </Link>
        <Link href={`/brands/${id}/outreach/accounts`} className="font-medium hover:text-primary">
          Accounts
        </Link>
      </nav>
      {children}
    </div>
  );
}
