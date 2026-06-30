/*
# Add unique constraint on active_conversations.user_id

## Purpose
A user can only be "inside" one conversation at a time. The `enterChat`
server function upserts presence with `onConflict: "user_id"`, which
requires a UNIQUE constraint on `user_id` to work. Without it, repeated
upserts create duplicate rows instead of replacing the old one.

## Changes
- Adds UNIQUE constraint `active_conversations_user_id_unique` on
  `active_conversations(user_id)`.
- Idempotent: uses DO block to check before creating.

## Security
- No policy changes. No data loss (existing rows are unaffected; the
  constraint only prevents future duplicates).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'active_conversations_user_id_unique'
      AND conrelid = 'public.active_conversations'::regclass
  ) THEN
    ALTER TABLE public.active_conversations
      ADD CONSTRAINT active_conversations_user_id_unique UNIQUE (user_id);
  END IF;
END $$;
