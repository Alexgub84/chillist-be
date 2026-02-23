CREATE TYPE "public"."invite_send_status" AS ENUM('pending', 'sent', 'failed', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('pending', 'invited', 'accepted');--> statement-breakpoint
CREATE TABLE "guest_profiles" (
	"guest_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"phone" varchar(50) NOT NULL,
	"email" varchar(255),
	"food_preferences" text,
	"allergies" text,
	"adults_count" integer,
	"kids_count" integer,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan_invites" (
	"invite_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"status" "invite_send_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_details" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"food_preferences" text,
	"allergies" text,
	"default_equipment" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "user_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "guest_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "invite_status" "invite_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "created_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_invites" ADD CONSTRAINT "plan_invites_plan_id_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_invites" ADD CONSTRAINT "plan_invites_participant_id_participants_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("participant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_guest_profile_id_guest_profiles_guest_id_fk" FOREIGN KEY ("guest_profile_id") REFERENCES "public"."guest_profiles"("guest_id") ON DELETE set null ON UPDATE no action;