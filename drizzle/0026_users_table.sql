ALTER TABLE "user_details" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "preferred_lang" varchar(10);--> statement-breakpoint
CREATE INDEX "users_phone_idx" ON "users" USING btree ("phone");
