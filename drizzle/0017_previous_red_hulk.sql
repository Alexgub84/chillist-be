CREATE TABLE "participant_expenses" (
	"expense_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_expenses" ADD CONSTRAINT "participant_expenses_participant_id_participants_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("participant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_expenses" ADD CONSTRAINT "participant_expenses_plan_id_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id") ON DELETE cascade ON UPDATE no action;