# UI Production Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bring the QuadBot web app UI/UX to production quality with active nav states, loading skeletons, toast notifications, error handling, responsive design, pagination, accessibility, and polished empty states.

**Architecture:** Component-first approach — create shared primitives (Skeleton, NavLink, EmptyState) then apply them across all pages. Use Next.js `loading.tsx` convention for page-level loading. Add sonner toasts to all client-side mutations. Fix responsive breakpoints across all grid layouts.

**Tech Stack:** Next.js 15 App Router, shadcn/ui, Tailwind CSS, sonner (toasts), lucide-react (icons)

---

### Task 1: Create Skeleton UI Component

**Files:**
- Create: `apps/web/src/components/ui/skeleton.tsx`

**Step 1: Create the Skeleton component**

```tsx
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
```

This is the standard shadcn/ui Skeleton component. Confirm `cn` utility exists at `apps/web/src/lib/utils.ts`.

**Step 2: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/web/src/components/ui/skeleton.tsx
git commit -m "feat: add Skeleton UI component"
```

---

### Task 2: Active Nav States + Mobile-Responsive Brand Navigation

**Files:**
- Create: `apps/web/src/components/brand-nav.tsx`
- Modify: `apps/web/src/app/brands/[id]/layout.tsx`

**Step 1: Create BrandNav client component**

Create `apps/web/src/components/brand-nav.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Inbox', segment: 'inbox' },
  { label: 'Actions', segment: 'actions' },
  { label: 'Artifacts', segment: 'artifacts' },
  { label: 'Outreach', segment: 'outreach' },
  { label: 'Playbooks', segment: 'playbooks' },
  { label: 'Executions', segment: 'executions' },
  { label: 'Evaluation', segment: 'evaluation' },
  { label: 'Settings', segment: 'settings' },
];

export function BrandNav({ brandId }: { brandId: string }) {
  const pathname = usePathname();

  return (
    <nav
      className="flex gap-1 border-b overflow-x-auto scrollbar-none -mx-1 px-1"
      aria-label="Brand navigation"
    >
      {NAV_ITEMS.map(({ label, segment }) => {
        const href = `/brands/${brandId}/${segment}`;
        const isActive = pathname === href || pathname.startsWith(`${href}/`);

        return (
          <Link
            key={segment}
            href={href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'shrink-0 px-3 py-2 text-sm font-medium transition-colors rounded-t-md border-b-2',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
```

**Step 2: Update brand layout to use BrandNav**

In `apps/web/src/app/brands/[id]/layout.tsx`:
- Replace the static `<nav>` block (lines 38-63) with `<BrandNav brandId={id} />`
- Add import: `import { BrandNav } from '@/components/brand-nav';`
- Remove the `Link` import (no longer used directly in this file)

The layout becomes:
```tsx
import { redirect } from 'next/navigation';
import { getSession, isAdmin } from '@/lib/auth-session';
import { db } from '@/lib/db';
import { brands } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { BrandNav } from '@/components/brand-nav';

export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const userBrandId = (session.user as any).brandId as string | null;
  const admin = isAdmin(session);
  const { id } = await params;
  const brand = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  if (brand.length === 0) notFound();
  const b = brand[0];
  if (!admin && userBrandId && userBrandId !== b.id) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <h1 className="text-3xl font-bold">{b.name}</h1>
        <Badge variant={b.mode === 'assist' ? 'default' : 'secondary'}>{b.mode}</Badge>
      </div>
      <BrandNav brandId={id} />
      {children}
    </div>
  );
}
```

**Step 3: Add scrollbar-none utility if not present**

Check `apps/web/src/app/globals.css` for a `scrollbar-none` utility. If missing, add to the end:
```css
@layer utilities {
  .scrollbar-none {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-none::-webkit-scrollbar {
    display: none;
  }
}
```

**Step 4: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 5: Commit**

```bash
git add apps/web/src/components/brand-nav.tsx apps/web/src/app/brands/[id]/layout.tsx apps/web/src/app/globals.css
git commit -m "feat: active nav states and mobile-responsive brand navigation"
```

---

### Task 3: Loading Skeletons for Brand Sub-Pages

**Files:**
- Create: `apps/web/src/app/brands/[id]/inbox/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/actions/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/evaluation/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/playbooks/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/settings/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/artifacts/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/outreach/loading.tsx`
- Create: `apps/web/src/app/brands/[id]/executions/loading.tsx`
- Create: `apps/web/src/app/dashboard/loading.tsx`
- Create: `apps/web/src/app/recommendations/[id]/loading.tsx`

**Step 1: Create shared loading skeleton patterns**

Each `loading.tsx` uses the Skeleton component. Example for Inbox (list pattern):

`apps/web/src/app/brands/[id]/inbox/loading.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function InboxLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-24" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-2/3" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}
```

For Actions (same list pattern) — reuse the same shape.

For Evaluation (stats grid + list pattern):

`apps/web/src/app/brands/[id]/evaluation/loading.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function EvaluationLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-28" />
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-lg border p-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-28 rounded-full" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
```

For Dashboard:

`apps/web/src/app/dashboard/loading.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-80 mt-2" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <div className="rounded-lg border p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
          <div className="rounded-lg border p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

For Recommendation Detail:

`apps/web/src/app/recommendations/[id]/loading.tsx`:
```tsx
import { Skeleton } from '@/components/ui/skeleton';

export default function RecommendationDetailLoading() {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Skeleton className="h-4 w-48" />
      <div className="space-y-3">
        <Skeleton className="h-8 w-3/4" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>
      <div className="rounded-lg border p-6 space-y-3">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      <div className="rounded-lg border p-6">
        <Skeleton className="h-5 w-16 mb-3" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-md border p-3 text-center space-y-2">
              <Skeleton className="h-3 w-16 mx-auto" />
              <Skeleton className="h-7 w-10 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

For remaining sub-pages (playbooks, settings, artifacts, outreach, executions) create simple list loading patterns following the inbox pattern but with the appropriate page title width.

**Step 2: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/web/src/app/brands/[id]/*/loading.tsx apps/web/src/app/dashboard/loading.tsx apps/web/src/app/recommendations/[id]/loading.tsx
git commit -m "feat: add loading skeletons for all pages"
```

---

### Task 4: Toast Notifications for Client-Side Operations

**Files:**
- Modify: `apps/web/src/components/recommendation-feedback.tsx`
- Modify: `apps/web/src/components/webhook-settings.tsx`
- Modify: `apps/web/src/components/recommendation-actions.tsx` (if it has mutation)

sonner is already configured in root layout. Import `toast` from `sonner` in each component.

**Step 4a: RecommendationFeedback — add toast + error handling**

In `apps/web/src/components/recommendation-feedback.tsx`:
- Add import: `import { toast } from 'sonner';`
- In the `submit` function (line 23-36), change the try/catch:

```tsx
const submit = async (selectedRating: FeedbackRating) => {
  setSubmitting(true);
  setRating(selectedRating);
  try {
    const res = await fetch(`/api/recommendations/${recId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, comment: comment || undefined }),
    });
    if (res.ok) {
      setSubmitted(true);
      toast.success('Feedback submitted');
    } else {
      toast.error('Failed to submit feedback');
    }
  } catch {
    toast.error('Failed to submit feedback');
  } finally {
    setSubmitting(false);
  }
};
```

- Add `aria-label` to the three feedback buttons (lines 59, 67, 75):
  - `aria-label="Helpful"` on thumbs up
  - `aria-label="Not helpful"` on thumbs down
  - `aria-label="Harmful or wrong"` on alert triangle

**Step 4b: WebhookSettings — add toast + delete confirmation + copy button**

In `apps/web/src/components/webhook-settings.tsx`:
- Add import: `import { toast } from 'sonner';`
- Add import: `import { Copy, Check } from 'lucide-react';` (for copy button icons)
- Add state: `const [copied, setCopied] = useState(false);`

Update `fetchWebhooks` error handling (line 47):
```tsx
} catch {
  toast.error('Failed to load webhooks');
}
```

Update `createWebhook` (line 54-78):
```tsx
async function createWebhook() {
  if (!newUrl) return;
  setCreating(true);
  setNewSecret(null);
  try {
    const res = await fetch('/api/webhooks/outgoing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand_id: brandId,
        url: newUrl,
        event_types: selectedEvents.length > 0 ? selectedEvents : undefined,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setNewSecret(data.secret);
      setNewUrl('');
      setSelectedEvents([]);
      fetchWebhooks();
      toast.success('Webhook created');
    } else {
      toast.error('Failed to create webhook');
    }
  } catch {
    toast.error('Failed to create webhook');
  } finally {
    setCreating(false);
  }
}
```

Update `deleteWebhook` (line 80-85) — add confirmation:
```tsx
async function deleteWebhook(id: string) {
  if (!confirm('Remove this webhook? This cannot be undone.')) return;
  try {
    const res = await fetch(`/api/webhooks/outgoing?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      setWebhooksList((prev) => prev.filter((wh) => wh.id !== id));
      toast.success('Webhook removed');
    } else {
      toast.error('Failed to remove webhook');
    }
  } catch {
    toast.error('Failed to remove webhook');
  }
}
```

Add copy-to-clipboard for the secret display. Replace the secret display section (lines 146-153) with:
```tsx
{newSecret && (
  <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-3 dark:border-yellow-700 dark:bg-yellow-950">
    <p className="text-xs font-medium text-yellow-800 dark:text-yellow-200 mb-1">
      Signing secret (shown once, save it now):
    </p>
    <div className="flex items-center gap-2">
      <code className="text-xs break-all flex-1">{newSecret}</code>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        onClick={() => {
          navigator.clipboard.writeText(newSecret);
          setCopied(true);
          toast.success('Secret copied to clipboard');
          setTimeout(() => setCopied(false), 2000);
        }}
        aria-label="Copy secret to clipboard"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </Button>
    </div>
  </div>
)}
```

Add `role="button"` and `tabIndex={0}` and `onKeyDown` to event toggle badges (lines 169-178):
```tsx
{AVAILABLE_EVENTS.map((event) => (
  <Badge
    key={event}
    variant={selectedEvents.includes(event) ? 'default' : 'outline'}
    className="text-[10px] cursor-pointer select-none"
    role="button"
    tabIndex={0}
    onClick={() => toggleEvent(event)}
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleEvent(event); } }}
    aria-pressed={selectedEvents.includes(event)}
  >
    {event}
  </Badge>
))}
```

**Step 4c: Check recommendation-actions.tsx for mutations**

Read `apps/web/src/components/recommendation-actions.tsx` — if it has fetch calls for approve/reject/dismiss, add toast notifications in the same pattern.

**Step 2: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/web/src/components/recommendation-feedback.tsx apps/web/src/components/webhook-settings.tsx apps/web/src/components/recommendation-actions.tsx
git commit -m "feat: add toast notifications, error handling, and delete confirmations"
```

---

### Task 5: Responsive Grid Fixes

**Files:**
- Modify: `apps/web/src/app/brands/[id]/evaluation/page.tsx:110`
- Modify: `apps/web/src/app/dashboard/page.tsx:105`
- Modify: `apps/web/src/app/recommendations/[id]/page.tsx:131,150`

**Step 1: Fix evaluation page grid**

In `apps/web/src/app/brands/[id]/evaluation/page.tsx` line 110:
- Change: `<div className="grid gap-4 md:grid-cols-4">`
- To: `<div className="grid gap-4 grid-cols-2 md:grid-cols-4">`

This gives 2-column on mobile, 4-column on desktop.

**Step 2: Fix dashboard grid**

In `apps/web/src/app/dashboard/page.tsx` line 105:
- Change: `<div className="grid gap-6 lg:grid-cols-3">`
- To: `<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">`

And line 106:
- Change: `<div className="lg:col-span-2 animate-fade-in-up"`
- To: `<div className="md:col-span-2 lg:col-span-2 animate-fade-in-up"`

Wait — if md is 2 cols, col-span-2 fills full width. At lg 3 cols, col-span-2 is correct. Actually: at md with 2 cols we want the priority queue to be full-width with sidebar below. So keep as-is but change to:
- `<div className="grid gap-6 md:grid-cols-3">` (3 cols from md)
- The rest stays at `md:col-span-2`

Actually the simplest fix: just add md breakpoint so it's not a single stacked column until lg:
- Change `lg:grid-cols-3` to `md:grid-cols-3`
- Change `lg:col-span-2` to `md:col-span-2`

**Step 3: Fix recommendation detail breadcrumb width**

In `apps/web/src/app/recommendations/[id]/page.tsx` line 131:
- Change: `<span className="text-foreground truncate max-w-[300px]">`
- To: `<span className="text-foreground truncate max-w-[200px] sm:max-w-[300px]">`

**Step 4: Fix recommendation detail effort badge**

In `apps/web/src/app/recommendations/[id]/page.tsx` line 150:
- Change: `className="uppercase text-[10px] tracking-wide"`
- To: `className="uppercase text-[11px] tracking-wide"`

**Step 5: Add prefers-reduced-motion to dashboard animations**

In `apps/web/src/app/globals.css`, update the `animate-fade-in-up` keyframe (if defined there) or add:
```css
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up {
    animation: none !important;
  }
}
```

If the animation is defined in `tailwind.config.ts`, check there. The `@media` rule in CSS is the simplest approach.

**Step 6: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 7: Commit**

```bash
git add apps/web/src/app/brands/[id]/evaluation/page.tsx apps/web/src/app/dashboard/page.tsx apps/web/src/app/recommendations/[id]/page.tsx apps/web/src/app/globals.css
git commit -m "fix: responsive grids and reduced-motion accessibility"
```

---

### Task 6: Improved Empty States

**Files:**
- Modify: `apps/web/src/components/recommendation-list.tsx:22-24`
- Modify: `apps/web/src/app/brands/[id]/evaluation/page.tsx:225-226`
- Modify: `apps/web/src/app/brands/[id]/playbooks/page.tsx:26-33`

**Step 1: Upgrade RecommendationList empty state**

In `apps/web/src/components/recommendation-list.tsx`, replace lines 22-24:

```tsx
if (recommendations.length === 0) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
      <div className="rounded-full bg-muted p-3 mb-3">
        <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
        </svg>
      </div>
      <p className="font-medium text-sm">No recommendations yet</p>
      <p className="text-sm text-muted-foreground mt-1">
        Recommendations will appear here once QuadBot analyzes your data sources.
      </p>
    </div>
  );
}
```

**Step 2: Upgrade evaluation empty states**

In `apps/web/src/app/brands/[id]/evaluation/page.tsx`, replace the empty state at line 226:

```tsx
<p className="text-sm text-muted-foreground">No evaluation runs yet.</p>
```

With:

```tsx
<div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
  <p className="font-medium text-sm">No evaluation runs yet</p>
  <p className="text-sm text-muted-foreground mt-1">
    Evaluation runs are created automatically after recommendations are reviewed.
  </p>
</div>
```

Apply the same pattern to the "No prompt performance data yet" empty state at line 268.

**Step 3: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/web/src/components/recommendation-list.tsx apps/web/src/app/brands/[id]/evaluation/page.tsx apps/web/src/app/brands/[id]/playbooks/page.tsx
git commit -m "feat: improved empty states with helpful context"
```

---

### Task 7: Pagination for Recommendation List

**Files:**
- Modify: `apps/web/src/components/recommendation-list.tsx`
- Modify: `apps/web/src/app/brands/[id]/inbox/page.tsx`

**Step 1: Add client-side pagination to RecommendationList**

Convert `recommendation-list.tsx` to support pagination. Since the data is server-fetched and passed in, do simple client-side pagination with a "Show more" pattern:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Recommendation = {
  id: string;
  source: string;
  priority: string;
  title: string;
  body: string;
  created_at: Date;
};

const PAGE_SIZE = 20;

const priorityColors: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  critical: 'destructive',
  high: 'destructive',
  medium: 'default',
  low: 'secondary',
};

export function RecommendationList({ recommendations }: { recommendations: Recommendation[] }) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (recommendations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-12 text-center">
        {/* empty state from Task 6 */}
      </div>
    );
  }

  const visible = recommendations.slice(0, visibleCount);
  const hasMore = visibleCount < recommendations.length;

  return (
    <div className="space-y-4">
      {visible.map((rec) => (
        <Link key={rec.id} href={`/recommendations/${rec.id}`} className="block">
          <Card className="hover:border-primary/30 transition-all">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{rec.title}</CardTitle>
                <div className="flex gap-2">
                  <Badge variant={priorityColors[rec.priority] || 'outline'}>{rec.priority}</Badge>
                  <Badge variant="outline">{rec.source}</Badge>
                </div>
              </div>
              <CardDescription>{new Date(rec.created_at).toLocaleString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground line-clamp-3">{rec.body.split('\n\n')[0]}</p>
            </CardContent>
          </Card>
        </Link>
      ))}
      {hasMore && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          >
            Show more ({recommendations.length - visibleCount} remaining)
          </Button>
        </div>
      )}
      {!hasMore && recommendations.length > PAGE_SIZE && (
        <p className="text-center text-xs text-muted-foreground">
          Showing all {recommendations.length} recommendations
        </p>
      )}
    </div>
  );
}
```

Note: This requires adding `'use client'` directive and `useState` import. The file was previously a server component.

**Step 2: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 3: Commit**

```bash
git add apps/web/src/components/recommendation-list.tsx
git commit -m "feat: add pagination to recommendation list"
```

---

### Task 8: Accessibility Fixes

**Files:**
- Modify: `apps/web/src/components/enriched-data-section.tsx` — table scope attributes
- Modify: `apps/web/src/components/webhook-settings.tsx` — already done in Task 4
- Modify: `apps/web/src/app/brands/[id]/evaluation/page.tsx` — source quality badges on mobile

**Step 1: Add table accessibility to enriched-data-section**

In `apps/web/src/components/enriched-data-section.tsx`, find all `<th>` elements and ensure they have `scope="col"`. Find table header rows and add:
- `<thead>` wrapper around header rows
- `<tbody>` wrapper around body rows
- `scope="col"` on all `<th>` elements

Also bump `text-[10px]` labels to `text-[11px]` across the file for readability.

**Step 2: Fix evaluation page badge overflow on mobile**

In `apps/web/src/app/brands/[id]/evaluation/page.tsx`, the source quality ranking and evaluation run cards have long rows of badges that overflow on mobile. Wrap the inner flex containers with `flex-wrap`:

Line 196: Change `<div className="flex items-center gap-4 text-sm">` to `<div className="flex items-center gap-2 md:gap-4 text-sm flex-wrap">`

Line 232: Same change.

Line 274: Same change.

**Step 3: Verify build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm --filter @quadbot/web build`
Expected: Clean build

**Step 4: Commit**

```bash
git add apps/web/src/components/enriched-data-section.tsx apps/web/src/app/brands/[id]/evaluation/page.tsx
git commit -m "fix: accessibility improvements and mobile overflow fixes"
```

---

### Task 9: Final Build Verification

**Step 1: Full monorepo build**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm build`
Expected: All packages build clean (shared, db, web, worker)

**Step 2: Run tests**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm test`
Expected: All 32 tests pass

**Step 3: Commit any remaining fixes**

If any build errors, fix and commit.

---

## Files Summary

| # | File | Action |
|---|------|--------|
| 1 | `apps/web/src/components/ui/skeleton.tsx` | Create |
| 2 | `apps/web/src/components/brand-nav.tsx` | Create |
| 3 | `apps/web/src/app/brands/[id]/layout.tsx` | Modify |
| 4 | `apps/web/src/app/globals.css` | Modify |
| 5 | `apps/web/src/app/brands/[id]/inbox/loading.tsx` | Create |
| 6 | `apps/web/src/app/brands/[id]/actions/loading.tsx` | Create |
| 7 | `apps/web/src/app/brands/[id]/evaluation/loading.tsx` | Create |
| 8 | `apps/web/src/app/brands/[id]/playbooks/loading.tsx` | Create |
| 9 | `apps/web/src/app/brands/[id]/settings/loading.tsx` | Create |
| 10 | `apps/web/src/app/brands/[id]/artifacts/loading.tsx` | Create |
| 11 | `apps/web/src/app/brands/[id]/outreach/loading.tsx` | Create |
| 12 | `apps/web/src/app/brands/[id]/executions/loading.tsx` | Create |
| 13 | `apps/web/src/app/dashboard/loading.tsx` | Create |
| 14 | `apps/web/src/app/recommendations/[id]/loading.tsx` | Create |
| 15 | `apps/web/src/components/recommendation-feedback.tsx` | Modify |
| 16 | `apps/web/src/components/webhook-settings.tsx` | Modify |
| 17 | `apps/web/src/components/recommendation-actions.tsx` | Modify |
| 18 | `apps/web/src/app/brands/[id]/evaluation/page.tsx` | Modify |
| 19 | `apps/web/src/app/dashboard/page.tsx` | Modify |
| 20 | `apps/web/src/app/recommendations/[id]/page.tsx` | Modify |
| 21 | `apps/web/src/components/recommendation-list.tsx` | Modify |
| 22 | `apps/web/src/components/enriched-data-section.tsx` | Modify |

## Verification

1. `pnpm build` — all packages compile clean
2. `pnpm test` — all tests pass
3. Manual check: navigate between brand sub-pages and confirm active tab highlights
4. Manual check: resize browser to mobile width and confirm nav scrolls horizontally, grids stack
5. Manual check: load any brand page and confirm skeleton appears during load
6. Manual check: submit feedback on a recommendation and confirm toast appears
7. Manual check: create/delete webhook and confirm toast + delete confirmation
