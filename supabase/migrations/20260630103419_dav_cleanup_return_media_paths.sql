/*
# Delete After Viewing — Cleanup function returns deleted media paths

## Purpose
Updates the existing `cleanup_dav_messages` function so it also returns the
`media_path` of every message row it permanently deletes. The application
layer needs these paths to remove the corresponding objects from Supabase
Storage (the database function cannot touch Storage). The function signature
changes from `TABLE(hidden_count, deleted_count)` to
`TABLE(hidden_count, deleted_count, deleted_media_paths text[])`.

## Changes
- DROPs the old `cleanup_dav_messages(uuid, uuid)` and recreates with the
  new 3-column return shape (required because Postgres forbids changing
  OUT parameter types via CREATE OR REPLACE).
- Adds a `v_deleted_media text[]` accumulator.
- Before deleting a message row, captures its `media_path` (if any) into
  the accumulator.
- Returns the accumulator as the third column `deleted_media_paths`.
- All other behavior (hide viewed messages for participants not inside,
  permanent delete only when nobody inside AND not saved) is unchanged.

## Security
- No new tables, columns, or policies. Function remains SECURITY DEFINER,
  granted to authenticated.

## Notes
- Idempotent and safe to re-run (DROP IF EXISTS + CREATE).
- Saved messages are still never auto-deleted.
- FKs on message_deletions / message_user_views / message_reactions are
  CASCADE, so deleting the message row cleans up those tables automatically.
*/

DROP FUNCTION IF EXISTS public.cleanup_dav_messages(uuid, uuid);

CREATE FUNCTION public.cleanup_dav_messages(p_conv uuid, p_triggering_user uuid)
RETURNS TABLE(hidden_count bigint, deleted_count bigint, deleted_media_paths text[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hidden bigint := 0;
  v_deleted bigint := 0;
  v_row_count bigint;
  v_msg record;
  v_participant uuid;
  v_anyone_inside boolean;
  v_is_saved boolean;
  v_deleted_media text[] := ARRAY[]::text[];
BEGIN
  FOR v_msg IN
    SELECT m.id, m.conversation_id, m.sender_id, m.media_path
    FROM public.messages m
    WHERE m.conversation_id = p_conv
      AND m.disappear_after_view = true
      AND m.deleted_for_all = false
      AND EXISTS (
        SELECT 1
        FROM public.message_user_views muv
        WHERE muv.message_id = m.id
          AND muv.user_id <> m.sender_id
      )
  LOOP
    FOR v_participant IN
      SELECT u FROM (VALUES
        ((SELECT user1_id FROM public.conversations WHERE id = p_conv)),
        ((SELECT user2_id FROM public.conversations WHERE id = p_conv))
      ) AS t(u)
      WHERE u IS NOT NULL
    LOOP
      IF NOT EXISTS (
        SELECT 1
        FROM public.active_conversations ac
        WHERE ac.conversation_id = p_conv
          AND ac.user_id = v_participant
      ) THEN
        INSERT INTO public.message_deletions (message_id, user_id, deleted_for_all)
        VALUES (v_msg.id, v_participant, false)
        ON CONFLICT (message_id, user_id) DO NOTHING;
      END IF;
    END LOOP;

    SELECT EXISTS (
      SELECT 1
      FROM public.active_conversations ac
      WHERE ac.conversation_id = p_conv
        AND ac.user_id IN (
          SELECT user1_id FROM public.conversations WHERE id = p_conv
          UNION
          SELECT user2_id FROM public.conversations WHERE id = p_conv
        )
    ) INTO v_anyone_inside;

    SELECT EXISTS (
      SELECT 1 FROM public.message_saves ms WHERE ms.message_id = v_msg.id
    ) INTO v_is_saved;

    IF v_anyone_inside = false AND v_is_saved = false THEN
      IF v_msg.media_path IS NOT NULL THEN
        v_deleted_media := array_append(v_deleted_media, v_msg.media_path);
      END IF;
      DELETE FROM public.messages WHERE id = v_msg.id;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_deleted := v_deleted + v_row_count;
    END IF;
  END LOOP;

  SELECT count(*) INTO v_hidden
  FROM public.message_deletions md
  JOIN public.messages m ON m.id = md.message_id
  WHERE m.conversation_id = p_conv
    AND m.disappear_after_view = true;

  RETURN QUERY SELECT v_hidden, v_deleted, v_deleted_media;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_dav_messages(uuid, uuid) TO authenticated;
