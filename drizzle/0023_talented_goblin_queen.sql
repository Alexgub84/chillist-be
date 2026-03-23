ALTER TABLE "items" ALTER COLUMN "category" SET DATA TYPE text;--> statement-breakpoint
UPDATE "items" SET "category" = 'group_equipment' WHERE "category" = 'equipment';--> statement-breakpoint
DROP TYPE "public"."item_category";--> statement-breakpoint
CREATE TYPE "public"."item_category" AS ENUM('group_equipment', 'personal_equipment', 'food');--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "category" SET DATA TYPE "public"."item_category" USING "category"::"public"."item_category";