CREATE TABLE IF NOT EXISTS "plan_tag_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(20) NOT NULL,
	"description" text,
	"tier_labels" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_tag_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "plan_tag_options" (
	"id" text PRIMARY KEY NOT NULL,
	"version_id" uuid NOT NULL,
	"tier" smallint NOT NULL,
	"parent_id" text,
	"label" text NOT NULL,
	"emoji" text,
	"sort_order" smallint DEFAULT 0 NOT NULL,
	"mutex_group" text,
	"cross_group_rules" jsonb
);
--> statement-breakpoint
ALTER TABLE "plan_tag_options" ADD CONSTRAINT "plan_tag_options_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."plan_tag_versions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plan_tag_options" ADD CONSTRAINT "plan_tag_options_parent_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."plan_tag_options"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_tag_options_version_tier_idx" ON "plan_tag_options" USING btree ("version_id","tier");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "plan_tag_options_parent_idx" ON "plan_tag_options" USING btree ("parent_id");
