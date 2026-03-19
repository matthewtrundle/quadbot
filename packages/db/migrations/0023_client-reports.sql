-- Client Reports: report generation and scheduling

CREATE TYPE "public"."report_status" AS ENUM('generating', 'completed', 'failed');
CREATE TYPE "public"."report_frequency" AS ENUM('weekly', 'monthly');

CREATE TABLE IF NOT EXISTS "client_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "title" varchar(500) NOT NULL,
  "period_start" timestamptz NOT NULL,
  "period_end" timestamptz NOT NULL,
  "status" "report_status" NOT NULL DEFAULT 'generating',
  "report_data" jsonb,
  "executive_summary" text,
  "pdf_base64" text,
  "recipient_emails" jsonb,
  "generated_by" text,
  "sent_at" timestamptz,
  "completed_at" timestamptz,
  "error_message" text,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "report_schedules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "frequency" "report_frequency" NOT NULL,
  "recipient_emails" jsonb NOT NULL,
  "next_run_at" timestamptz NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_client_reports_brand ON client_reports (brand_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_brand ON report_schedules (brand_id);
