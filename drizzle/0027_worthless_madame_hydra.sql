ALTER TABLE "ai_usage_logs" ADD COLUMN "prompt_text" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "error_type" text;--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "finish_reason" varchar(50);--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD COLUMN "raw_response_text" text;