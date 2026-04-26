-- Idempotent: transform each JSONB member from {diet: X} to {diets: [X]}.
-- Members that already have `diets` are left unchanged.
UPDATE participants AS p
SET dietary_members = jsonb_set(
  p.dietary_members,
  '{members}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN m ? 'diets' THEN m
        ELSE (m - 'diet') || jsonb_build_object('diets', jsonb_build_array(m -> 'diet'))
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(p.dietary_members -> 'members') AS m
  )
)
WHERE p.dietary_members IS NOT NULL
  AND p.dietary_members ? 'members';
--> statement-breakpoint
UPDATE participant_join_requests AS j
SET dietary_members = jsonb_set(
  j.dietary_members,
  '{members}',
  (
    SELECT COALESCE(jsonb_agg(
      CASE
        WHEN m ? 'diets' THEN m
        ELSE (m - 'diet') || jsonb_build_object('diets', jsonb_build_array(m -> 'diet'))
      END
    ), '[]'::jsonb)
    FROM jsonb_array_elements(j.dietary_members -> 'members') AS m
  )
)
WHERE j.dietary_members IS NOT NULL
  AND j.dietary_members ? 'members';
