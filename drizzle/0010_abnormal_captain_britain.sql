CREATE TYPE "public"."join_request_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "participant_join_requests" (
	"request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"supabase_user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"last_name" varchar(255) NOT NULL,
	"contact_phone" varchar(50) NOT NULL,
	"contact_email" varchar(255),
	"display_name" varchar(255),
	"adults_count" integer,
	"kids_count" integer,
	"food_preferences" text,
	"allergies" text,
	"notes" text,
	"status" "join_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "join_request_plan_user_unique" UNIQUE("plan_id","supabase_user_id")
);
--> statement-breakpoint
ALTER TABLE "participant_join_requests" ADD CONSTRAINT "participant_join_requests_plan_id_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id") ON DELETE cascade ON UPDATE no action;