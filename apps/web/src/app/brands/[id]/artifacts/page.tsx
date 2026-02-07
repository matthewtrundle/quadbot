import { db } from '@/lib/db';
import { artifacts } from '@quadbot/db';
import { eq, desc } from 'drizzle-orm';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TitleVariantPicker } from '@/components/title-variant-picker';

export const dynamic = 'force-dynamic';

type ArtifactContent = {
  page_url?: string;
  variants?: Array<{
    title: string;
    rationale: string;
    predicted_ctr_lift: number;
  }>;
  descriptions?: Array<{
    description: string;
    includes_cta: boolean;
    target_intent: string;
  }>;
  brief?: {
    target_keyword: string;
    search_intent: string;
    recommended_word_count: number;
    outline: Array<{ heading: string; points: string[] }>;
    internal_link_opportunities: Array<{ anchor_text: string; target_url: string }>;
  };
};

export default async function ArtifactsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const allArtifacts = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.brand_id, id))
    .orderBy(desc(artifacts.created_at));

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'default';
      case 'deployed':
        return 'default';
      case 'archived':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'title_variant':
        return 'Title Tags';
      case 'meta_description':
        return 'Meta Descriptions';
      case 'content_brief':
        return 'Content Brief';
      case 'internal_links':
        return 'Internal Links';
      default:
        return type;
    }
  };

  // Group artifacts by type for better organization
  const groupedArtifacts = allArtifacts.reduce(
    (acc, artifact) => {
      const type = artifact.type;
      if (!acc[type]) acc[type] = [];
      acc[type].push(artifact);
      return acc;
    },
    {} as Record<string, typeof allArtifacts>,
  );

  if (allArtifacts.length === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">
              No artifacts yet. Content optimizations will appear here after the daily analysis runs.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {Object.entries(groupedArtifacts).map(([type, items]) => (
        <div key={type} className="space-y-4">
          <h2 className="text-xl font-semibold">{getTypeLabel(type)}</h2>

          <div className="grid gap-4">
            {items.map((artifact) => {
              const content = artifact.content as ArtifactContent;

              return (
                <Card key={artifact.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{artifact.title}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant={getStatusColor(artifact.status)}>{artifact.status}</Badge>
                        <Badge variant="outline">v{artifact.version}</Badge>
                      </div>
                    </div>
                    {content.page_url && (
                      <CardDescription className="truncate">{content.page_url}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    {type === 'title_variant' && content.variants && (
                      <TitleVariantPicker
                        artifactId={artifact.id}
                        variants={content.variants}
                        status={artifact.status}
                      />
                    )}

                    {type === 'meta_description' && content.descriptions && (
                      <div className="space-y-3">
                        {content.descriptions.map((desc, i) => (
                          <div key={i} className="rounded border p-3 space-y-1">
                            <p className="text-sm">{desc.description}</p>
                            <div className="flex gap-2">
                              <Badge variant="outline" className="text-xs">
                                {desc.target_intent}
                              </Badge>
                              {desc.includes_cta && (
                                <Badge variant="secondary" className="text-xs">
                                  Has CTA
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {type === 'content_brief' && content.brief && (
                      <div className="space-y-4">
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Keyword: </span>
                            <strong>{content.brief.target_keyword}</strong>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Intent: </span>
                            <Badge variant="outline">{content.brief.search_intent}</Badge>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Words: </span>
                            {content.brief.recommended_word_count}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium mb-2">Outline</h4>
                          <div className="space-y-2">
                            {content.brief.outline.map((section, i) => (
                              <div key={i} className="pl-4 border-l-2">
                                <p className="font-medium text-sm">{section.heading}</p>
                                <ul className="text-sm text-muted-foreground list-disc pl-4">
                                  {section.points.map((point, j) => (
                                    <li key={j}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </div>

                        {content.brief.internal_link_opportunities.length > 0 && (
                          <div>
                            <h4 className="text-sm font-medium mb-2">Internal Links</h4>
                            <div className="space-y-1">
                              {content.brief.internal_link_opportunities.map((link, i) => (
                                <div key={i} className="text-sm">
                                  <span className="text-muted-foreground">{link.anchor_text}</span>
                                  <span className="mx-2">→</span>
                                  <span className="text-primary">{link.target_url}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
