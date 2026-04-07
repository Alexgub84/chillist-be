UPDATE users u
SET phone = p.contact_phone
FROM (
  SELECT DISTINCT ON (user_id)
    user_id,
    contact_phone
  FROM participants
  WHERE user_id IS NOT NULL
    AND contact_phone IS NOT NULL
  ORDER BY user_id, created_at DESC
) p
WHERE u.user_id = p.user_id
  AND u.phone IS NULL;
