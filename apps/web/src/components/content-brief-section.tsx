import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type ContentBrief = {
  headline_options?: Array<{
    headline: string;
    platform?: string;
    hook_type?: string;
  }>;
  content_outline?: Array<{
    heading: string;
    key_points?: string[];
    word_count?: number;
  }>;
  platform_angles?: {
    blog?: Record<string, string>;
    social?: Record<string, string>;
    email?: Record<string, string>;
  };
  keywords?: Array<{
    keyword: string;
    priority?: 'primary' | 'secondary' | 'long_tail';
  }>;
  tone_guidance?: {
    recommended_tone?: string;
    voice_notes?: string;
    things_to_avoid?: string;
  };
  timeliness?: {
    urgency?: string;
    publish_window?: string;
    lifecycle_stage?: string;
  };
};

const keywordColors: Record<string, 'default' | 'secondary' | 'outline'> = {
  primary: 'default',
  secondary: 'secondary',
  long_tail: 'outline',
};

const urgencyColors: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
  immediate: 'destructive',
  high: 'destructive',
  urgent: 'warning',
  moderate: 'warning',
  medium: 'default',
  low: 'secondary',
};

export function ContentBriefSection({ brief }: { brief: ContentBrief }) {
  if (!brief || !brief.headline_options) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Content Brief</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Headlines */}
        {brief.headline_options && brief.headline_options.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Headlines</h4>
            <div className="space-y-2">
              {brief.headline_options.map((h, i) => (
                <div key={i} className="flex items-center gap-2 rounded-md border border-border/50 p-2">
                  <span className="text-sm flex-1">{h.headline}</span>
                  {h.platform && <Badge variant="outline" className="text-[10px]">{h.platform}</Badge>}
                  {h.hook_type && <Badge variant="secondary" className="text-[10px]">{h.hook_type}</Badge>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Content Outline */}
        {brief.content_outline && brief.content_outline.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Content Outline</h4>
            <div className="space-y-3">
              {brief.content_outline.map((section, i) => (
                <div key={i} className="border-l-2 border-primary/30 pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{section.heading}</span>
                    {section.word_count != null && (
                      <span className="text-[10px] text-muted-foreground">~{section.word_count} words</span>
                    )}
                  </div>
                  {section.key_points && section.key_points.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {section.key_points.map((point, j) => (
                        <li key={j} className="text-xs text-muted-foreground">
                          &bull; {point}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platform Angles */}
        {brief.platform_angles && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Platform Angles</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(['blog', 'social', 'email'] as const).map((platform) => {
                const angle = brief.platform_angles?.[platform];
                if (!angle) return null;
                return (
                  <div key={platform} className="rounded-md border border-border/50 p-3">
                    <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      {platform}
                    </h5>
                    {Object.entries(angle).map(([key, value]) => (
                      <div key={key} className="mb-1">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, ' ')}: </span>
                        <span className="text-xs">{value}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Keywords */}
        {brief.keywords && brief.keywords.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Keywords</h4>
            <div className="flex flex-wrap gap-1.5">
              {brief.keywords.map((kw, i) => (
                <Badge key={i} variant={keywordColors[kw.priority || 'secondary'] || 'outline'} className="text-xs">
                  {kw.keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Tone Guidance */}
        {brief.tone_guidance && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Tone Guidance</h4>
            <div className="space-y-1 text-sm">
              {brief.tone_guidance.recommended_tone && (
                <p><span className="text-muted-foreground">Tone:</span> {brief.tone_guidance.recommended_tone}</p>
              )}
              {brief.tone_guidance.voice_notes && (
                <p><span className="text-muted-foreground">Voice:</span> {brief.tone_guidance.voice_notes}</p>
              )}
              {brief.tone_guidance.things_to_avoid && (
                <p><span className="text-muted-foreground">Avoid:</span> {brief.tone_guidance.things_to_avoid}</p>
              )}
            </div>
          </div>
        )}

        {/* Timeliness */}
        {brief.timeliness && (
          <div>
            <h4 className="text-sm font-semibold mb-2">Timeliness</h4>
            <div className="flex items-center gap-3">
              {brief.timeliness.urgency && (
                <Badge variant={urgencyColors[brief.timeliness.urgency.toLowerCase()] || 'outline'}>
                  {brief.timeliness.urgency}
                </Badge>
              )}
              {brief.timeliness.publish_window && (
                <span className="text-xs text-muted-foreground">Window: {brief.timeliness.publish_window}</span>
              )}
              {brief.timeliness.lifecycle_stage && (
                <span className="text-xs text-muted-foreground">Stage: {brief.timeliness.lifecycle_stage}</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
