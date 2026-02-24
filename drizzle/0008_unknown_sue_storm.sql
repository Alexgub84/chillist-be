CREATE TYPE "public"."rsvp_status" AS ENUM('pending', 'confirmed', 'not_sure');--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "rsvp_status" "rsvp_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "last_activity_at" timestamp with time zone;