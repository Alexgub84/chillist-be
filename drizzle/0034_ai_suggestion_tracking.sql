CREATE TYPE "public"."item_source" AS ENUM('manual', 'ai_suggestion');
CREATE TYPE "public"."ai_suggestion_status" AS ENUM('suggested', 'accepted');

CREATE TABLE "ai_suggestions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ai_usage_log_id" uuid REFERENCES "ai_usage_logs"("id") ON DELETE SET NULL,
  "plan_id" uuid NOT NULL REFERENCES "plans"("plan_id") ON DELETE CASCADE,
  "name" varchar(255) NOT NULL,
  "category" "item_category" NOT NULL,
  "subcategory" varchar(255),
  "quantity" numeric(10, 2) NOT NULL,
  "unit" "unit" NOT NULL,
  "reason" text,
  "status" "ai_suggestion_status" NOT NULL DEFAULT 'suggested',
  "item_id" uuid REFERENCES "items"("item_id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "ai_suggestions_plan_id_idx" ON "ai_suggestions" ("plan_id");
CREATE INDEX "ai_suggestions_ai_usage_log_id_idx" ON "ai_suggestions" ("ai_usage_log_id");

ALTER TABLE "items"
  ADD COLUMN "source" "item_source" NOT NULL DEFAULT 'manual',
  ADD COLUMN "ai_suggestion_id" uuid REFERENCES "ai_suggestions"("id") ON DELETE SET NULL;
