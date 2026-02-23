# QuadBot Product Roadmap

**Target user:** Solo brand owner / SMB marketer
**North star:** From "AI that recommends" to "AI that runs your marketing"
**Architecture principle:** Staged autonomy with guardrails — never do anything the user didn't consent to

---

## Phase 1: Close the Gaps (Foundation)

**Goal:** Fix the issues that prevent QuadBot from being production-trustworthy.

### 1A. CI/CD Pipeline

**Files to create:**
- `.github/workflows/ci.yml` — lint + typecheck + test on every PR
- `.github/workflows/deploy-web.yml` — Vercel deploy on merge to main
- `.github/workflows/deploy-worker.yml` — Render deploy on merge to main

**Pipeline steps:**
1. `pnpm install --frozen-lockfile`
2. `pnpm lint` (add eslint config if missing)
3. `pnpm --filter @quadbot/shared build`
4. `pnpm --filter @quadbot/web build`
5. `pnpm test:run`

**Scope:** 3 workflow files, 1 eslint config.

### 1B. Error Tracking (Sentry)

**Files to modify:**
- `apps/web/src/app/layout.tsx` — init Sentry browser SDK
- `apps/web/src/app/global-error.tsx` — create Next.js error boundary with Sentry capture
- `apps/worker/src/index.ts` — init Sentry Node SDK
- `apps/worker/src/execution-loop.ts` — capture execution errors
- `apps/worker/src/queue.ts` — capture job processing errors

**New env vars:** `SENTRY_DSN`, `SENTRY_AUTH_TOKEN`

### 1C. Health Endpoints

**Files to create:**
- `apps/web/src/app/api/health/route.ts` — checks DB connection, returns `{ status: 'ok', db: true, uptime: N }`
- Worker health: add `/health` HTTP endpoint to worker process (requires adding a minimal HTTP server alongside the queue consumer)

**Use:** Render/Vercel health checks, uptime monitoring.

### 1D. XSS + Schema Fixes (DONE)

Already completed:
- Replaced `dangerouslySetInnerHTML` with React element splitting
- Added `.max(20)` to evidence, `.max(10)` to next_steps arrays
- Added `isNaN()` guards to formatDelta/formatNumber

---

## Phase 2: The Autonomy Ladder — Level 3 (Execute)

**Goal:** QuadBot can execute approved actions automatically, with real effects on Google services.

### Current State

The execution infrastructure already exists:

| Component | Status |
|-----------|--------|
| `execution_rules` table | Exists: auto_execute, min_confidence, max_risk, allowed_action_types |
| Execution loop | Exists: polls every 30s for approved drafts |
| Executor interface | Exists: type, execute(context) → ExecutorResult |
| GSC Index Request executor | **Working** — submits URLs to Google Indexing API |
| GSC Inspection executor | **Working** — inspects URL status |
| GSC Sitemap Notify executor | **Working** — pings sitemap |
| Flag for Review executor | **Working** — logs + emits event |
| Auto-approval in settings UI | **Working** — confidence slider, risk dropdown |

**What's missing:** More executors, safety limits, and a notification system so users know what happened.

### 2A. New Executors

#### Google Ads Executors

**New file:** `apps/worker/src/executors/ads-pause-campaign.ts`
- Type: `ads-pause-campaign`
- Payload: `{ campaign_id: string, reason: string }`
- Implementation: Google Ads API v21 `campaigns:mutate` with `PAUSED` status
- Safety: Requires `max_risk >= 'medium'`, emits event, records previous state for rollback

**New file:** `apps/worker/src/executors/ads-adjust-budget.ts`
- Type: `ads-adjust-budget`
- Payload: `{ campaign_id: string, new_daily_budget: number, reason: string }`
- Implementation: Google Ads API `campaigns:mutate` with new budget
- Safety: Maximum 20% budget change per execution. Reject if delta > 20%. Record previous budget for rollback.

**New file:** `apps/worker/src/executors/ads-enable-campaign.ts`
- Type: `ads-enable-campaign`
- Payload: `{ campaign_id: string, reason: string }`
- Implementation: Google Ads API `campaigns:mutate` with `ENABLED` status

#### Content Executors

**New file:** `apps/worker/src/executors/update-meta.ts`
- Type: `update-meta`
- Payload: `{ url: string, new_title?: string, new_description?: string }`
- Implementation: Phase 1 = generate a content brief artifact with the proposed changes (no direct site modification). Phase 2 = integrate with CMS APIs (WordPress, Shopify, etc.)
- Rationale: We can't modify arbitrary websites. Instead, generate the exact HTML changes as an artifact the user can copy-paste or a CMS plugin can apply.

### 2B. Execution Safety System

**New file:** `apps/worker/src/execution-safety.ts`

Pre-execution checks that run before every executor:

```
function validateExecution(draft, brand, rules):
  1. Verify brand is in 'assist' mode
  2. Verify auto_execute is enabled (or draft was manually approved)
  3. Verify confidence >= min_confidence
  4. Verify risk <= max_risk
  5. Verify action type in allowed_action_types (or list is empty = all allowed)
  6. Check daily execution budget:
     - New table: execution_budgets { brand_id, date, executions_count, spend_delta }
     - Default limit: 10 executions per day
     - Ads executors: track cumulative spend delta, cap at $50/day change
  7. If any check fails: log reason, keep draft as 'pending', notify user
```

**New file:** `apps/worker/src/execution-rollback.ts`

Rollback registry for reversible actions:

```
- ads-pause-campaign → ads-enable-campaign (restore previous state)
- ads-adjust-budget → ads-adjust-budget (restore previous budget)
- gsc-index-request → not reversible (log only)
```

Store rollback data in `action_executions.result.rollback_data`.

**Modify:** `apps/worker/src/execution-loop.ts`
- Call `validateExecution()` before executing
- Store rollback data in execution result
- Add execution counter per brand per day

### 2C. Execution Notifications

**Goal:** User knows what happened without logging in.

**New file:** `apps/worker/src/lib/notification-sender.ts`

```typescript
interface Notification {
  brand_id: string;
  type: 'execution_completed' | 'execution_failed' | 'approval_needed' | 'daily_digest';
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function sendNotification(notification: Notification): Promise<void> {
  // 1. Always: insert into notifications table (for in-app display)
  // 2. If email configured: send via Resend (already integrated)
  // 3. Future: Slack webhook, SMS
}
```

**New table (migration):** `notifications`
```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500) NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Trigger points:**
- After execution: "QuadBot submitted 3 URLs for indexing and paused 1 underperforming campaign"
- On failure: "Action failed: could not pause campaign X — Google Ads API returned 403"
- Daily digest: "Today QuadBot found 5 recommendations and executed 2 approved actions"

**New file:** `apps/web/src/app/api/notifications/route.ts`
- `GET /api/notifications?brand_id=X&unread=true` — fetch notifications
- `PATCH /api/notifications/:id` — mark as read

**UI:** Add notification bell icon to dashboard header with unread count badge.

### 2D. Execution Dashboard

**New file:** `apps/web/src/app/brands/[id]/executions/page.tsx`

Shows execution history:
- Timeline of executed actions with results
- Success/failure rates
- Rollback buttons for reversible actions
- Cumulative impact metrics (URLs indexed, budget changes, etc.)

### 2E. Action Type Expansion

**Modify:** `packages/shared/src/schemas/prompts.ts` — add to actionTypeEnum:
```
'ads-pause-campaign'
'ads-enable-campaign'
'ads-adjust-budget'
```

**Modify:** `apps/worker/src/seed-prompts.ts` — update action_draft_generator prompt to know about new action types and when to suggest them.

**Modify:** `apps/worker/src/executors/registry.ts` — register new executors.

---

## Phase 3: Close the Outcome Loop

**Goal:** Every executed action feeds back into recommendation quality. QuadBot gets smarter with every brand it serves.

### Current State

| Component | Status |
|-----------|--------|
| Outcome collector job | **Working** — measures metric deltas 7 days post-execution |
| Evaluation scorer job | **Working** — computes acceptance_rate, calibration_error per 30-day period |
| Signal extractor job | **Working** — Claude extracts cross-brand patterns from outcomes |
| Strategic prioritizer job | **Working** — ranks recs using base score + Claude adjustment |
| Confidence calibrator | **Working** — tracks calibration trend (improving/degrading/stable) |
| Metric snapshots | **Working** — captures GA4 + Ads metrics daily |
| Cross-brand signal context | **Working** — injected into strategic prioritizer |

**What's broken:** Confidence is never adjusted based on outcomes. Calibration error is calculated but not acted on. Signals have decay weights but prioritizer doesn't use them.

### 3A. Confidence Feedback Loop

**Modify:** `apps/worker/src/jobs/evaluation-scorer.ts`

After computing calibration_error, adjust the confidence threshold:

```typescript
// If calibration_error > 0.15 (confidence too high relative to acceptance):
//   Lower the effective confidence threshold for auto-execution
// If calibration_error < 0.05 (well-calibrated):
//   Trust confidence scores more, allow slightly lower thresholds

// Write adjustment to execution_rules or a new calibration_adjustments table
```

This means: if QuadBot is overconfident (says 0.9 but only 60% accepted), the system automatically becomes more cautious.

### 3B. Multi-Window Outcome Tracking

**Modify:** `apps/worker/src/jobs/outcome-collector.ts`

Currently measures once at 7 days. Change to measure at 7, 14, and 30 days:

```typescript
const OUTCOME_WINDOWS = [7, 14, 30]; // days

for (const window of OUTCOME_WINDOWS) {
  // Find recommendations created > window days ago that don't have
  // an outcome for this window yet
  // Measure metric delta
  // Insert outcome with metric_name suffix: e.g., 'position_change_7d', 'position_change_30d'
}
```

**Why:** 7-day outcomes capture immediate impact. 30-day outcomes capture sustained value. A recommendation that lifts CTR for 7 days but crashes at 30 is worse than one that lifts steadily.

### 3C. Source Quality Scoring

**New job:** `apps/worker/src/jobs/source-quality-scorer.ts`

Track which recommendation sources (gsc_daily_digest, ads_performance_digest, trend_scan, etc.) produce the best outcomes:

```typescript
// Per source, per brand:
// - acceptance_rate
// - avg_positive_outcome_rate
// - avg_outcome_delta

// Feed into strategic prioritizer:
// Recommendations from high-performing sources get a boost
// Recommendations from low-performing sources get penalized
```

### 3D. User Feedback Mechanism

**New API route:** `apps/web/src/app/api/recommendations/[id]/feedback/route.ts`

```typescript
POST /api/recommendations/:id/feedback
Body: { rating: 'helpful' | 'not_helpful' | 'harmful', comment?: string }
```

**UI:** Add thumbs up/down buttons to recommendation detail page.

**Feed into:** Evaluation scorer uses feedback signals alongside acceptance rates.

### 3E. Outcome Visibility

**Modify:** `apps/web/src/app/brands/[id]/evaluation/page.tsx`

Add sections:
- **Confidence calibration curve** — scatter plot of predicted confidence vs actual acceptance rate
- **Source quality ranking** — which sources produce the most accepted and positively-outcomed recommendations
- **Signal impact** — which cross-brand signals improved outcomes when applied
- **Trend line** — calibration error over time (is the system getting better?)

---

## Phase 4: The Notification System

**Goal:** Users don't need to log in to stay informed. QuadBot comes to them.

### 4A. Email Digest

**New job:** `apps/worker/src/jobs/daily-email-digest.ts`

Runs daily at 9 AM (after all digest jobs complete):

```typescript
// Per brand:
// 1. Count new recommendations since last digest
// 2. List top 3 by priority_rank
// 3. Count pending actions awaiting approval
// 4. List any executions completed since last digest
// 5. Compose email via Resend (already integrated)
// 6. Send to brand owner email
```

**Template:** Clean, mobile-friendly HTML email:
```
Subject: QuadBot Daily Brief — 5 new recommendations, 2 actions pending

[Brand Name] — Feb 22, 2026

TOP PRIORITIES
1. [High] CTR drop on "best coffee beans" — position shifted from 3→7
2. [Medium] New trending topic in your industry: "cold brew techniques 2026"
3. [Medium] Google Ads campaign "Summer Sale" ROAS dropped 40%

PENDING ACTIONS (2)
- Submit 3 URLs for re-indexing [Approve] [View Details]
- Pause "Summer Sale" campaign [Approve] [View Details]

EXECUTED YESTERDAY
- Submitted sitemap ping ✓
- Re-indexed /blog/cold-brew-guide ✓

[Open Dashboard →]
```

### 4B. In-App Notification Center

**New component:** `apps/web/src/components/notification-bell.tsx`
- Bell icon in header with unread count badge
- Dropdown panel showing recent notifications
- "Mark all as read" button
- Links to relevant pages (recommendation detail, action approval)

### 4C. Slack Integration (Future)

**New file:** `apps/worker/src/lib/slack-webhook.ts`
- Send notifications via incoming webhook URL
- Configurable per brand in settings
- Format: Slack Block Kit messages with action buttons

---

## Phase 5: Cost-Optimized Model Routing

**Goal:** Cut Anthropic API costs by 60-80% without sacrificing recommendation quality.

### Current State

Every prompt uses `claude-sonnet-4-20250514`. The `model` field exists on `prompt_versions` but routing is not dynamic.

### 5A. Model Routing Logic

**Modify:** `apps/worker/src/claude.ts`

```typescript
function selectModel(promptName: string, inputTokenEstimate: number): string {
  // Tier 1: Haiku — routine classification, simple analysis
  // - community_moderation_classifier (approve/reject decisions)
  // - trend_relevance_filter (yes/no filtering)
  // - flag_for_review actions

  // Tier 2: Sonnet — standard analysis and recommendations
  // - gsc_digest_recommender
  // - ads_performance_digest
  // - analytics_insights
  // - action_draft_generator
  // - content_optimizer

  // Tier 3: Opus — strategic reasoning and cross-domain synthesis
  // - strategic_prioritizer (requires weighing complex trade-offs)
  // - cross_channel_correlator (multi-source reasoning)
  // - capability_gap_analyzer (meta-reasoning about the system)
  // - signal_extractor (pattern recognition across brands)
}
```

**Implementation:** Update the `model` field in seed-prompts for each prompt to the appropriate tier. The `callClaude` function already reads `prompt.model` — it just needs the right values.

### 5B. Token Usage Tracking

**New table (migration):** `llm_usage`
```sql
CREATE TABLE llm_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id),
  prompt_name VARCHAR(100) NOT NULL,
  model VARCHAR(100) NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_cents REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Modify:** `apps/worker/src/claude.ts` — after each `callClaude`, insert usage record.

**Dashboard:** Add cost tracking to `/dashboard/usage` page showing:
- Daily/weekly/monthly API spend
- Cost per brand
- Cost per job type
- Model tier breakdown

### 5C. Smart Fallback

If Sonnet fails (rate limit, timeout), automatically retry with Haiku for non-critical analysis. Log the fallback for quality monitoring.

---

## Phase 6: The SMB Experience

**Goal:** A solo brand owner connects Google, and within 24 hours QuadBot is managing their marketing.

### 6A. First-Run Experience

**Modify:** `apps/web/src/app/onboarding/gsc-import/page.tsx`

After brand creation, add guided setup flow:

1. **Connect Google** (existing) — OAuth for GSC/Ads/Analytics
2. **Auto-profile** (existing) — brand profiler runs, detects industry/keywords
3. **Set autonomy level** (NEW) — simple 3-option picker:
   - "Just watch" (observe mode, no actions)
   - "Suggest actions" (assist mode, I approve everything)
   - "Handle the basics" (assist mode, auto-execute low-risk GSC actions)
4. **First scan** (NEW) — trigger GSC digest + trend scan immediately, don't wait for cron
5. **Results preview** (NEW) — show first recommendations within 5 minutes: "We found 3 things to improve"

### 6B. Weekly Summary Email

Beyond the daily digest, a weekly summary showing:
- Recommendations acted on this week
- Measured outcomes (if any 7-day windows completed)
- Confidence trend (is QuadBot getting better for your brand?)
- One highlighted insight from cross-brand signals

### 6C. One-Click Actions

**Modify:** `apps/web/src/app/dashboard/page.tsx`

In the priority queue, add inline action buttons:
- "Submit for indexing" (one click, fires GSC index request)
- "Approve all low-risk" (batch approve all pending low-risk actions)
- "Dismiss" (mark recommendation as not relevant)

### 6D. Mobile-Responsive Dashboard

Audit and fix all dashboard components for mobile viewports. The daily experience for an SMB owner should work on a phone — check email digest, approve 2 actions, done.

---

## Phase 7: The Defensible Moat Features

**Goal:** Build what competitors can't easily replicate.

### 7A. Playbook System

**New table (migration):** `playbooks`
```sql
CREATE TABLE playbooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  vertical VARCHAR(100), -- 'ecommerce', 'saas', 'local_business', etc.
  description TEXT,
  rules JSONB NOT NULL, -- structured playbook rules
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Playbook rules format:**
```json
{
  "if": { "source": "gsc_daily_digest", "type": "ctr_anomaly", "priority": "high" },
  "then": {
    "boost_priority": 0.2,
    "suggest_action": "update_meta",
    "effort_override": "hours"
  }
}
```

**Integration:** Strategic prioritizer loads playbooks for the brand's vertical, applies rule boosts.

**Starter playbooks:**
- E-commerce: product page CTR optimization, seasonal trend detection
- SaaS: feature page SEO, comparison content opportunities
- Local business: Google Business Profile optimization, local keyword tracking

### 7B. GEO (Generative Engine Optimization)

Track brand visibility in AI search results (ChatGPT, Perplexity, Claude).

**New job:** `apps/worker/src/jobs/geo-visibility-scan.ts`

```typescript
// 1. Take brand's top 10 keywords
// 2. Query Perplexity API / search ChatGPT results
// 3. Check if brand is mentioned in AI-generated answers
// 4. Track visibility score over time in metric_snapshots (source: 'geo')
// 5. Generate recommendations for improving AI search visibility
```

This is the emerging "Generative Engine Optimization" category that AthenaHQ (ex-Google Search + DeepMind team) is pioneering. Nobody is doing this for SMBs.

### 7C. MCP Client Mode

**New file:** `apps/worker/src/lib/mcp-client.ts`

QuadBot as an MCP *client* — consuming external MCP data servers to enrich recommendations:

```typescript
// Connect to external MCP servers for additional data:
// - Semrush MCP: keyword difficulty, competitor rankings
// - Ahrefs MCP: backlink profile, domain authority
// - DataForSEO MCP: SERP features, rich results
//
// Inject this data into digest job prompts alongside GSC/Ads/Analytics data
// Result: Recommendations grounded in 5+ data sources instead of 1-3
```

**Configuration:** Brand settings page gets an "External Data Sources" section where users can connect MCP-compatible data providers.

### 7D. Cross-Brand Benchmarking

**New job:** `apps/worker/src/jobs/benchmark-generator.ts`

For brands in the same vertical, generate anonymous benchmark data:

```typescript
// "Your average CTR (2.3%) is below the median for SaaS brands (3.1%)"
// "Your ad ROAS (3.2x) is in the top 25% of e-commerce brands"
//
// Data source: metric_snapshots aggregated across brands with same industry
// Privacy: Only aggregate stats, never individual brand data
```

This gets more valuable with every brand that joins — true network effect.

---

## Phase 8: Real-Time Intelligence

**Goal:** Don't wait for cron jobs. React to events as they happen.

### 8A. Event-Driven Trend Detection

**Modify:** `apps/worker/src/jobs/trend-scan.ts`

Instead of running once daily at 9 AM, add a lightweight "hot scan" that runs every 4 hours:

```typescript
// Hot scan: check News API + Reddit for breaking trends
// If anything scores >0.8 relevance for the brand:
//   - Create recommendation immediately
//   - Send push notification
//   - "Breaking: Your competitor just announced X — here's how to respond"
```

### 8B. Anomaly Detection

**New job:** `apps/worker/src/jobs/anomaly-detector.ts`

Monitor metric_snapshots for sudden changes:

```typescript
// Compare today's metrics to 7-day moving average
// If any metric deviates by >2 standard deviations:
//   - Create urgent recommendation
//   - Notify immediately
//   - "Alert: Your organic traffic dropped 40% today — possible indexing issue"
```

### 8C. Webhook Integrations

**New file:** `apps/web/src/app/api/webhooks/outgoing/route.ts`

Let users configure outgoing webhooks for any event type:
- POST to their Slack/Discord/Zapier when recommendations are created
- POST when actions are executed
- POST on anomalies

---

## Implementation Sequence

```
Phase 1 (Foundation)          ← Start here
  ├─ 1A. CI/CD Pipeline
  ├─ 1B. Sentry
  ├─ 1C. Health endpoints
  └─ 1D. XSS + Schema fixes   ← DONE

Phase 2 (Autonomy Level 3)    ← Primary initiative
  ├─ 2A. New executors (Ads)
  ├─ 2B. Execution safety
  ├─ 2C. Notifications (table + email)
  ├─ 2D. Execution dashboard
  └─ 2E. Action type expansion

Phase 3 (Outcome Loop)
  ├─ 3A. Confidence feedback
  ├─ 3B. Multi-window outcomes
  ├─ 3C. Source quality scoring
  ├─ 3D. User feedback
  └─ 3E. Outcome visibility

Phase 4 (Notifications)
  ├─ 4A. Email digest
  ├─ 4B. In-app notifications
  └─ 4C. Slack (future)

Phase 5 (Cost Optimization)
  ├─ 5A. Model routing
  ├─ 5B. Token tracking
  └─ 5C. Smart fallback

Phase 6 (SMB Experience)
  ├─ 6A. First-run flow
  ├─ 6B. Weekly summary
  ├─ 6C. One-click actions
  └─ 6D. Mobile responsive

Phase 7 (Moat Features)
  ├─ 7A. Playbook system
  ├─ 7B. GEO visibility
  ├─ 7C. MCP client mode
  └─ 7D. Cross-brand benchmarks

Phase 8 (Real-Time)
  ├─ 8A. Event-driven trends
  ├─ 8B. Anomaly detection
  └─ 8C. Webhook integrations
```

---

## Key Metrics to Track

| Metric | Target | Why |
|--------|--------|-----|
| Recommendations accepted (%) | >60% | Signal quality — are we recommending useful things? |
| Calibration error | <0.10 | Confidence accuracy — do our confidence scores match reality? |
| Avg outcome delta | >0 | Impact — do accepted recommendations actually improve metrics? |
| Actions auto-executed (%) | >30% (for brands with auto-execute on) | Trust — are we confident enough to act autonomously? |
| Time to first recommendation | <5 minutes | Onboarding — how fast does a new user see value? |
| Daily active users | — | Engagement — are users coming back? |
| API cost per recommendation | Decreasing trend | Efficiency — are we getting smarter per dollar? |
| Cross-brand signal hit rate | >50% | Network effect — do signals from brand A help brand B? |
