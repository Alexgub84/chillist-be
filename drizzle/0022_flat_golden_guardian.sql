ALTER TABLE "participant_join_requests" ADD COLUMN "dietary_members" jsonb;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "dietary_members" jsonb;