-- Plan tag taxonomy is now served from a static JSON file (src/data/plan-creation-tags.json).
-- These two tables are no longer needed.
DROP TABLE IF EXISTS "plan_tag_options";
--> statement-breakpoint
DROP TABLE IF EXISTS "plan_tag_versions";
