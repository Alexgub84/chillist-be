CREATE TYPE "public"."ai_feature_type" AS ENUM('item_suggestions');--> statement-breakpoint
CREATE TYPE "public"."ai_usage_status" AS ENUM('success', 'partial', 'error');--> statement-breakpoint
CREATE TABLE "ai_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"feature_type" "ai_feature_type" NOT NULL,
	"plan_id" uuid,
	"user_id" uuid,
	"provider" varchar(50) NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"lang" varchar(10),
	"status" "ai_usage_status" NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"total_tokens" integer,
	"estimated_cost" numeric(10, 6),
	"duration_ms" integer NOT NULL,
	"prompt_length" integer,
	"result_count" integer,
	"error_message" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_plan_id_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id") ON DELETE set null ON UPDATE no action;