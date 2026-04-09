CREATE TABLE IF NOT EXISTS "chatbot_ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid,
	"plan_id" uuid,
	"provider" text NOT NULL,
	"model_id" text NOT NULL,
	"lang" text,
	"chat_type" text NOT NULL CHECK (chat_type IN ('dm', 'group')),
	"message_index" integer NOT NULL,
	"step_count" integer NOT NULL DEFAULT 1,
	"tool_calls" jsonb NOT NULL DEFAULT '[]',
	"tool_call_count" integer NOT NULL DEFAULT 0,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"estimated_cost" numeric(10, 6),
	"duration_ms" integer NOT NULL,
	"status" text NOT NULL CHECK (status IN ('success', 'error')),
	"error_message" text,
	"created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_ai_usage_session
  ON chatbot_ai_usage (session_id);

CREATE INDEX IF NOT EXISTS idx_chatbot_ai_usage_user
  ON chatbot_ai_usage (user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_chatbot_ai_usage_created
  ON chatbot_ai_usage (created_at);
