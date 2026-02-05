# Quadbot v1

AI-powered brand management system with Observe + Assist modes. Built as a pnpm monorepo with a Next.js dashboard, background worker with Claude integration, and Supabase/Redis infrastructure.

## Architecture

```
quadbot/
├── packages/
│   ├── shared/     # Zod schemas, constants, types
│   └── db/         # Drizzle ORM schema, migrations, encryption
├── apps/
│   ├── web/        # Next.js 15 dashboard (shadcn/ui)
│   └── worker/     # Queue consumer, job handlers, Claude integration
```

### Core Flow

1. **Webhook/Cron** triggers a job (enqueued to Redis)
2. **Worker** consumes the job, calls Claude with versioned prompts
3. **Recommendations** are written to the DB
4. In **Assist mode**, action drafts are generated for human approval
5. Approved actions are **stub-executed** (v1) with full execution in v2

### Modes

- **Observe**: Only generates recommendations. No action drafts.
- **Assist**: Generates recommendations AND action drafts requiring human approval.

## Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project (or local Postgres)
- Redis (local or Upstash for web)
- Anthropic API key

## Local Setup

```bash
# 1. Clone and install
git clone <repo-url> quadbot
cd quadbot
pnpm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 3. Run migrations
pnpm db:migrate

# 4. Seed prompt versions
pnpm db:seed

# 5. Build all packages
pnpm build

# 6. Start development
pnpm dev          # Starts web app (Next.js)
pnpm worker       # Starts worker (separate terminal)
```

## Database

8 core tables + 2 learning loop tables:

| Table | Purpose |
|-------|---------|
| brands | Brand config (mode, modules, guardrails) |
| brand_integrations | OAuth tokens (encrypted), API configs |
| jobs | Job queue state (status, attempts, errors) |
| recommendations | Claude-generated insights |
| action_drafts | Proposed actions for approval |
| action_executions | Execution records (stubbed in v1) |
| outcomes | Post-action metric deltas |
| prompt_versions | Versioned Claude prompts |
| prompt_performance | Prompt effectiveness scores (Phase 5) |
| execution_rules | Auto-execute rules for v2 (Phase 5) |

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/brands | List all brands |
| POST | /api/brands | Create a brand |
| PATCH | /api/brands | Update a brand |
| POST | /api/jobs/enqueue | Enqueue a job |
| POST | /api/actions/[id]/approve | Approve an action draft |
| POST | /api/actions/[id]/reject | Reject an action draft |
| POST | /api/community/post-created | Webhook: community post moderation |
| GET | /api/oauth/google/connect | Start Google OAuth flow |
| GET | /api/oauth/google/callback | Handle OAuth callback |
| POST | /api/oauth/google/disconnect | Remove Google integration |

## Worker Jobs

| Job Type | Trigger | Description |
|----------|---------|-------------|
| community_moderate_post | Webhook | Classify community posts via Claude |
| gsc_daily_digest | Cron (8 AM) | Analyze GSC data, generate SEO recs |
| trend_scan_industry | Cron (9 AM) | Scan industry trends |
| action_draft_generator | After recommendation | Generate action drafts (Assist mode) |
| outcome_collector | Cron (2 AM) | Measure post-action metric deltas |
| prompt_scorer | Cron (Sun 3 AM) | Score prompt version effectiveness |

## Testing the E2E Flow

```bash
# 1. Create a brand
curl -X POST http://localhost:3000/api/brands \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Brand", "mode": "assist"}'

# 2. Note the brand ID from response, then send a community post
curl -X POST http://localhost:3000/api/community/post-created \
  -H "Content-Type: application/json" \
  -d '{
    "brand_id": "<BRAND_ID>",
    "post_content": "Check out my amazing product at example.com!",
    "post_author": "spammer123"
  }'

# 3. Check the inbox at http://localhost:3000/brands/<BRAND_ID>/inbox
# 4. Check action drafts at http://localhost:3000/brands/<BRAND_ID>/actions
# 5. Approve an action, verify it shows as executed_stub
```

## Deployment

### Web (Vercel)

```bash
# Set environment variables in Vercel dashboard
# Build command: pnpm build --filter=@quadbot/web
# Output directory: apps/web/.next
```

### Worker (Render / Fly.io)

```bash
# Build: pnpm build --filter=@quadbot/worker
# Start: node apps/worker/dist/index.js
# Set all env vars (DATABASE_URL, REDIS_URL, ANTHROPIC_API_KEY, ENCRYPTION_KEY)
```

## Phase 5: Learning Loop

The learning loop adds three capabilities beyond the original spec:

1. **Outcome Collection**: Daily job measures metric deltas for executed recommendations
2. **Prompt Scoring**: Weekly job calculates effectiveness scores for each prompt version
3. **History Injection**: Past successes/failures are injected into Claude prompts for context

### v2 Bridge Points

- `execution_rules` table exists with `auto_execute` locked to `false`
- `action_draft_status` enum includes `executed` for real execution
- Job handler interface supports `canAutoExecute()` + `execute()` extension
