ALTER TABLE "items" ADD COLUMN "is_all_participants" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "all_participants_group_id" uuid;