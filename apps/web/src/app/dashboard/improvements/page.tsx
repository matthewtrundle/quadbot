import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { improvementSuggestions, brands } from '@quadbot/db';
import { desc, eq, isNull, or } from 'drizzle-orm';
import { ImprovementCard } from '@/components/improvement-card';

export const dynamic = 'force-dynamic';

export default async function ImprovementsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);

  // Get all improvement suggestions ordered by priority and votes
  const suggestions = await db
    .select({
      id: improvementSuggestions.id,
      brand_id: improvementSuggestions.brand_id,
      category: improvementSuggestions.category,
      title: improvementSuggestions.title,
      description: improvementSuggestions.description,
      rationale: improvementSuggestions.rationale,
      expected_impact: improvementSuggestions.expected_impact,
      implementation_effort: improvementSuggestions.implementation_effort,
      priority: improvementSuggestions.priority,
      status: improvementSuggestions.status,
      votes: improvementSuggestions.votes,
      user_feedback: improvementSuggestions.user_feedback,
      context: improvementSuggestions.context,
      created_at: improvementSuggestions.created_at,
    })
    .from(improvementSuggestions)
    .where(!admin && userBrandId ? eq(improvementSuggestions.brand_id, userBrandId) : undefined)
    .orderBy(
      desc(improvementSuggestions.votes),
      desc(improvementSuggestions.priority),
      desc(improvementSuggestions.created_at),
    )
    .limit(50);

  // Group by status
  const pendingSuggestions = suggestions.filter((s) => s.status === 'pending');
  const approvedSuggestions = suggestions.filter((s) => s.status === 'approved');
  const dismissedSuggestions = suggestions.filter((s) => s.status === 'dismissed');
  const implementedSuggestions = suggestions.filter((s) => s.status === 'implemented');

  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortByPriority = (a: typeof suggestions[0], b: typeof suggestions[0]) =>
    (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 3) -
    (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 3);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold mb-2">System Self-Improvement</h2>
        <p className="text-muted-foreground">
          Quadbot analyzes its own capabilities and suggests improvements. Review, vote, and approve
          suggestions to guide system development.
        </p>
      </div>

      {pendingSuggestions.length > 0 && (
        <section>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-yellow-500 rounded-full" />
            Pending Review ({pendingSuggestions.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {pendingSuggestions.sort(sortByPriority).map((suggestion) => (
              <ImprovementCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        </section>
      )}

      {approvedSuggestions.length > 0 && (
        <section>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full" />
            Approved ({approvedSuggestions.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {approvedSuggestions.map((suggestion) => (
              <ImprovementCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        </section>
      )}

      {implementedSuggestions.length > 0 && (
        <section>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-blue-500 rounded-full" />
            Implemented ({implementedSuggestions.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {implementedSuggestions.map((suggestion) => (
              <ImprovementCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        </section>
      )}

      {dismissedSuggestions.length > 0 && (
        <section>
          <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
            <span className="w-2 h-2 bg-gray-400 rounded-full" />
            Dismissed ({dismissedSuggestions.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2 opacity-60">
            {dismissedSuggestions.map((suggestion) => (
              <ImprovementCard key={suggestion.id} suggestion={suggestion} />
            ))}
          </div>
        </section>
      )}

      {suggestions.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No improvement suggestions yet.</p>
          <p className="text-sm mt-1">
            The capability gap analyzer runs weekly and will identify opportunities for improvement.
          </p>
        </div>
      )}
    </div>
  );
}
