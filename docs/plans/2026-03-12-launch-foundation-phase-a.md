# Phase A: Launch Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the SaaS wrapper around QuadBot's AI engine — billing, onboarding, ROI dashboard, data export, rate limiting, error recovery, and legal pages — to enable first-dollar revenue.

**Architecture:** Seven independent workstreams that collectively transform QuadBot from an internal tool into a launchable SaaS product. Stripe handles billing with webhook-driven subscription lifecycle. Onboarding is a multi-step wizard that replaces the GSC-only import flow. ROI dashboard aggregates existing metric_snapshots/outcomes/action_executions data. CSV export adds download endpoints. Rate limiting extends existing Upstash infrastructure to job-level throttling. Error recovery adds integration health monitoring. Legal pages are static content with cookie consent.

**Tech Stack:** Next.js 15, Drizzle ORM, PostgreSQL, Stripe SDK, Upstash Redis, better-auth, Tailwind CSS 4, Radix UI, Recharts, PapaParse

---

## Task 1: Stripe Billing — Database Schema

**Files:**

- Modify: `packages/db/src/schema.ts` (append new tables)
- Create: `packages/db/migrations/0020_billing_tables.sql`

**Step 1: Add billing enums and tables to schema**

Add to `packages/db/src/schema.ts` after the `competitorSnapshots` table:

```typescript
// === Billing & Subscriptions ===

export const planTierEnum = pgEnum('plan_tier', ['free', 'starter', 'pro', 'agency']);
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
]);

export const plans = pgTable('plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  tier: planTierEnum('tier').notNull().unique(),
  name: varchar('name', { length: 100 }).notNull(),
  stripe_price_id_monthly: varchar('stripe_price_id_monthly', { length: 255 }),
  stripe_price_id_yearly: varchar('stripe_price_id_yearly', { length: 255 }),
  price_monthly_cents: integer('price_monthly_cents').notNull(),
  price_yearly_cents: integer('price_yearly_cents').notNull(),
  max_brands: integer('max_brands').notNull().default(1),
  max_jobs_per_day: integer('max_jobs_per_day').notNull().default(50),
  max_recommendations_per_month: integer('max_recommendations_per_month').notNull().default(100),
  max_ai_spend_cents_per_month: integer('max_ai_spend_cents_per_month').notNull().default(500),
  features: jsonb('features').$type<string[]>().default([]),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    stripe_customer_id: varchar('stripe_customer_id', { length: 255 }).notNull(),
    stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }),
    status: subscriptionStatusEnum('status').notNull().default('trialing'),
    current_period_start: timestamp('current_period_start', { withTimezone: true }),
    current_period_end: timestamp('current_period_end', { withTimezone: true }),
    cancel_at_period_end: boolean('cancel_at_period_end').default(false).notNull(),
    trial_end: timestamp('trial_end', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('idx_subscriptions_user').on(table.user_id),
    index('idx_subscriptions_stripe_customer').on(table.stripe_customer_id),
    index('idx_subscriptions_stripe_sub').on(table.stripe_subscription_id),
  ],
);

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    period_start: timestamp('period_start', { withTimezone: true }).notNull(),
    period_end: timestamp('period_end', { withTimezone: true }).notNull(),
    jobs_count: integer('jobs_count').default(0).notNull(),
    recommendations_count: integer('recommendations_count').default(0).notNull(),
    ai_spend_cents: integer('ai_spend_cents').default(0).notNull(),
    brands_count: integer('brands_count').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_usage_records_user_period').on(table.user_id, table.period_start)],
);
```

**Step 2: Generate the migration**

Run: `cd /Users/matthewrundle/Documents/quadbot && pnpm drizzle-kit generate`
Expected: New migration file created in `packages/db/migrations/`

**Step 3: Run the migration**

Run: `pnpm turbo db:migrate`
Expected: Migration applied successfully

**Step 4: Commit**

```bash
git add packages/db/src/schema.ts packages/db/migrations/
git commit -m "feat: add billing tables (plans, subscriptions, usage_records)"
```

---

## Task 2: Stripe Billing — Server-Side Integration

**Files:**

- Create: `apps/web/src/lib/stripe.ts`
- Create: `apps/web/src/lib/plans.ts`
- Modify: `apps/web/package.json` (add stripe dependency)

**Step 1: Install Stripe SDK**

Run: `cd /Users/matthewrundle/Documents/quadbot/apps/web && pnpm add stripe`

**Step 2: Create Stripe client**

Create `apps/web/src/lib/stripe.ts`:

```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-01-27.acacia',
  typescript: true,
});

export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
```

**Step 3: Create plan helpers**

Create `apps/web/src/lib/plans.ts`:

```typescript
import { db } from './db';
import { plans, subscriptions, usageRecords } from '@quadbot/db';
import { eq, and, gte, lte } from 'drizzle-orm';

export type PlanLimits = {
  maxBrands: number;
  maxJobsPerDay: number;
  maxRecommendationsPerMonth: number;
  maxAiSpendCentsPerMonth: number;
  features: string[];
};

const FREE_LIMITS: PlanLimits = {
  maxBrands: 1,
  maxJobsPerDay: 10,
  maxRecommendationsPerMonth: 25,
  maxAiSpendCentsPerMonth: 0,
  features: ['basic_seo'],
};

export async function getUserPlanLimits(userId: string): Promise<PlanLimits> {
  const sub = await db
    .select({
      status: subscriptions.status,
      max_brands: plans.max_brands,
      max_jobs_per_day: plans.max_jobs_per_day,
      max_recommendations_per_month: plans.max_recommendations_per_month,
      max_ai_spend_cents_per_month: plans.max_ai_spend_cents_per_month,
      features: plans.features,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.plan_id, plans.id))
    .where(eq(subscriptions.user_id, userId))
    .limit(1);

  if (!sub.length || !['active', 'trialing'].includes(sub[0].status)) {
    return FREE_LIMITS;
  }

  const plan = sub[0];
  return {
    maxBrands: plan.max_brands,
    maxJobsPerDay: plan.max_jobs_per_day,
    maxRecommendationsPerMonth: plan.max_recommendations_per_month,
    maxAiSpendCentsPerMonth: plan.max_ai_spend_cents_per_month,
    features: (plan.features as string[]) || [],
  };
}

export async function getCurrentUsage(userId: string) {
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const records = await db
    .select()
    .from(usageRecords)
    .where(
      and(
        eq(usageRecords.user_id, userId),
        gte(usageRecords.period_start, periodStart),
        lte(usageRecords.period_end, periodEnd),
      ),
    )
    .limit(1);

  return (
    records[0] || {
      jobs_count: 0,
      recommendations_count: 0,
      ai_spend_cents: 0,
      brands_count: 0,
    }
  );
}

export async function checkPlanLimit(
  userId: string,
  resource: 'brands' | 'jobs' | 'recommendations',
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const [limits, usage] = await Promise.all([getUserPlanLimits(userId), getCurrentUsage(userId)]);

  switch (resource) {
    case 'brands':
      return { allowed: usage.brands_count < limits.maxBrands, current: usage.brands_count, limit: limits.maxBrands };
    case 'jobs':
      return {
        allowed: usage.jobs_count < limits.maxJobsPerDay,
        current: usage.jobs_count,
        limit: limits.maxJobsPerDay,
      };
    case 'recommendations':
      return {
        allowed: usage.recommendations_count < limits.maxRecommendationsPerMonth,
        current: usage.recommendations_count,
        limit: limits.maxRecommendationsPerMonth,
      };
  }
}
```

**Step 4: Add env vars to .env.example**

Append to `.env.example`:

```
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

**Step 5: Commit**

```bash
git add apps/web/src/lib/stripe.ts apps/web/src/lib/plans.ts apps/web/package.json apps/web/pnpm-lock.yaml .env.example
git commit -m "feat: add Stripe client and plan limit helpers"
```

---

## Task 3: Stripe Billing — Webhook Handler

**Files:**

- Create: `apps/web/src/app/api/webhooks/stripe/route.ts`
- Modify: `apps/web/middleware.ts` (add to PUBLIC_PATHS)

**Step 1: Add Stripe webhook path to public paths in middleware**

In `apps/web/middleware.ts`, add `'/api/webhooks/stripe'` to `PUBLIC_PATHS` array.

**Step 2: Create webhook route**

Create `apps/web/src/app/api/webhooks/stripe/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_WEBHOOK_SECRET } from '@/lib/stripe';
import { db } from '@/lib/db';
import { subscriptions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import type Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionUpdate(sub);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await handleSubscriptionDeleted(sub);
      break;
    }
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      console.warn('Payment failed for customer:', invoice.customer);
      break;
    }
  }

  return NextResponse.json({ received: true });
}

async function handleSubscriptionUpdate(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;

  await db
    .update(subscriptions)
    .set({
      status: mapStripeStatus(sub.status),
      stripe_subscription_id: sub.id,
      current_period_start: new Date(sub.current_period_start * 1000),
      current_period_end: new Date(sub.current_period_end * 1000),
      cancel_at_period_end: sub.cancel_at_period_end,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
      updated_at: new Date(),
    })
    .where(eq(subscriptions.stripe_customer_id, customerId));
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  const customerId = sub.customer as string;
  await db
    .update(subscriptions)
    .set({ status: 'canceled', updated_at: new Date() })
    .where(eq(subscriptions.stripe_customer_id, customerId));
}

function mapStripeStatus(
  status: Stripe.Subscription.Status,
): 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' {
  const map: Record<string, 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete'> = {
    trialing: 'trialing',
    active: 'active',
    past_due: 'past_due',
    canceled: 'canceled',
    unpaid: 'unpaid',
    incomplete: 'incomplete',
    incomplete_expired: 'canceled',
    paused: 'canceled',
  };
  return map[status] || 'incomplete';
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/api/webhooks/stripe/ apps/web/middleware.ts
git commit -m "feat: add Stripe webhook handler for subscription lifecycle"
```

---

## Task 4: Stripe Billing — Checkout & Portal API Routes

**Files:**

- Create: `apps/web/src/app/api/billing/checkout/route.ts`
- Create: `apps/web/src/app/api/billing/portal/route.ts`
- Create: `apps/web/src/app/api/billing/status/route.ts`

**Step 1: Create checkout session route**

Create `apps/web/src/app/api/billing/checkout/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { plans, subscriptions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { requireSession, type UserWithBrand } from '@/lib/auth-session';

export async function POST(req: NextRequest) {
  const session = await requireSession();
  const userId = session.user.id;
  const { priceId } = await req.json();

  if (!priceId) {
    return NextResponse.json({ error: 'priceId is required' }, { status: 400 });
  }

  // Check if user already has a subscription with a Stripe customer
  const existing = await db
    .select({ stripe_customer_id: subscriptions.stripe_customer_id })
    .from(subscriptions)
    .where(eq(subscriptions.user_id, userId))
    .limit(1);

  let customerId = existing[0]?.stripe_customer_id;

  if (!customerId) {
    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: session.user.email,
      name: session.user.name || undefined,
      metadata: { userId },
    });
    customerId = customer.id;
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?billing=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing?canceled=true`,
    subscription_data: {
      trial_period_days: 14,
      metadata: { userId },
    },
    metadata: { userId },
  });

  // Upsert subscription record with the Stripe customer ID
  const plan = await db.select().from(plans).where(eq(plans.stripe_price_id_monthly, priceId)).limit(1);

  if (!existing.length && plan.length) {
    await db.insert(subscriptions).values({
      user_id: userId,
      plan_id: plan[0].id,
      stripe_customer_id: customerId,
      status: 'incomplete',
    });
  }

  return NextResponse.json({ url: checkoutSession.url });
}
```

**Step 2: Create billing portal route**

Create `apps/web/src/app/api/billing/portal/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { db } from '@/lib/db';
import { subscriptions } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth-session';

export async function POST() {
  const session = await requireSession();

  const sub = await db
    .select({ stripe_customer_id: subscriptions.stripe_customer_id })
    .from(subscriptions)
    .where(eq(subscriptions.user_id, session.user.id))
    .limit(1);

  if (!sub.length) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 404 });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: sub[0].stripe_customer_id,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/billing`,
  });

  return NextResponse.json({ url: portalSession.url });
}
```

**Step 3: Create billing status route**

Create `apps/web/src/app/api/billing/status/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { subscriptions, plans } from '@quadbot/db';
import { eq } from 'drizzle-orm';
import { requireSession } from '@/lib/auth-session';
import { getCurrentUsage, getUserPlanLimits } from '@/lib/plans';

export async function GET() {
  const session = await requireSession();
  const userId = session.user.id;

  const sub = await db
    .select({
      status: subscriptions.status,
      current_period_end: subscriptions.current_period_end,
      cancel_at_period_end: subscriptions.cancel_at_period_end,
      trial_end: subscriptions.trial_end,
      plan_name: plans.name,
      plan_tier: plans.tier,
      price_monthly_cents: plans.price_monthly_cents,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(subscriptions.plan_id, plans.id))
    .where(eq(subscriptions.user_id, userId))
    .limit(1);

  const [limits, usage] = await Promise.all([getUserPlanLimits(userId), getCurrentUsage(userId)]);

  return NextResponse.json({
    subscription: sub[0] || null,
    limits,
    usage,
  });
}
```

**Step 4: Commit**

```bash
git add apps/web/src/app/api/billing/
git commit -m "feat: add billing API routes (checkout, portal, status)"
```

---

## Task 5: Stripe Billing — Billing Page UI

**Files:**

- Create: `apps/web/src/app/billing/page.tsx`

**Step 1: Create billing page**

Create `apps/web/src/app/billing/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check } from 'lucide-react';

type PlanInfo = {
  tier: string;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  stripePriceId: string;
  features: string[];
  limits: {
    brands: number;
    jobsPerDay: number;
    recommendationsPerMonth: number;
  };
};

const PLANS: PlanInfo[] = [
  {
    tier: 'free',
    name: 'Free',
    priceMonthly: 0,
    priceYearly: 0,
    stripePriceId: '',
    features: ['1 brand', 'Basic SEO insights', '10 jobs/day', '25 recommendations/mo'],
    limits: { brands: 1, jobsPerDay: 10, recommendationsPerMonth: 25 },
  },
  {
    tier: 'starter',
    name: 'Starter',
    priceMonthly: 49,
    priceYearly: 470,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_STARTER_PRICE_ID || '',
    features: [
      '3 brands',
      'Full SEO + content',
      '100 jobs/day',
      '500 recommendations/mo',
      'CSV export',
      'Email digest',
    ],
    limits: { brands: 3, jobsPerDay: 100, recommendationsPerMonth: 500 },
  },
  {
    tier: 'pro',
    name: 'Pro',
    priceMonthly: 149,
    priceYearly: 1430,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '',
    features: [
      '10 brands',
      'All integrations',
      '500 jobs/day',
      'Unlimited recommendations',
      'Priority support',
      'API access',
    ],
    limits: { brands: 10, jobsPerDay: 500, recommendationsPerMonth: 99999 },
  },
  {
    tier: 'agency',
    name: 'Agency',
    priceMonthly: 399,
    priceYearly: 3830,
    stripePriceId: process.env.NEXT_PUBLIC_STRIPE_AGENCY_PRICE_ID || '',
    features: [
      '50 brands',
      'White-label reports',
      'Unlimited everything',
      'Dedicated support',
      'Custom integrations',
      'Team management',
    ],
    limits: { brands: 50, jobsPerDay: 99999, recommendationsPerMonth: 99999 },
  },
];

type BillingStatus = {
  subscription: {
    status: string;
    plan_name: string;
    plan_tier: string;
    price_monthly_cents: number;
    current_period_end: string;
    cancel_at_period_end: boolean;
    trial_end: string | null;
  } | null;
  limits: Record<string, number>;
  usage: Record<string, number>;
};

export default function BillingPage() {
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/billing/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleCheckout = async (priceId: string) => {
    setCheckoutLoading(priceId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId }),
      });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Checkout error:', err);
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch (err) {
      console.error('Portal error:', err);
    }
  };

  const currentTier = status?.subscription?.plan_tier || 'free';

  return (
    <div className="mx-auto max-w-5xl space-y-8 py-8">
      <div>
        <h1 className="text-3xl font-bold">Plans & Billing</h1>
        <p className="mt-2 text-muted-foreground">
          Choose the plan that fits your needs. All plans include a 14-day free trial.
        </p>
      </div>

      {status?.subscription && (
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-lg font-semibold">{status.subscription.plan_name}</p>
              <p className="text-sm text-muted-foreground">
                Status:{' '}
                <Badge variant={status.subscription.status === 'active' ? 'default' : 'secondary'}>
                  {status.subscription.status}
                </Badge>
                {status.subscription.cancel_at_period_end && (
                  <span className="ml-2 text-yellow-600">Cancels at period end</span>
                )}
              </p>
              {status.subscription.current_period_end && (
                <p className="text-sm text-muted-foreground">
                  Renews: {new Date(status.subscription.current_period_end).toLocaleDateString()}
                </p>
              )}
            </div>
            <Button variant="outline" onClick={handlePortal}>
              Manage Subscription
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <Card key={plan.tier} className={plan.tier === currentTier ? 'border-primary ring-2 ring-primary' : ''}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>
                {plan.priceMonthly === 0 ? (
                  <span className="text-2xl font-bold">Free</span>
                ) : (
                  <>
                    <span className="text-2xl font-bold">${plan.priceMonthly}</span>
                    <span className="text-muted-foreground">/mo</span>
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.tier === currentTier ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : plan.tier === 'free' ? (
                <Button variant="outline" className="w-full" disabled>
                  Free Forever
                </Button>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => handleCheckout(plan.stripePriceId)}
                  disabled={!!checkoutLoading || !plan.stripePriceId}
                >
                  {checkoutLoading === plan.stripePriceId ? 'Redirecting...' : 'Start Free Trial'}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Add billing link to navigation**

In `apps/web/src/components/nav.tsx`, add a "Billing" link pointing to `/billing`.

**Step 3: Commit**

```bash
git add apps/web/src/app/billing/ apps/web/src/components/nav.tsx
git commit -m "feat: add billing page with plan tiers and checkout flow"
```

---

## Task 6: Plan Enforcement Middleware

**Files:**

- Create: `apps/web/src/lib/plan-guard.ts`
- Modify: `apps/web/src/app/api/jobs/enqueue/route.ts` (add plan check)
- Modify: `apps/web/src/app/api/brands/route.ts` (add plan check on POST)

**Step 1: Create plan guard utility**

Create `apps/web/src/lib/plan-guard.ts`:

```typescript
import { NextResponse } from 'next/server';
import { checkPlanLimit } from './plans';

export async function enforcePlanLimit(
  userId: string,
  resource: 'brands' | 'jobs' | 'recommendations',
): Promise<NextResponse | null> {
  const { allowed, current, limit } = await checkPlanLimit(userId, resource);
  if (!allowed) {
    return NextResponse.json(
      {
        error: 'Plan limit reached',
        resource,
        current,
        limit,
        upgradeUrl: '/billing',
      },
      { status: 403 },
    );
  }
  return null;
}
```

**Step 2: Add plan check to job enqueue**

In `apps/web/src/app/api/jobs/enqueue/route.ts`, at the start of the POST handler after auth, add:

```typescript
import { enforcePlanLimit } from '@/lib/plan-guard';

// After requireSession():
const planBlock = await enforcePlanLimit(session.user.id, 'jobs');
if (planBlock) return planBlock;
```

**Step 3: Add plan check to brand creation**

In `apps/web/src/app/api/brands/route.ts`, at the start of the POST handler after auth, add the same pattern for `'brands'`.

**Step 4: Commit**

```bash
git add apps/web/src/lib/plan-guard.ts apps/web/src/app/api/jobs/enqueue/route.ts apps/web/src/app/api/brands/route.ts
git commit -m "feat: add plan limit enforcement for jobs and brands"
```

---

## Task 7: Onboarding Wizard — Multi-Step Flow

**Files:**

- Create: `apps/web/src/app/onboarding/page.tsx`
- Create: `apps/web/src/app/onboarding/layout.tsx`
- Create: `apps/web/src/components/onboarding-wizard.tsx`

**Step 1: Create onboarding layout**

Create `apps/web/src/app/onboarding/layout.tsx`:

```tsx
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}
```

**Step 2: Create onboarding wizard component**

Create `apps/web/src/components/onboarding-wizard.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

type Step = 'welcome' | 'connect' | 'industry' | 'autonomy' | 'scanning';

const INDUSTRIES = [
  'E-commerce',
  'SaaS',
  'Local Business',
  'Restaurant / Food',
  'Professional Services',
  'Healthcare',
  'Real Estate',
  'Education',
  'Non-profit',
  'Media / Publishing',
  'Other',
];

const AUTONOMY_LEVELS = [
  { value: 'observe', label: 'Observe Only', description: 'Get recommendations but take no actions automatically' },
  { value: 'assist', label: 'Assist Mode', description: 'QuadBot drafts actions for your approval before executing' },
];

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('welcome');
  const [industry, setIndustry] = useState('');
  const [autonomy, setAutonomy] = useState('observe');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = ['welcome', 'connect', 'industry', 'autonomy', 'scanning'].indexOf(step);
  const totalSteps = 5;

  const handleConnectGoogle = () => {
    // Redirect to existing GSC import OAuth flow
    window.location.href =
      '/api/oauth/google/import?scopes=' +
      encodeURIComponent(
        [
          'https://www.googleapis.com/auth/webmasters.readonly',
          'https://www.googleapis.com/auth/analytics.readonly',
          'https://www.googleapis.com/auth/userinfo.email',
        ].join(' '),
      ) +
      '&integrations=gsc,analytics&returnTo=/onboarding';
  };

  const handleStartScan = async () => {
    if (!brandId) return;
    setScanning(true);
    setError(null);

    try {
      // Update brand with industry and autonomy settings
      await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          industry,
          mode: autonomy,
        }),
      });

      // Trigger initial scans
      const jobTypes = ['brand_profiler', 'gsc_daily_digest'];
      await Promise.all(
        jobTypes.map((type) =>
          fetch('/api/jobs/enqueue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandId, type }),
          }),
        ),
      );

      setStep('scanning');
      // After a brief delay, redirect to dashboard
      setTimeout(() => router.push('/dashboard'), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
      setScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="flex items-center gap-2">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-2 flex-1 rounded-full transition-colors ${i <= stepIndex ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </div>

      {step === 'welcome' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Welcome to QuadBot</CardTitle>
            <CardDescription>
              Let&apos;s set up your brand in under 5 minutes. We&apos;ll connect your data sources and run an initial
              analysis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setStep('connect')} className="w-full" size="lg">
              Get Started
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'connect' && (
        <Card>
          <CardHeader>
            <CardTitle>Connect Google Services</CardTitle>
            <CardDescription>
              Link your Google Search Console and Analytics for intelligent SEO insights.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={handleConnectGoogle} className="w-full" size="lg">
              Connect Google Account
            </Button>
            <Button variant="ghost" onClick={() => setStep('industry')} className="w-full">
              Skip for now
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'industry' && (
        <Card>
          <CardHeader>
            <CardTitle>What&apos;s your industry?</CardTitle>
            <CardDescription>This helps QuadBot tailor recommendations and benchmarks to your sector.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((ind) => (
                <Badge
                  key={ind}
                  variant={industry === ind ? 'default' : 'outline'}
                  className="cursor-pointer px-3 py-1.5 text-sm"
                  onClick={() => setIndustry(ind)}
                >
                  {ind}
                </Badge>
              ))}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={() => setStep('autonomy')} className="w-full" disabled={!industry}>
              Continue
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'autonomy' && (
        <Card>
          <CardHeader>
            <CardTitle>How autonomous should QuadBot be?</CardTitle>
            <CardDescription>You can change this anytime from brand settings.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {AUTONOMY_LEVELS.map((level) => (
              <div
                key={level.value}
                onClick={() => setAutonomy(level.value)}
                className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                  autonomy === level.value ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground'
                }`}
              >
                <p className="font-medium">{level.label}</p>
                <p className="text-sm text-muted-foreground">{level.description}</p>
              </div>
            ))}
            <Button onClick={handleStartScan} className="w-full" disabled={scanning}>
              {scanning ? 'Starting...' : 'Launch Initial Scan'}
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 'scanning' && (
        <Card>
          <CardHeader>
            <CardTitle>Analyzing Your Brand...</CardTitle>
            <CardDescription>QuadBot is running its initial analysis. This usually takes 2-3 minutes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-muted border-t-primary" />
            <p className="text-sm text-muted-foreground">Redirecting to your dashboard shortly...</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

**Step 3: Create onboarding page**

Create `apps/web/src/app/onboarding/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-session';
import { OnboardingWizard } from '@/components/onboarding-wizard';

export default async function OnboardingPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  return <OnboardingWizard />;
}
```

**Step 4: Commit**

```bash
git add apps/web/src/app/onboarding/ apps/web/src/components/onboarding-wizard.tsx
git commit -m "feat: add multi-step onboarding wizard"
```

---

## Task 8: ROI Dashboard

**Files:**

- Create: `apps/web/src/app/dashboard/roi/page.tsx`
- Create: `apps/web/src/app/api/dashboard/roi/route.ts`

**Step 1: Create ROI API route**

Create `apps/web/src/app/api/dashboard/roi/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { metricSnapshots, outcomes, actionExecutions, recommendations, actionDrafts, llmUsage } from '@quadbot/db';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import { requireSession, type UserWithBrand } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireSession();
  const brandId = (session.user as UserWithBrand).brandId;
  if (!brandId) {
    return NextResponse.json({ error: 'No brand' }, { status: 400 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  // Get metric snapshots for traffic trends (current vs previous period)
  const [currentMetrics, previousMetrics] = await Promise.all([
    db
      .select({
        metric_key: metricSnapshots.metric_key,
        avg_value: sql<number>`avg(${metricSnapshots.value})`,
        latest_value: sql<number>`max(${metricSnapshots.value})`,
      })
      .from(metricSnapshots)
      .where(and(eq(metricSnapshots.brand_id, brandId), gte(metricSnapshots.captured_at, thirtyDaysAgo)))
      .groupBy(metricSnapshots.metric_key),
    db
      .select({
        metric_key: metricSnapshots.metric_key,
        avg_value: sql<number>`avg(${metricSnapshots.value})`,
      })
      .from(metricSnapshots)
      .where(
        and(
          eq(metricSnapshots.brand_id, brandId),
          gte(metricSnapshots.captured_at, sixtyDaysAgo),
          sql`${metricSnapshots.captured_at} < ${thirtyDaysAgo}`,
        ),
      )
      .groupBy(metricSnapshots.metric_key),
  ]);

  // Get action execution stats
  const executionStats = await db
    .select({
      total: sql<number>`count(*)`,
      successful: sql<number>`count(*) filter (where ${actionExecutions.status} = 'success')`,
    })
    .from(actionExecutions)
    .where(and(eq(actionExecutions.brand_id, brandId), gte(actionExecutions.executed_at, thirtyDaysAgo)));

  // Get outcomes (positive impact from actions)
  const outcomeData = await db
    .select({
      total_outcomes: sql<number>`count(*)`,
      positive_outcomes: sql<number>`count(*) filter (where ${outcomes.delta} > 0)`,
      avg_delta: sql<number>`avg(${outcomes.delta})`,
    })
    .from(outcomes)
    .where(and(eq(outcomes.brand_id, brandId), gte(outcomes.measured_at, thirtyDaysAgo)));

  // Get recommendation stats
  const recStats = await db
    .select({
      total: sql<number>`count(*)`,
      actioned: sql<number>`count(*) filter (where ${recommendations.status} != 'active')`,
      avg_roi: sql<number>`avg(${recommendations.roi_score})`,
    })
    .from(recommendations)
    .where(and(eq(recommendations.brand_id, brandId), gte(recommendations.created_at, thirtyDaysAgo)));

  // Get AI spend
  const aiSpend = await db
    .select({
      total_cost_cents: sql<number>`sum(${llmUsage.cost_cents})`,
      total_calls: sql<number>`count(*)`,
    })
    .from(llmUsage)
    .where(and(eq(llmUsage.brand_id, brandId), gte(llmUsage.created_at, thirtyDaysAgo)));

  // Build metric comparisons
  const metricComparisons = currentMetrics.map((current) => {
    const previous = previousMetrics.find((p) => p.metric_key === current.metric_key);
    const change = previous ? ((current.avg_value - previous.avg_value) / (previous.avg_value || 1)) * 100 : 0;
    return {
      key: current.metric_key,
      current: current.latest_value,
      average: current.avg_value,
      change: Math.round(change * 10) / 10,
    };
  });

  return NextResponse.json({
    metrics: metricComparisons,
    executions: executionStats[0] || { total: 0, successful: 0 },
    outcomes: outcomeData[0] || { total_outcomes: 0, positive_outcomes: 0, avg_delta: 0 },
    recommendations: recStats[0] || { total: 0, actioned: 0, avg_roi: 0 },
    aiSpend: {
      totalCostUsd: ((aiSpend[0]?.total_cost_cents || 0) / 100).toFixed(2),
      totalCalls: aiSpend[0]?.total_calls || 0,
    },
  });
}
```

**Step 2: Create ROI dashboard page**

Create `apps/web/src/app/dashboard/roi/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target, Zap, DollarSign, BarChart3 } from 'lucide-react';

type ROIData = {
  metrics: Array<{ key: string; current: number; average: number; change: number }>;
  executions: { total: number; successful: number };
  outcomes: { total_outcomes: number; positive_outcomes: number; avg_delta: number };
  recommendations: { total: number; actioned: number; avg_roi: number };
  aiSpend: { totalCostUsd: string; totalCalls: number };
};

function MetricCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs ${change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {change >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {change >= 0 ? '+' : ''}
            {change}% vs previous 30d
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ROIDashboardPage() {
  const [data, setData] = useState<ROIData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/roi')
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground">Loading ROI data...</div>;
  }

  if (!data) return null;

  const successRate =
    data.executions.total > 0 ? Math.round((data.executions.successful / data.executions.total) * 100) : 0;

  const positiveOutcomeRate =
    data.outcomes.total_outcomes > 0
      ? Math.round((data.outcomes.positive_outcomes / data.outcomes.total_outcomes) * 100)
      : 0;

  // Find key SEO metrics
  const clicksMetric = data.metrics.find((m) => m.key.includes('clicks'));
  const impressionsMetric = data.metrics.find((m) => m.key.includes('impressions'));
  const ctrMetric = data.metrics.find((m) => m.key.includes('ctr'));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">ROI Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          Measure the impact of QuadBot on your brand&apos;s performance (last 30 days)
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Recommendations Generated" value={data.recommendations.total} icon={Target} />
        <MetricCard
          label="Actions Executed"
          value={`${data.executions.successful}/${data.executions.total}`}
          icon={Zap}
        />
        <MetricCard label="Positive Outcomes" value={`${positiveOutcomeRate}%`} icon={TrendingUp} />
        <MetricCard label="AI Investment" value={`$${data.aiSpend.totalCostUsd}`} icon={DollarSign} />
      </div>

      {/* SEO Performance */}
      {(clicksMetric || impressionsMetric || ctrMetric) && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              SEO Performance Trends
            </CardTitle>
            <CardDescription>30-day comparison vs previous period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6 md:grid-cols-3">
              {clicksMetric && (
                <div>
                  <p className="text-sm text-muted-foreground">Organic Clicks</p>
                  <p className="text-2xl font-bold">{Math.round(clicksMetric.current).toLocaleString()}</p>
                  <Badge variant={clicksMetric.change >= 0 ? 'default' : 'destructive'}>
                    {clicksMetric.change >= 0 ? '+' : ''}
                    {clicksMetric.change}%
                  </Badge>
                </div>
              )}
              {impressionsMetric && (
                <div>
                  <p className="text-sm text-muted-foreground">Impressions</p>
                  <p className="text-2xl font-bold">{Math.round(impressionsMetric.current).toLocaleString()}</p>
                  <Badge variant={impressionsMetric.change >= 0 ? 'default' : 'destructive'}>
                    {impressionsMetric.change >= 0 ? '+' : ''}
                    {impressionsMetric.change}%
                  </Badge>
                </div>
              )}
              {ctrMetric && (
                <div>
                  <p className="text-sm text-muted-foreground">Click-Through Rate</p>
                  <p className="text-2xl font-bold">{(ctrMetric.current * 100).toFixed(1)}%</p>
                  <Badge variant={ctrMetric.change >= 0 ? 'default' : 'destructive'}>
                    {ctrMetric.change >= 0 ? '+' : ''}
                    {ctrMetric.change}%
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Metrics */}
      {data.metrics.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>All Tracked Metrics</CardTitle>
            <CardDescription>Before/after comparison across all data sources</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.metrics.map((metric) => (
                <div key={metric.key} className="flex items-center justify-between border-b pb-2 last:border-0">
                  <div>
                    <p className="font-medium capitalize">{metric.key.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-muted-foreground">
                      Current: {typeof metric.current === 'number' ? metric.current.toLocaleString() : metric.current}
                    </p>
                  </div>
                  <Badge variant={metric.change >= 0 ? 'default' : 'destructive'}>
                    {metric.change >= 0 ? '+' : ''}
                    {metric.change}%
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Success */}
      <Card>
        <CardHeader>
          <CardTitle>Action Effectiveness</CardTitle>
          <CardDescription>How well are QuadBot&apos;s actions performing?</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-3">
          <div>
            <p className="text-sm text-muted-foreground">Execution Success Rate</p>
            <p className="text-2xl font-bold">{successRate}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Positive Outcome Rate</p>
            <p className="text-2xl font-bold">{positiveOutcomeRate}%</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Avg ROI Score</p>
            <p className="text-2xl font-bold">{(data.recommendations.avg_roi || 0).toFixed(1)}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 3: Add ROI tab to dashboard layout**

In `apps/web/src/app/dashboard/layout.tsx`, add an "ROI" tab linking to `/dashboard/roi`.

**Step 4: Commit**

```bash
git add apps/web/src/app/dashboard/roi/ apps/web/src/app/api/dashboard/roi/ apps/web/src/app/dashboard/layout.tsx
git commit -m "feat: add ROI dashboard with metric comparisons and action effectiveness"
```

---

## Task 9: CSV Data Export

**Files:**

- Create: `apps/web/src/app/api/export/[type]/route.ts`
- Create: `apps/web/src/components/export-button.tsx`

**Step 1: Create export API route**

Create `apps/web/src/app/api/export/[type]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { recommendations, metricSnapshots, leads } from '@quadbot/db';
import { eq, and, desc } from 'drizzle-orm';
import { requireSession, type UserWithBrand } from '@/lib/auth-session';
import { withRateLimit } from '@/lib/rate-limit';

async function handler(req: NextRequest, context: { params: Promise<{ type: string }> }) {
  const session = await requireSession();
  const brandId = (session.user as UserWithBrand).brandId;
  if (!brandId) {
    return NextResponse.json({ error: 'No brand' }, { status: 400 });
  }

  const { type } = await context.params;
  let csvContent: string;
  let filename: string;

  switch (type) {
    case 'recommendations': {
      const rows = await db
        .select({
          title: recommendations.title,
          source: recommendations.source,
          priority: recommendations.priority,
          status: recommendations.status,
          confidence: recommendations.confidence,
          roi_score: recommendations.roi_score,
          effort_estimate: recommendations.effort_estimate,
          created_at: recommendations.created_at,
        })
        .from(recommendations)
        .where(eq(recommendations.brand_id, brandId))
        .orderBy(desc(recommendations.created_at))
        .limit(5000);

      csvContent = toCsv(rows, [
        'title',
        'source',
        'priority',
        'status',
        'confidence',
        'roi_score',
        'effort_estimate',
        'created_at',
      ]);
      filename = 'recommendations.csv';
      break;
    }

    case 'keywords': {
      const rows = await db
        .select({
          metric_key: metricSnapshots.metric_key,
          value: metricSnapshots.value,
          source: metricSnapshots.source,
          dimensions: metricSnapshots.dimensions,
          captured_at: metricSnapshots.captured_at,
        })
        .from(metricSnapshots)
        .where(and(eq(metricSnapshots.brand_id, brandId), eq(metricSnapshots.source, 'gsc')))
        .orderBy(desc(metricSnapshots.captured_at))
        .limit(10000);

      csvContent = toCsv(
        rows.map((r) => ({
          ...r,
          dimensions: JSON.stringify(r.dimensions),
        })),
        ['metric_key', 'value', 'source', 'dimensions', 'captured_at'],
      );
      filename = 'keyword-data.csv';
      break;
    }

    case 'leads': {
      const rows = await db
        .select({
          email: leads.email,
          first_name: leads.first_name,
          last_name: leads.last_name,
          company: leads.company,
          title: leads.title,
          status: leads.status,
          created_at: leads.created_at,
        })
        .from(leads)
        .where(eq(leads.brand_id, brandId))
        .orderBy(desc(leads.created_at))
        .limit(10000);

      csvContent = toCsv(rows, ['email', 'first_name', 'last_name', 'company', 'title', 'status', 'created_at']);
      filename = 'outreach-leads.csv';
      break;
    }

    default:
      return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  }

  return new NextResponse(csvContent, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',');
  const body = rows
    .map((row) =>
      columns
        .map((col) => {
          const val = row[col];
          if (val === null || val === undefined) return '';
          const str = val instanceof Date ? val.toISOString() : String(val);
          // Escape CSV values
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        })
        .join(','),
    )
    .join('\n');
  return `${header}\n${body}`;
}

export const GET = withRateLimit(handler, { maxRequests: 10, windowMs: 60_000 });
```

**Step 2: Create export button component**

Create `apps/web/src/components/export-button.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function ExportButton({ type, label }: { type: string; label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/export/${type}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `${type}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <Download className="mr-2 h-4 w-4" />
      {loading ? 'Exporting...' : label || 'Export CSV'}
    </Button>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/app/api/export/ apps/web/src/components/export-button.tsx
git commit -m "feat: add CSV data export for recommendations, keywords, and leads"
```

---

## Task 10: Job-Level Rate Limiting

**Files:**

- Modify: `apps/web/src/app/api/jobs/enqueue/route.ts`
- Modify: `apps/web/src/app/api/jobs/trigger/route.ts`

**Step 1: Add brand-level rate limiting to job enqueue**

In `apps/web/src/app/api/jobs/enqueue/route.ts`, after the existing auth check, add brand-level rate limiting:

```typescript
import { checkRateLimit } from '@/lib/rate-limit';

// After getting brandId:
const rateLimit = await checkRateLimit(`brand:${brandId}:jobs`, { maxRequests: 100, windowMs: 60_000 });
if (!rateLimit.allowed) {
  return NextResponse.json(
    { error: 'Too many jobs queued. Please wait before submitting more.' },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000)) } },
  );
}
```

**Step 2: Do the same for job trigger route**

Apply the same pattern to `apps/web/src/app/api/jobs/trigger/route.ts`.

**Step 3: Commit**

```bash
git add apps/web/src/app/api/jobs/enqueue/route.ts apps/web/src/app/api/jobs/trigger/route.ts
git commit -m "feat: add brand-level rate limiting for job enqueue and trigger"
```

---

## Task 11: Integration Health & Error Recovery UX

**Files:**

- Create: `apps/web/src/app/api/integrations/health/route.ts`
- Create: `apps/web/src/components/integration-health.tsx`

**Step 1: Create integration health API route**

Create `apps/web/src/app/api/integrations/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sharedCredentials, brands } from '@quadbot/db';
import { eq, and } from 'drizzle-orm';
import { requireSession, type UserWithBrand } from '@/lib/auth-session';

export const dynamic = 'force-dynamic';

type IntegrationStatus = {
  id: string;
  type: string;
  name: string;
  status: 'connected' | 'expired' | 'error' | 'not_connected';
  lastChecked: string | null;
  reconnectUrl: string | null;
};

export async function GET() {
  const session = await requireSession();
  const brandId = (session.user as UserWithBrand).brandId;

  // Get all credentials for this brand (or global shared ones)
  const credentials = brandId ? await db.select().from(sharedCredentials) : [];

  const integrations: IntegrationStatus[] = [
    {
      id: 'gsc',
      type: 'google_search_console',
      name: 'Google Search Console',
      status: 'not_connected',
      lastChecked: null,
      reconnectUrl: '/onboarding/gsc-import',
    },
    {
      id: 'ga4',
      type: 'google_analytics',
      name: 'Google Analytics 4',
      status: 'not_connected',
      lastChecked: null,
      reconnectUrl: '/onboarding/gsc-import',
    },
    {
      id: 'gads',
      type: 'google_ads',
      name: 'Google Ads',
      status: 'not_connected',
      lastChecked: null,
      reconnectUrl: '/onboarding/gsc-import',
    },
  ];

  // Check which credentials exist and their status
  for (const cred of credentials) {
    const integration = integrations.find((i) => i.type === cred.type || cred.type === 'google_oauth');
    if (integration) {
      // Check if token is expired by looking at the config
      const config = cred.config as Record<string, unknown>;
      const expiryDate = config?.expiry_date as number | undefined;
      if (expiryDate && expiryDate < Date.now()) {
        integration.status = 'expired';
      } else {
        integration.status = 'connected';
      }
      integration.lastChecked = cred.updated_at?.toISOString() || null;
    }
  }

  return NextResponse.json({ integrations });
}
```

**Step 2: Create integration health component**

Create `apps/web/src/components/integration-health.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, XCircle, Link2 } from 'lucide-react';

type Integration = {
  id: string;
  type: string;
  name: string;
  status: 'connected' | 'expired' | 'error' | 'not_connected';
  lastChecked: string | null;
  reconnectUrl: string | null;
};

const statusConfig = {
  connected: { icon: CheckCircle2, color: 'text-green-500', label: 'Connected', badge: 'default' as const },
  expired: { icon: AlertTriangle, color: 'text-yellow-500', label: 'Token Expired', badge: 'secondary' as const },
  error: { icon: XCircle, color: 'text-red-500', label: 'Error', badge: 'destructive' as const },
  not_connected: { icon: Link2, color: 'text-muted-foreground', label: 'Not Connected', badge: 'outline' as const },
};

export function IntegrationHealth() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/integrations/health')
      .then((r) => r.json())
      .then((data) => setIntegrations(data.integrations))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  const hasIssues = integrations.some((i) => i.status === 'expired' || i.status === 'error');

  if (!hasIssues) return null;

  return (
    <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950/20">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
          Integration Attention Needed
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {integrations
          .filter((i) => i.status === 'expired' || i.status === 'error')
          .map((integration) => {
            const config = statusConfig[integration.status];
            const Icon = config.icon;
            return (
              <div key={integration.id} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${config.color}`} />
                  <span className="text-sm font-medium">{integration.name}</span>
                  <Badge variant={config.badge}>{config.label}</Badge>
                </div>
                {integration.reconnectUrl && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={integration.reconnectUrl}>Reconnect</a>
                  </Button>
                )}
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}
```

**Step 3: Add IntegrationHealth to dashboard page**

In `apps/web/src/app/dashboard/page.tsx`, import and render `<IntegrationHealth />` at the top of the dashboard layout, just after the welcome header.

**Step 4: Commit**

```bash
git add apps/web/src/app/api/integrations/ apps/web/src/components/integration-health.tsx apps/web/src/app/dashboard/page.tsx
git commit -m "feat: add integration health monitoring with reconnect flows"
```

---

## Task 12: Legal Pages (TOS, Privacy Policy, Cookie Consent)

**Files:**

- Create: `apps/web/src/app/(public)/terms/page.tsx`
- Create: `apps/web/src/app/(public)/privacy/page.tsx`
- Create: `apps/web/src/components/cookie-consent.tsx`
- Modify: `apps/web/src/app/layout.tsx` (add cookie consent)
- Modify: `apps/web/middleware.ts` (add /terms, /privacy to PUBLIC_PATHS)

**Step 1: Add /terms and /privacy to public paths**

In `middleware.ts`, add `'/terms'` and `'/privacy'` to `PUBLIC_PATHS`.

**Step 2: Create Terms of Service page**

Create `apps/web/src/app/(public)/terms/page.tsx`:

```tsx
export const metadata = { title: 'Terms of Service - QuadBot' };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using QuadBot (&quot;Service&quot;), you agree to be bound by these Terms of Service. If you do
        not agree, do not use the Service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        QuadBot is an AI-powered brand management platform that provides SEO analysis, content generation, outreach
        automation, and advertising management services.
      </p>

      <h2>3. User Accounts</h2>
      <p>
        You must provide accurate information when creating an account. You are responsible for maintaining the security
        of your account credentials.
      </p>

      <h2>4. Subscriptions & Billing</h2>
      <p>
        Paid plans are billed on a recurring basis. You may cancel at any time. Cancellation takes effect at the end of
        the current billing period. Refunds are handled on a case-by-case basis.
      </p>

      <h2>5. Data & Privacy</h2>
      <p>
        Your use of the Service is also governed by our <a href="/privacy">Privacy Policy</a>. We process data from your
        connected services (Google Search Console, Analytics, Ads) solely to provide the Service.
      </p>

      <h2>6. AI-Generated Content</h2>
      <p>
        Content generated by QuadBot is provided as suggestions. You are responsible for reviewing and approving all
        content before publication. QuadBot does not guarantee the accuracy or effectiveness of AI-generated
        recommendations.
      </p>

      <h2>7. Acceptable Use</h2>
      <p>
        You may not use the Service to: violate any laws, send spam, interfere with other users, or attempt to
        reverse-engineer the platform.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        The Service is provided &quot;as is&quot; without warranties. QuadBot shall not be liable for any indirect,
        incidental, or consequential damages arising from use of the Service.
      </p>

      <h2>9. Changes to Terms</h2>
      <p>
        We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance
        of the updated Terms.
      </p>

      <h2>10. Contact</h2>
      <p>Questions about these Terms? Contact us at legal@quadbot.ai.</p>
    </div>
  );
}
```

**Step 3: Create Privacy Policy page**

Create `apps/web/src/app/(public)/privacy/page.tsx`:

```tsx
export const metadata = { title: 'Privacy Policy - QuadBot' };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16 prose dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

      <h2>1. Information We Collect</h2>
      <h3>Account Information</h3>
      <p>Name, email address, and profile information from Google OAuth.</p>

      <h3>Connected Service Data</h3>
      <p>
        When you connect Google services, we access: search performance data (GSC), analytics data (GA4), and
        advertising data (Google Ads). We request the minimum permissions needed and primarily use read-only access.
      </p>

      <h3>Usage Data</h3>
      <p>
        We track how you interact with the platform to improve the Service, including pages visited, features used, and
        recommendations acted upon.
      </p>

      <h2>2. How We Use Your Data</h2>
      <ul>
        <li>Providing and improving the Service</li>
        <li>Generating AI-powered recommendations</li>
        <li>Cross-brand benchmarking (anonymized and aggregated)</li>
        <li>Billing and account management</li>
        <li>Communicating service updates</li>
      </ul>

      <h2>3. Data Sharing</h2>
      <p>We do not sell your data. We share data only with:</p>
      <ul>
        <li>
          <strong>AI Providers:</strong> Anthropic (Claude) for generating recommendations — data is not used for model
          training
        </li>
        <li>
          <strong>Payment Processing:</strong> Stripe for billing
        </li>
        <li>
          <strong>Email:</strong> Resend for transactional emails
        </li>
        <li>
          <strong>Infrastructure:</strong> Vercel, Supabase for hosting and database
        </li>
      </ul>

      <h2>4. Data Retention</h2>
      <p>
        We retain your data for the duration of your account. Upon account deletion, we remove personal data within 30
        days. Anonymized, aggregated data used for benchmarking may be retained.
      </p>

      <h2>5. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access your data</li>
        <li>Export your data (CSV export available in-app)</li>
        <li>Delete your account and data</li>
        <li>Disconnect integrated services at any time</li>
      </ul>

      <h2>6. Cookies</h2>
      <p>
        We use essential cookies for authentication and session management. We do not use third-party tracking cookies.
      </p>

      <h2>7. Security</h2>
      <p>
        We encrypt sensitive data at rest, use HTTPS for all communications, and follow security best practices for
        credential storage.
      </p>

      <h2>8. Contact</h2>
      <p>For privacy inquiries: privacy@quadbot.ai</p>
    </div>
  );
}
```

**Step 4: Create cookie consent banner**

Create `apps/web/src/components/cookie-consent.tsx`:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) setVisible(true);
  }, []);

  const accept = () => {
    localStorage.setItem('cookie-consent', 'accepted');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background p-4 shadow-lg">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          We use essential cookies for authentication and session management. By continuing, you agree to our{' '}
          <a href="/privacy" className="underline">
            Privacy Policy
          </a>{' '}
          and{' '}
          <a href="/terms" className="underline">
            Terms of Service
          </a>
          .
        </p>
        <Button onClick={accept} size="sm">
          Accept
        </Button>
      </div>
    </div>
  );
}
```

**Step 5: Add CookieConsent to root layout**

In `apps/web/src/app/layout.tsx`, import and render `<CookieConsent />` at the bottom of the body.

**Step 6: Commit**

```bash
git add apps/web/src/app/\(public\)/ apps/web/src/components/cookie-consent.tsx apps/web/src/app/layout.tsx apps/web/middleware.ts
git commit -m "feat: add legal pages (TOS, Privacy Policy) and cookie consent banner"
```

---

## Task 13: Seed Plan Data

**Files:**

- Create: `packages/db/src/seed-plans.ts`

**Step 1: Create plan seeder**

Create `packages/db/src/seed-plans.ts`:

```typescript
import { db } from './client';
import { plans } from './schema';

const PLANS = [
  {
    tier: 'free' as const,
    name: 'Free',
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    max_brands: 1,
    max_jobs_per_day: 10,
    max_recommendations_per_month: 25,
    max_ai_spend_cents_per_month: 0,
    features: ['basic_seo'],
  },
  {
    tier: 'starter' as const,
    name: 'Starter',
    stripe_price_id_monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || null,
    stripe_price_id_yearly: process.env.STRIPE_STARTER_YEARLY_PRICE_ID || null,
    price_monthly_cents: 4900,
    price_yearly_cents: 47000,
    max_brands: 3,
    max_jobs_per_day: 100,
    max_recommendations_per_month: 500,
    max_ai_spend_cents_per_month: 2000,
    features: ['basic_seo', 'content_generation', 'csv_export', 'email_digest'],
  },
  {
    tier: 'pro' as const,
    name: 'Pro',
    stripe_price_id_monthly: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || null,
    stripe_price_id_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || null,
    price_monthly_cents: 14900,
    price_yearly_cents: 143000,
    max_brands: 10,
    max_jobs_per_day: 500,
    max_recommendations_per_month: 99999,
    max_ai_spend_cents_per_month: 10000,
    features: [
      'basic_seo',
      'content_generation',
      'csv_export',
      'email_digest',
      'api_access',
      'all_integrations',
      'priority_support',
    ],
  },
  {
    tier: 'agency' as const,
    name: 'Agency',
    stripe_price_id_monthly: process.env.STRIPE_AGENCY_MONTHLY_PRICE_ID || null,
    stripe_price_id_yearly: process.env.STRIPE_AGENCY_YEARLY_PRICE_ID || null,
    price_monthly_cents: 39900,
    price_yearly_cents: 383000,
    max_brands: 50,
    max_jobs_per_day: 99999,
    max_recommendations_per_month: 99999,
    max_ai_spend_cents_per_month: 50000,
    features: [
      'basic_seo',
      'content_generation',
      'csv_export',
      'email_digest',
      'api_access',
      'all_integrations',
      'priority_support',
      'white_label',
      'team_management',
      'dedicated_support',
    ],
  },
];

export async function seedPlans() {
  for (const plan of PLANS) {
    await db
      .insert(plans)
      .values(plan)
      .onConflictDoUpdate({
        target: plans.tier,
        set: {
          name: plan.name,
          price_monthly_cents: plan.price_monthly_cents,
          price_yearly_cents: plan.price_yearly_cents,
          max_brands: plan.max_brands,
          max_jobs_per_day: plan.max_jobs_per_day,
          max_recommendations_per_month: plan.max_recommendations_per_month,
          max_ai_spend_cents_per_month: plan.max_ai_spend_cents_per_month,
          features: plan.features,
        },
      });
  }
  console.log('Plans seeded successfully');
}
```

**Step 2: Commit**

```bash
git add packages/db/src/seed-plans.ts
git commit -m "feat: add plan tier seeder with Free/Starter/Pro/Agency tiers"
```

---

## Task 14: Navigation Updates

**Files:**

- Modify: `apps/web/src/components/nav.tsx`
- Modify: `apps/web/src/app/dashboard/layout.tsx`

**Step 1: Add navigation links**

In `apps/web/src/components/nav.tsx`, add links for:

- Billing (`/billing`)
- Settings link to integration health

In `apps/web/src/app/dashboard/layout.tsx`, add tabs for:

- ROI (`/dashboard/roi`)

**Step 2: Commit**

```bash
git add apps/web/src/components/nav.tsx apps/web/src/app/dashboard/layout.tsx
git commit -m "feat: add billing and ROI links to navigation"
```

---

## Verification Checklist

After all tasks complete:

1. **Schema:** Run `pnpm turbo db:migrate` — verify plans, subscriptions, usage_records tables exist
2. **Billing:** Visit `/billing` — verify plan cards render, checkout button works (Stripe test mode)
3. **Webhook:** Send test webhook via Stripe CLI: `stripe trigger customer.subscription.created`
4. **Onboarding:** Visit `/onboarding` — walk through all steps
5. **ROI:** Visit `/dashboard/roi` — verify metrics render (may be empty if no data)
6. **Export:** Click export button on recommendations page — verify CSV downloads
7. **Rate Limiting:** Hit `/api/jobs/enqueue` rapidly — verify 429 after limit
8. **Integration Health:** Visit dashboard — verify health banner shows for expired tokens
9. **Legal:** Visit `/terms` and `/privacy` — verify pages render without auth
10. **Cookie Consent:** Clear localStorage, visit app — verify banner appears
11. **Build:** Run `pnpm turbo build` — verify no TypeScript errors

---

## Notes for Implementer

- The `user` table reference in schema.ts is `user` (lowercase) — that's the better-auth convention
- Stripe API version should match the installed SDK — check `node_modules/stripe/package.json`
- The `metricSnapshots` table export name may differ from the import — check `@quadbot/db` exports
- Rate limit uses Upstash Redis REST (not ioredis) — requires `UPSTASH_REDIS_REST_URL` env var
- Legal pages use the `(public)` route group — this doesn't affect URL paths
- Plan enforcement is soft for now — no hard blocking on the worker side, only API-level gates
