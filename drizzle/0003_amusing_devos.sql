ALTER TABLE "participants" ADD COLUMN "invite_token" varchar(64);--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_invite_token_unique" UNIQUE("invite_token");