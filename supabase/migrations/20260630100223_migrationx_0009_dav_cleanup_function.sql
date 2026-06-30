/*
# Delete After Viewing — Cleanup Engine

## Purpose
Implements the core "Delete After Viewing" (DAV) cleanup algorithm. A DAV
message (messages.disappear_after_view = true) remains visible until the
recipient has viewed it AND a participant is no longer inside the
conversation. Visibility is evaluated independently per participant.

## Rules Enforced
1. Before view: nobody loses the message.
2. After view: a participant NOT inside the conversation immediately loses
   the message (a message_deletions row is inserted for that user).
3. A participant who IS inside keeps the message.
4. When NO participant can see the message AND it is not saved, the message
   row is permanently deleted.

## New Database Objects
- public.dav_message_visible_for(p_msg uuid, p_user uuid) -> boolean
  SECURITY DEFINER helper returning TRUE if p_user should currently see
  DAV message p_msg.
- public.cleanup_dav_messages(p_conv uuid, p_triggering_user uuid)
  -> TABLE(hidden_count bigint, deleted_count bigint)
  SECURITY DEFINER function that hides viewed DAV messages for participants
  not currently inside, and permanently deletes messages nobody can see.

## Security Changes
- active_conversations: adds SELECT policy "Participants can read presence"
  so both participants can see each other's presence for realtime + cleanup.

## Notes
- Both functions are SECURITY DEFINER and idempotent.
- Saved messages (message_saves) are NEVER auto-deleted.
- Storage media cleanup is handled by the application's leave/purge flow.
*/

-- 1. Presence read policy on active_conversations
DROP POLICY IF EXISTS "Participants can read presence" ON public.active_conversations;
CREATE POLICY "Participants can read presence"
ON public.active_conversations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.conversation_status cs
    WHERE cs.conversation_id = active_conversations.conversation_id
      AND cs.user_id = auth.uid()
  )
);

-- 2. Helper: is a DAV message currently visible for a given user?
CREATE OR REPLACE FUNCTION public.dav_message_visible_for(p_msg uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT CASE
    WHEN NOT m.disappear_after_view THEN TRUE
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.message_user_views muv
      JOIN public.messages msg ON msg.id = muv.message_id
      JOIN public.conversations c ON c.id = msg.conversation_id
      WHERE muv.message_id = p_msg
        AND muv.user_id <> msg.sender_id
        AND muv.user_id IN (c.user1_id, c.user2_id)
    ) THEN TRUE
    WHEN EXISTS (
      SELECT 1
      FROM public.active_conversations ac
      WHERE ac.conversation_id = m.conversation_id
        AND ac.user_id = p_user
    ) THEN TRUE
    ELSE FALSE
  END
  FROM public.messages m
  WHERE m.id = p_msg;
$$;

GRANT EXECUTE ON FUNCTION public.dav_message_visible_for(uuid, uuid) TO authenticated;

-- 3. Core cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_dav_messages(p_conv uuid, p_triggering_user uuid)
RETURNS TABLE(hidden_count bigint, deleted_count bigint)
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

  RETURN QUERY SELECT v_hidden, v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_dav_messages(uuid, uuid) TO authenticated;

-- 4. Index to speed up the cleanup scan
CREATE INDEX IF NOT EXISTS messages_dav_conv_idx
  ON public.messages (conversation_id)
  WHERE disappear_after_view = true;
