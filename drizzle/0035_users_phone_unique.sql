-- Migration: Add partial unique index on users.phone
-- This ensures no two users can have the same non-null phone number.
-- Null phones are allowed (multiple users can have phone = NULL).
-- IMPORTANT: Run dedup script first to clear existing duplicates before deploying.

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique_idx 
ON users (phone) 
WHERE phone IS NOT NULL;
