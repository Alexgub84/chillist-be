CREATE TYPE "public"."item_quantity_source" AS ENUM('estimated', 'participant_reported');

ALTER TABLE "plans" ADD COLUMN "item_quantity_source" "public"."item_quantity_source";
