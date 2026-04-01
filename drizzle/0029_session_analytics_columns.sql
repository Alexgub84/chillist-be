ALTER TABLE "ai_usage_logs" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "item_changes" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "plan_invites" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "participant_join_requests" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_notifications" ADD COLUMN "session_id" uuid;--> statement-breakpoint
CREATE INDEX "ai_usage_logs_session_id_idx" ON "ai_usage_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "item_changes_session_id_idx" ON "item_changes" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "plan_invites_session_id_idx" ON "plan_invites" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "participant_join_requests_session_id_idx" ON "participant_join_requests" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "whatsapp_notifications_session_id_idx" ON "whatsapp_notifications" USING btree ("session_id");
