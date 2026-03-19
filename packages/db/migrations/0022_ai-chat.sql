-- AI Chat: conversations and messages

CREATE TYPE "public"."chat_message_role" AS ENUM('user', 'assistant', 'system');

CREATE TABLE IF NOT EXISTS "chat_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "title" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "chat_conversations"("id") ON DELETE cascade,
  "role" "chat_message_role" NOT NULL,
  "content" text NOT NULL,
  "tool_calls" jsonb,
  "tool_results" jsonb,
  "tokens_used" integer,
  "duration_ms" integer,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_brand ON chat_conversations (brand_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_user ON chat_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages (conversation_id);
