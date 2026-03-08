CREATE TYPE "public"."item_change_type" AS ENUM('created', 'updated');--> statement-breakpoint
CREATE TABLE "item_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"change_type" "item_change_type" NOT NULL,
	"changes" jsonb NOT NULL,
	"changed_by_user_id" uuid,
	"changed_by_participant_id" uuid,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "item_changes" ADD CONSTRAINT "item_changes_item_id_items_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("item_id") ON DELETE cascade ON UPDATE no action;