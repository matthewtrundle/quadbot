-- Outreach Module: Email Outreach System
-- Enums
DO $$ BEGIN
  CREATE TYPE "public"."outreach_account_status" AS ENUM('active', 'paused', 'disabled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'active', 'paused', 'completed', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."campaign_reply_mode" AS ENUM('manual', 'ai_draft_approve', 'ai_auto_reply');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."campaign_lead_status" AS ENUM('pending', 'scheduled', 'sending', 'sent', 'replied', 'completed', 'bounced', 'unsubscribed', 'error');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."outreach_email_status" AS ENUM('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."outreach_message_direction" AS ENUM('outbound', 'inbound');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "public"."conversation_status" AS ENUM('active', 'resolved', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Tables
CREATE TABLE IF NOT EXISTS "outreach_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "email" varchar(255) NOT NULL,
  "from_name" varchar(255) NOT NULL,
  "resend_api_key_encrypted" text NOT NULL,
  "daily_limit" integer DEFAULT 50 NOT NULL,
  "sent_today" integer DEFAULT 0 NOT NULL,
  "sent_today_date" varchar(10),
  "status" "outreach_account_status" DEFAULT 'active' NOT NULL,
  "last_used_at" timestamp with time zone,
  "total_sent" integer DEFAULT 0 NOT NULL,
  "total_bounced" integer DEFAULT 0 NOT NULL,
  "total_complained" integer DEFAULT 0 NOT NULL,
  "bounce_rate" real DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "lead_lists" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "name" varchar(255) NOT NULL,
  "description" text,
  "original_filename" varchar(500),
  "total_rows" integer DEFAULT 0 NOT NULL,
  "imported_count" integer DEFAULT 0 NOT NULL,
  "duplicate_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "column_mapping" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "lead_list_id" uuid REFERENCES "lead_lists"("id") ON DELETE set null,
  "email" varchar(255) NOT NULL,
  "first_name" varchar(255),
  "last_name" varchar(255),
  "company" varchar(255),
  "title" varchar(255),
  "linkedin_url" varchar(500),
  "phone" varchar(50),
  "industry" varchar(255),
  "employee_count" varchar(50),
  "location" varchar(255),
  "custom_fields" jsonb DEFAULT '{}'::jsonb,
  "is_unsubscribed" boolean DEFAULT false NOT NULL,
  "is_bounced" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "name" varchar(255) NOT NULL,
  "description" text,
  "status" "campaign_status" DEFAULT 'draft' NOT NULL,
  "reply_mode" "campaign_reply_mode" DEFAULT 'manual' NOT NULL,
  "ai_reply_context" text,
  "ai_reply_tone" varchar(100),
  "timezone" varchar(100) DEFAULT 'America/Chicago' NOT NULL,
  "send_days" jsonb DEFAULT '[1,2,3,4,5]'::jsonb,
  "send_window_start" varchar(5) DEFAULT '09:00' NOT NULL,
  "send_window_end" varchar(5) DEFAULT '17:00' NOT NULL,
  "daily_send_limit" integer DEFAULT 50 NOT NULL,
  "min_spacing_seconds" integer DEFAULT 60 NOT NULL,
  "max_spacing_seconds" integer DEFAULT 300 NOT NULL,
  "sent_today" integer DEFAULT 0 NOT NULL,
  "sent_today_date" varchar(10),
  "total_sent" integer DEFAULT 0 NOT NULL,
  "total_leads" integer DEFAULT 0 NOT NULL,
  "started_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "campaign_sequence_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "step_order" integer NOT NULL,
  "delay_days" integer DEFAULT 1 NOT NULL,
  "subject_template" text NOT NULL,
  "body_template" text NOT NULL,
  "is_reply_to_previous" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "campaign_leads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "outreach_account_id" uuid REFERENCES "outreach_accounts"("id") ON DELETE set null,
  "current_step" integer DEFAULT 0 NOT NULL,
  "status" "campaign_lead_status" DEFAULT 'pending' NOT NULL,
  "next_send_at" timestamp with time zone,
  "paused_at" timestamp with time zone,
  "pause_reason" text,
  "enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_sent_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "outreach_emails" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "campaign_lead_id" uuid NOT NULL REFERENCES "campaign_leads"("id") ON DELETE cascade,
  "outreach_account_id" uuid NOT NULL REFERENCES "outreach_accounts"("id") ON DELETE cascade,
  "step_order" integer NOT NULL,
  "from_email" varchar(255) NOT NULL,
  "from_name" varchar(255) NOT NULL,
  "to_email" varchar(255) NOT NULL,
  "subject" text NOT NULL,
  "body_html" text NOT NULL,
  "body_text" text,
  "resend_message_id" varchar(255),
  "message_id_header" varchar(500),
  "in_reply_to_header" varchar(500),
  "status" "outreach_email_status" DEFAULT 'queued' NOT NULL,
  "sent_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "opened_at" timestamp with time zone,
  "clicked_at" timestamp with time zone,
  "bounced_at" timestamp with time zone,
  "complained_at" timestamp with time zone,
  "open_count" integer DEFAULT 0 NOT NULL,
  "click_count" integer DEFAULT 0 NOT NULL,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "outreach_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "campaign_id" uuid NOT NULL REFERENCES "campaigns"("id") ON DELETE cascade,
  "lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
  "campaign_lead_id" uuid REFERENCES "campaign_leads"("id") ON DELETE set null,
  "status" "conversation_status" DEFAULT 'active' NOT NULL,
  "last_message_at" timestamp with time zone,
  "message_count" integer DEFAULT 0 NOT NULL,
  "ai_draft_pending" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "outreach_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "conversation_id" uuid NOT NULL REFERENCES "outreach_conversations"("id") ON DELETE cascade,
  "direction" "outreach_message_direction" NOT NULL,
  "subject" text,
  "body_text" text,
  "body_html" text,
  "outreach_email_id" uuid REFERENCES "outreach_emails"("id") ON DELETE set null,
  "from_email" varchar(255),
  "resend_inbound_id" varchar(255),
  "raw_headers" jsonb,
  "ai_generated" boolean DEFAULT false NOT NULL,
  "ai_approved" boolean,
  "ai_approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "idx_outreach_accounts_brand_email" ON "outreach_accounts" ("brand_id", "email");
CREATE INDEX IF NOT EXISTS "idx_outreach_accounts_brand" ON "outreach_accounts" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_accounts_brand_status" ON "outreach_accounts" ("brand_id", "status");

CREATE INDEX IF NOT EXISTS "idx_lead_lists_brand" ON "lead_lists" ("brand_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_leads_brand_email" ON "leads" ("brand_id", "email");
CREATE INDEX IF NOT EXISTS "idx_leads_lead_list" ON "leads" ("lead_list_id");

CREATE INDEX IF NOT EXISTS "idx_campaigns_brand" ON "campaigns" ("brand_id");
CREATE INDEX IF NOT EXISTS "idx_campaigns_brand_status" ON "campaigns" ("brand_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_campaign_steps_campaign_order" ON "campaign_sequence_steps" ("campaign_id", "step_order");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_campaign_leads_campaign_lead" ON "campaign_leads" ("campaign_id", "lead_id");
CREATE INDEX IF NOT EXISTS "idx_campaign_leads_status_next_send" ON "campaign_leads" ("status", "next_send_at");
CREATE INDEX IF NOT EXISTS "idx_campaign_leads_campaign_status" ON "campaign_leads" ("campaign_id", "status");

CREATE INDEX IF NOT EXISTS "idx_outreach_emails_resend_id" ON "outreach_emails" ("resend_message_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_emails_message_id" ON "outreach_emails" ("message_id_header");
CREATE INDEX IF NOT EXISTS "idx_outreach_emails_to_email" ON "outreach_emails" ("to_email");
CREATE INDEX IF NOT EXISTS "idx_outreach_emails_campaign" ON "outreach_emails" ("campaign_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_emails_brand" ON "outreach_emails" ("brand_id");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_outreach_conversations_campaign_lead" ON "outreach_conversations" ("campaign_id", "lead_id");
CREATE INDEX IF NOT EXISTS "idx_outreach_conversations_brand" ON "outreach_conversations" ("brand_id");

CREATE INDEX IF NOT EXISTS "idx_outreach_messages_conversation" ON "outreach_messages" ("conversation_id");
