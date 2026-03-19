import { db } from '@/lib/db';
import { artifacts } from '@quadbot/db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

type GeneratedContent = {
  title?: string;
  slug?: string;
  content_markdown?: string;
  excerpt?: string;
  tags?: string[];
  estimated_read_time_minutes?: number;
  source_brief_id?: string;
  platform?: string;
  generated_at?: string;
  seo_keywords?: Array<{ keyword: string; usage_count: number }>;
};

export default async function ContentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Fetch content briefs without generated children
  const readyToWrite = await db
    .select()
    .from(artifacts)
    .where(
      and(
        eq(artifacts.brand_id, id),
        eq(artifacts.type, 'trend_content_brief'),
        sql`NOT EXISTS (
          SELECT 1 FROM artifacts child
          WHERE child.parent_artifact_id = ${artifacts.id}
          AND child.type = 'generated_content'
        )`,
      ),
    )
    .orderBy(desc(artifacts.created_at));

  // Fetch draft generated content
  const drafts = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.brand_id, id), eq(artifacts.type, 'generated_content'), eq(artifacts.status, 'draft')))
    .orderBy(desc(artifacts.created_at));

  // Fetch published content
  const published = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.brand_id, id), eq(artifacts.type, 'generated_content'), eq(artifacts.status, 'published')))
    .orderBy(desc(artifacts.created_at));

  const isEmpty = readyToWrite.length === 0 && drafts.length === 0 && published.length === 0;

  if (isEmpty) {
    return (
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">Content Pipeline</h2>
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
          <div className="rounded-full bg-muted p-3 mb-3">
            <svg
              className="h-6 w-6 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
              />
            </svg>
          </div>
          <p className="font-medium text-sm">No content in the pipeline</p>
          <p className="text-sm text-muted-foreground mt-1">
            Content briefs from trend scans will appear here. Run a trend scan to generate briefs, then use the content
            automation job to write posts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Content Pipeline</h2>

      {/* Ready to Write */}
      {readyToWrite.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Ready to Write</h3>
            <Badge variant="outline">{readyToWrite.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {readyToWrite.map((brief) => {
              const content = brief.content as Record<string, unknown>;
              const timeliness = content.timeliness as Record<string, string> | undefined;
              const headlines = content.headline_options as Array<{ headline: string; platform: string }> | undefined;

              return (
                <Card key={brief.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{brief.title}</CardTitle>
                      <div className="flex gap-2">
                        {timeliness?.urgency && (
                          <Badge variant={timeliness.urgency === 'immediate' ? 'destructive' : 'secondary'}>
                            {timeliness.urgency}
                          </Badge>
                        )}
                        <Badge variant="outline">Brief</Badge>
                      </div>
                    </div>
                    <CardDescription>Created {new Date(brief.created_at).toLocaleDateString()}</CardDescription>
                  </CardHeader>
                  {headlines && headlines.length > 0 && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Suggested headline: {headlines[0].headline}</p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Drafts</h3>
            <Badge variant="default">{drafts.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {drafts.map((draft) => {
              const content = draft.content as GeneratedContent;
              const wordCount = content.content_markdown ? content.content_markdown.split(/\s+/).length : 0;

              return (
                <Card key={draft.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{draft.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="default">Draft</Badge>
                        {content.platform && <Badge variant="outline">{content.platform}</Badge>}
                      </div>
                    </div>
                    <CardDescription>
                      {wordCount.toLocaleString()} words
                      {content.estimated_read_time_minutes && ` · ${content.estimated_read_time_minutes} min read`}
                      {content.generated_at && ` · Generated ${new Date(content.generated_at).toLocaleDateString()}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {content.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{content.excerpt}</p>}
                    <div className="flex flex-wrap gap-1">
                      {content.tags?.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    {content.seo_keywords && content.seo_keywords.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Keywords: {content.seo_keywords.map((k) => k.keyword).join(', ')}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Published */}
      {published.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium">Published</h3>
            <Badge variant="secondary">{published.length}</Badge>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {published.map((pub) => {
              const content = pub.content as GeneratedContent;
              const wordCount = content.content_markdown ? content.content_markdown.split(/\s+/).length : 0;

              return (
                <Card key={pub.id} className="border-border/50">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{pub.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="secondary">Published</Badge>
                        {content.slug && (
                          <Badge variant="outline" className="text-xs font-mono">
                            /{content.slug}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <CardDescription>
                      {wordCount.toLocaleString()} words
                      {content.estimated_read_time_minutes && ` · ${content.estimated_read_time_minutes} min read`}·
                      Published {new Date(pub.updated_at).toLocaleDateString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {content.excerpt && <p className="text-sm text-muted-foreground line-clamp-2">{content.excerpt}</p>}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
