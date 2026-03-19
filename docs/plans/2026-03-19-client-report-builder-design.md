# Client Report Builder — Design Document

**Date:** 2026-03-19
**Status:** Approved

## Overview

Full-featured client report builder for QuadBot. Generates branded PDF executive reports with AI-written summaries, sends via email (Resend), supports manual + scheduled generation.

## Architecture

### DB: `client_reports` table + `report_schedules` table

- `client_reports`: id, brand_id, title, period_start, period_end, status (generating/completed/failed), report_data (JSONB snapshot), created_by, created_at
- `report_schedules`: id, brand_id, frequency (weekly/monthly), recipient_emails (JSONB), next_run_at, is_active, created_at

### PDF Generation: `pdfkit` (server-side)

- Lightweight, no browser dependency, serverless-friendly
- Structured layout: cover page, sections with headers, metric tables, summary text
- Returns PDF as buffer/stream

### Report Sections (Executive Template)

1. Cover Page — Brand name, period, date, QuadBot branding
2. Executive Summary — AI-generated 3-4 sentences via Claude
3. KPI Dashboard — Key metrics with period-over-period deltas
4. Recommendations & Actions — What was recommended, approval rate, actions executed
5. Outcomes & Impact — Measured deltas, ROI indicators
6. Content Production — Artifacts created, publish status
7. Outreach Performance — Campaign stats (sent/open/click/reply)
8. AI Insights — Active signals, cross-brand learnings
9. Next Period Outlook — Top pending recommendations

### API Endpoints

- `POST /api/brands/[id]/reports/generate` — Aggregate data + generate PDF + optionally email
- `GET /api/brands/[id]/reports` — List reports
- `GET /api/brands/[id]/reports/[rid]` — Get report + download PDF
- `DELETE /api/brands/[id]/reports/[rid]` — Delete report
- `PUT /api/brands/[id]/reports/schedule` — Create/update schedule

### UI

- Reports page at `/brands/[id]/reports` — List + Generate button
- Report config modal — Date range, title, recipient emails
- "Reports" nav item added to BrandNav

### Worker Job

- New `generate_client_report` job type
- Handles data aggregation, AI summary, PDF generation, email delivery
- Added to job trigger dropdown

## Implementation Workstreams

1. **DB + Migration** — Schema tables, migration 0023
2. **PDF Generator** — pdfkit-based report generator module
3. **API Routes** — Generate, list, get, delete, schedule endpoints
4. **UI** — Reports page, config modal, nav integration
5. **Worker + Email** — Job type registration, Resend email delivery
