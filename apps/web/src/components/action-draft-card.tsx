'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

type ActionDraft = {
  id: string;
  type: string;
  risk: string;
  status: string;
  requires_approval: boolean;
  payload: Record<string, unknown>;
  created_at: Date;
};

const riskColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

const statusColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'outline',
  approved: 'default',
  rejected: 'destructive',
  executed_stub: 'secondary',
  executed: 'default',
};

const typeLabels: Record<string, string> = {
  create_content_plan: 'Create Content Plan',
  content_optimization: 'Content Optimization',
  technical_seo_audit: 'Technical SEO Audit',
  update_meta: 'Update Meta Tags',
  update_content: 'Update Content',
  flag_for_review: 'Flag for Review',
  'gsc-index-request': 'Request Indexing',
  'gsc-inspection': 'URL Inspection',
  'gsc-sitemap-notify': 'Ping Sitemap',
  general: 'General Action',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  executed_stub: 'No Automation Yet',
  executed: 'Executed',
};

/** Extract a human-readable summary from the payload */
function getPayloadSummary(type: string, payload: Record<string, unknown>): {
  title: string;
  description: string;
  details: { label: string; value: string }[];
  tasks: string[];
} {
  const p = payload;
  const title = (p.title as string) || (p.target_keyword as string) || (p.target_query as string) || (p.target_page as string) || '';
  const details: { label: string; value: string }[] = [];
  const tasks: string[] = [];
  let description = (p.rationale as string) || (p.description as string) || '';

  switch (type) {
    case 'create_content_plan': {
      if (p.content_type) details.push({ label: 'Format', value: String(p.content_type).replace('_', ' ') });
      if (p.target_keyword) details.push({ label: 'Keyword', value: String(p.target_keyword) });
      const seo = p.seo_strategy as Record<string, unknown> | undefined;
      if (seo?.content_length) details.push({ label: 'Length', value: String(seo.content_length) });
      if (seo?.target_position) details.push({ label: 'Target', value: String(seo.target_position) });
      const timeline = p.timeline as Record<string, string> | undefined;
      if (timeline?.publication_target) details.push({ label: 'Timeline', value: timeline.publication_target });
      const outline = p.content_outline as string[] | undefined;
      if (outline) outline.forEach((s) => tasks.push(s));
      break;
    }
    case 'content_optimization': {
      if (p.target_keyword) details.push({ label: 'Keyword', value: String(p.target_keyword) });
      if (p.current_position) details.push({ label: 'Current Pos', value: String(p.current_position) });
      if (p.goal_position) details.push({ label: 'Goal', value: `Top ${p.goal_position}` });
      if (p.timeline) details.push({ label: 'Timeline', value: String(p.timeline) });
      const sm = p.success_metrics as Record<string, string> | undefined;
      if (sm?.target_position) details.push({ label: 'Target Pos', value: sm.target_position });
      const optTasks = p.optimization_tasks as Array<{ task: string; description: string }> | undefined;
      if (optTasks) optTasks.forEach((t) => tasks.push(t.description));
      break;
    }
    case 'technical_seo_audit': {
      if (p.target_query) details.push({ label: 'Query', value: String(p.target_query) });
      if (p.current_position) details.push({ label: 'Current Pos', value: String(p.current_position) });
      if (p.previous_position) details.push({ label: 'Previous Pos', value: String(p.previous_position) });
      if (p.estimated_effort) details.push({ label: 'Effort', value: String(p.estimated_effort) });
      if (p.priority) details.push({ label: 'Priority', value: String(p.priority) });
      const checklist = p.audit_checklist as Array<{ category: string; tasks: string[] }> | undefined;
      if (checklist) {
        checklist.forEach((cat) => {
          cat.tasks.forEach((t) => tasks.push(t));
        });
      }
      break;
    }
    case 'update_meta': {
      if (p.target_page) details.push({ label: 'Page', value: String(p.target_page) });
      const cm = p.current_metrics as Record<string, string> | undefined;
      if (cm?.ctr) details.push({ label: 'Current CTR', value: cm.ctr });
      if (cm?.previous_ctr) details.push({ label: 'Previous CTR', value: cm.previous_ctr });
      if (p.success_metrics) details.push({ label: 'Goal', value: String(p.success_metrics) });
      if (p.timeline) details.push({ label: 'Timeline', value: String(p.timeline) });
      const actions = p.proposed_actions as Array<{ action: string; description: string }> | undefined;
      if (actions) actions.forEach((a) => tasks.push(a.description));
      break;
    }
    case 'flag_for_review': {
      description = (p.description as string) || '';
      if (p.priority) details.push({ label: 'Priority', value: String(p.priority) });
      const analysis = p.analysis as Record<string, unknown> | undefined;
      if (analysis) {
        const positive = analysis.positive_trends as string[] | undefined;
        const concerning = analysis.concerning_trends as string[] | undefined;
        if (positive) positive.forEach((t) => tasks.push(`+ ${t}`));
        if (concerning) concerning.forEach((t) => tasks.push(`- ${t}`));
      }
      break;
    }
    default: {
      // Generic: show top-level string/number fields
      for (const [k, v] of Object.entries(p)) {
        if (typeof v === 'string' || typeof v === 'number') {
          details.push({ label: k.replace(/_/g, ' '), value: String(v) });
        }
      }
    }
  }

  return { title, description, details, tasks };
}

export function ActionDraftCard({ draft }: { draft: ActionDraft }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { title, description, details, tasks } = getPayloadSummary(draft.type, draft.payload);
  const label = typeLabels[draft.type] || draft.type.replace(/_/g, ' ');

  async function handleAction(action: 'approve' | 'reject') {
    setLoading(true);
    try {
      await fetch(`/api/actions/${draft.id}/${action}`, { method: 'POST' });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className={draft.status === 'rejected' ? 'opacity-60' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{label}</CardTitle>
            {title && (
              <p className="mt-1 text-sm text-muted-foreground truncate">{title}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant={riskColors[draft.risk] || 'outline'}>
              {draft.risk}
            </Badge>
            <Badge variant={statusColors[draft.status] || 'outline'}>
              {statusLabels[draft.status] || draft.status}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {description && (
          <p className="text-sm text-foreground/80">{description}</p>
        )}

        {details.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
            {details.map((d, i) => (
              <div key={i}>
                <p className="text-xs text-muted-foreground capitalize">{d.label}</p>
                <p className="text-sm font-medium">{d.value}</p>
              </div>
            ))}
          </div>
        )}

        {tasks.length > 0 && (
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {tasks.length} {tasks.length === 1 ? 'step' : 'steps'}
            </button>
            {expanded && (
              <ul className="mt-2 space-y-1 text-sm text-foreground/80">
                {tasks.map((t, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">{t.startsWith('+') || t.startsWith('-') ? t[0] : `${i + 1}.`}</span>
                    <span>{t.startsWith('+') || t.startsWith('-') ? t.slice(2) : t}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {new Date(draft.created_at).toLocaleString()}
        </p>
      </CardContent>
      {draft.status === 'pending' && (
        <CardFooter className="gap-2 pt-0">
          <Button size="sm" onClick={() => handleAction('approve')} disabled={loading}>
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={() => handleAction('reject')} disabled={loading}>
            Reject
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
