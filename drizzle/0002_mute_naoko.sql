ALTER TABLE "item_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "item_assignments" CASCADE;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "display_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "last_name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "participants" ALTER COLUMN "contact_phone" SET NOT NULL;