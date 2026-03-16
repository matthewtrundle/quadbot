# Auto Mode + Bug Fixes Design

**Date**: 2026-03-15
**Status**: Approved

## Overview

Three changes: fix outcome collector status filter bug, add GSC metric snapshot collection, and introduce `auto` brand mode for hands-off operation.

## Bug Fix 1: Outcome Collector Status Filter

**File**: `apps/worker/src/jobs/outcome-collector.ts` line 43

**Problem**: Filters for `executed_stub` only, missing actions with `executed` status (real executor results like github-publish).

**Fix**: Change to `inArray(actionDrafts.status, ['executed', 'executed_stub'])`.

## Bug Fix 2: GSC Metric Snapshots Missing

**File**: `apps/worker/src/jobs/metric-snapshot-collector.ts`

**Problem**: Only collects GA4 and Ads metrics. GSC has a TODO comment. No snapshots = no outcome deltas.

**Fix**: Add GSC collection block using existing `getValidAccessToken` + GSC API. Write 4 metrics: `total_clicks`, `total_impressions`, `avg_ctr`, `avg_position` with source `gsc`.

## Feature: Auto Mode

### Mode Behavior

| Mode    | Recommendations | Action Drafts | Auto-Approve                      | Execution         |
| ------- | --------------- | ------------- | --------------------------------- | ----------------- |
| observe | Yes             | No            | No                                | No                |
| assist  | Yes             | Yes           | Only via execution_rules          | Yes (if approved) |
| auto    | Yes             | Yes           | Yes (safe types, low/medium risk) | Yes               |

### Auto-Approve Allowlist

These action types auto-approve in `auto` mode:

- `github-publish`, `content-publisher`, `gsc-index-request`, `gsc-inspection`, `gsc-sitemap-notify`, `update_content`, `update_meta`, `publish_post`

### Hard Blocklist (always manual)

- `flag_for_review` — human review items
- `ads-*` — anything Google Ads (money involved)
- `general` — catch-all unknown types

### Risk Gate

- `low` and `medium` risk: auto-approve in auto mode
- `high` risk: always requires manual approval

### Files Changed

1. DB migration: `ALTER TYPE mode ADD VALUE 'auto'`
2. `packages/db/src/schema.ts` — mode enum
3. `packages/shared/src/schemas/brands.ts` — Zod schemas
4. `apps/worker/src/jobs/action-draft-generator.ts` — allow auto mode, add auto-approve logic
5. `apps/worker/src/execution-safety.ts` — accept auto mode
6. `apps/worker/src/jobs/outcome-collector.ts` — fix status filter
7. `apps/worker/src/jobs/metric-snapshot-collector.ts` — add GSC collection
8. UI settings form — add auto option
9. Tests — update validation, add auto-mode cases
