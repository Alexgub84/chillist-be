CREATE TYPE "public"."whatsapp_notification_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_notification_type" AS ENUM('invitation_sent', 'join_request_pending', 'join_request_approved');--> statement-breakpoint
CREATE TABLE "whatsapp_notifications" (
	"notification_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"recipient_phone" varchar(50) NOT NULL,
	"recipient_participant_id" uuid,
	"type" "whatsapp_notification_type" NOT NULL,
	"status" "whatsapp_notification_status" NOT NULL,
	"message_id" varchar(255),
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_plan_id_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("plan_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_notifications" ADD CONSTRAINT "whatsapp_notifications_recipient_participant_id_participants_participant_id_fk" FOREIGN KEY ("recipient_participant_id") REFERENCES "public"."participants"("participant_id") ON DELETE set null ON UPDATE no action;