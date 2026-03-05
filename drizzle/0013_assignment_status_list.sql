-- Step 1: Add assignment_status_list column (nullable initially)
ALTER TABLE "items" ADD COLUMN "assignment_status_list" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint

-- Step 2: Backfill unassigned items (no participant, not all-participants)
UPDATE "items"
SET "assignment_status_list" = '[]'::jsonb
WHERE "assigned_participant_id" IS NULL
  AND "is_all_participants" = false;--> statement-breakpoint

-- Step 3: Backfill single-assigned items (has participant, not all-participants)
UPDATE "items"
SET "assignment_status_list" = json_build_array(
  json_build_object('participantId', "assigned_participant_id", 'status', "status")
)::jsonb
WHERE "assigned_participant_id" IS NOT NULL
  AND "is_all_participants" = false;--> statement-breakpoint

-- Step 4: Backfill all-participants groups — consolidate duplicates into one item per group
-- For each group, pick the item with the earliest created_at as the "keeper",
-- aggregate all copies' (participant, status) into the keeper's assignment_status_list,
-- then delete the non-keeper copies.
WITH group_assignments AS (
  SELECT
    "all_participants_group_id",
    json_agg(
      json_build_object('participantId', "assigned_participant_id", 'status', "status")
    )::jsonb AS agg_assignments,
    (array_agg("item_id" ORDER BY "created_at" ASC))[1] AS keeper_id
  FROM "items"
  WHERE "is_all_participants" = true
    AND "all_participants_group_id" IS NOT NULL
    AND "assigned_participant_id" IS NOT NULL
  GROUP BY "all_participants_group_id"
)
UPDATE "items" i
SET "assignment_status_list" = ga.agg_assignments
FROM group_assignments ga
WHERE i."item_id" = ga.keeper_id;--> statement-breakpoint

-- Step 5: Delete non-keeper copies from all-participants groups
WITH group_keepers AS (
  SELECT
    "all_participants_group_id",
    (array_agg("item_id" ORDER BY "created_at" ASC))[1] AS keeper_id
  FROM "items"
  WHERE "is_all_participants" = true
    AND "all_participants_group_id" IS NOT NULL
    AND "assigned_participant_id" IS NOT NULL
  GROUP BY "all_participants_group_id"
)
DELETE FROM "items" i
USING group_keepers gk
WHERE i."all_participants_group_id" = gk."all_participants_group_id"
  AND i."item_id" != gk.keeper_id
  AND i."is_all_participants" = true;--> statement-breakpoint

-- Step 6: Set NOT NULL constraint
ALTER TABLE "items" ALTER COLUMN "assignment_status_list" SET NOT NULL;--> statement-breakpoint

-- Step 7: Drop old columns
ALTER TABLE "items" DROP COLUMN IF EXISTS "assigned_participant_id";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "all_participants_group_id";
