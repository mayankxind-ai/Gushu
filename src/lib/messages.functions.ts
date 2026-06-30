import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const messageKind = z.enum(["text", "image", "video", "file", "audio", "system"]);

export const listMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;

    // 1. Get shared conversation settings (use maybeSingle to avoid crashes if conv is deleted during refetch)
    const [convResult, settingsResult] = await Promise.all([
      supabase
        .from("conversations")
        .select("expiry_seconds")
        .eq("id", data.conversationId)
        .maybeSingle(),
      supabase
        .from("conversation_settings")
        .select("cleared_at, expiry_seconds, last_exit_at")
        .eq("conversation_id", data.conversationId)
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const conv = convResult.data as any;
    const userSettings = settingsResult.data as any;

    // If conversation settings don't exist for this user, they can't see the chat (or it will be created)
    if (!conv && !userSettings) {
      return [];
    }

    const nowString = new Date().toISOString();

    // ARCHITECTURE NOTE:
    // disappear_after_view messages use PER-USER visibility via message_deletions table.
    //   → They are always fetched (ignoring expires_at) and filtered via message_deletions below.
    //
    // Timed messages (expiry_seconds > 0) use expiry_at — a shared timestamp set by DB trigger
    //   → These are filtered with expires_at.is.null OR expires_at > now
    //
    // This dual approach avoids the bug where one user's exit hides a message for everyone.

    // Part A: Visible timed messages (non-disappear_after_view) — apply expires_at filter
    let timedQuery = supabase
      .from("messages")
      .select("*, profiles!deleted_by_id(username, display_name)")
      .eq("conversation_id", data.conversationId)
      .eq("disappear_after_view", false)
      .or(`expires_at.is.null,expires_at.gt.${nowString}`);

    if (userSettings?.cleared_at) {
      timedQuery = timedQuery.gt("created_at", userSettings.cleared_at);
    }

    timedQuery = timedQuery.order("created_at", { ascending: true }).limit(500);

    // Part B: Disappear-after-view messages — always fetch, NO expires_at filter
    // Per-user visibility is enforced exclusively via message_deletions below
    let davQuery = supabase
      .from("messages")
      .select("*, profiles!deleted_by_id(username, display_name)")
      .eq("conversation_id", data.conversationId)
      .eq("disappear_after_view", true);

    if (userSettings?.cleared_at) {
      davQuery = davQuery.gt("created_at", userSettings.cleared_at);
    }

    davQuery = davQuery.order("created_at", { ascending: true }).limit(500);


    // Fetch timed messages (expires_at filtered), disappear_after_view messages (no filter), and saved messages
    const [timedRes, davRes, savedRes] = await Promise.all([
      timedQuery,
      davQuery,
      supabase
        .from("message_saves" as any)
        .select("message_id, user_id, messages(*, profiles!deleted_by_id(username, display_name))")
        .eq("conversation_id", data.conversationId),
    ]);

    if (timedRes.error) throw new Error(timedRes.error.message);
    if (davRes.error) throw new Error(davRes.error.message);

    // Merge timed + disappear_after_view rows
    const primaryRows = [...(timedRes.data ?? []), ...(davRes.data ?? [])];
    const savedData = savedRes.data ?? [];

    // Map saved messages
    const allSavedIds = Array.from(new Set(savedData.map((s: any) => s.message_id as string)));
    const mySavedIds = savedData.filter((s: any) => s.user_id === userId).map((s: any) => s.message_id as string);

    // Combine rows and remove duplicates
    const combinedMap = new Map<string, any>();
    primaryRows.forEach((r) => combinedMap.set(r.id, r));
    
    // Add saved messages from any participant, even if they were created before a clear action.
    savedData.forEach((s: any) => {
      if (s.messages && !combinedMap.has(s.message_id)) {
        combinedMap.set(s.message_id, s.messages);
      }
    });

    const rows = Array.from(combinedMap.values()).sort((a, b) => 
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );

    // Get messages deleted for this user
    const allIds = (rows ?? []).map((r: any) => r.id as string);
    if (allIds.length === 0) return [];

    const { data: deletions } = await context.supabase
      .from("message_deletions")
      .select("message_id")
      .eq("user_id", userId)
      .in("message_id", allIds as string[]);

    const deletedForMe = new Set((deletions ?? []).map((d: any) => d.message_id as string));
    const list = (rows ?? []).filter((r: any) => !deletedForMe.has(r.id));

    // Fetch reactions for all messages
    const { data: reactionsData } = await context.supabase
      .from("message_reactions")
      .select("message_id, user_id, emoji")
      .in("message_id", allIds as string[]);

    const reactionsByMsg = new Map<string, { user_id: string; emoji: string }[]>();
    for (const r of reactionsData ?? []) {
      const arr = reactionsByMsg.get(r.message_id) ?? [];
      arr.push({ user_id: r.user_id, emoji: r.emoji });
      reactionsByMsg.set(r.message_id, arr);
    }

    // fetch replied messages for any reply_to references
    const replyIds = Array.from(new Set(list.map((r: any) => r.reply_to as string).filter(Boolean)));
    let repliedMap = new Map<string, any>();

    if (replyIds.length > 0) {
      const { data: replied } = await context.supabase
        .from("messages")
        .select("id, content, message_type, media_name, sender_id")
        .in("id", replyIds as string[]);
      const repliedList = replied ?? [];
      const senderIds = Array.from(new Set(repliedList.map((r: any) => r.sender_id as string).filter(Boolean)));
      const { data: senders } = await context.supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", senderIds);
      const senderMap = new Map((senders ?? []).map((s: any) => [s.id, s]));
      repliedMap = new Map(
        repliedList.map((m: any) => [
          m.id,
          {
            ...m,
            sender_name:
              senderMap.get(m.sender_id)?.display_name ??
              senderMap.get(m.sender_id)?.username ??
              null,
          },
        ]),
      );
    }

    return list.map((m: any) => ({
      ...m,
      is_saved: allSavedIds.includes(m.id),
      saved_by_me: mySavedIds.includes(m.id),
      reactions: reactionsByMsg.get(m.id) ?? [],
      replied_message: m.reply_to ? repliedMap.get(m.reply_to) ?? null : null,
      deleted_by_name: m.profiles?.display_name || m.profiles?.username || null,
    }));
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        replyTo: z.string().uuid().optional(),
        content: z.string().max(4000, "Message cannot exceed 4000 characters").optional(),
        viewOnce: z.boolean().optional(),
        viewLimit: z.number().int().positive().nullable().optional(),
        disappearAfterView: z.boolean().optional(),
        media: z
          .object({
            path: z.string(),
            mime: z.string(),
            name: z.string(),
            size: z.number().int().nonnegative(),
            kind: messageKind,
          })
          .optional(),
      })
      .refine((v) => (v.content && v.content.trim().length > 0) || v.media, {
        message: "Empty message",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Fetch shared conversation setting
    const { data: conv } = await (supabase
      .from("conversations") as any)
      .select("expiry_seconds")
      .eq("id", data.conversationId)
      .maybeSingle();

    const currentExpiry = conv?.expiry_seconds;
    const finalDisappear = data.disappearAfterView ?? (currentExpiry === 0);

    const { data: row, error } = await (supabase
      .from("messages") as any)
      .insert({
        conversation_id: data.conversationId,
        sender_id: userId,
        content: data.content?.trim() || null,
        reply_to: data.replyTo ?? null,
        media_path: data.media?.path ?? null,
        media_mime: data.media?.mime ?? null,
        media_name: data.media?.name ?? null,
        media_size: data.media?.size ?? null,
        message_type: data.media?.kind ?? "text",
        view_once: data.viewOnce ?? false,
        view_limit: data.viewLimit ?? null,
        disappear_after_view: finalDisappear,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    if (row?.disappear_after_view) {
      const { davTrace } = await import("@/lib/dav-lifecycle-trace.server");
      davTrace("STEP1_INSERT", row.id, {
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        disappearAfterView: row.disappear_after_view,
      });
    }

    return row;
  });

export const editMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ id: z.string().uuid(), content: z.string().trim().min(1).max(4000, "Message cannot exceed 4000 characters") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("messages")
      .update({ content: data.content, edited: true })
      .eq("id", data.id)
      .eq("sender_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Mark incoming messages as read AND set first_read_at if recipient is someone else
    const nowString = new Date().toISOString();
    const now = new Date();

    // Fetch conversation's shared expiry setting
    const { data: conv } = await (supabase
      .from("conversations") as any)
      .select("expiry_seconds")
      .eq("id", data.conversationId)
      .single();

    const sharedExpiry = conv?.expiry_seconds;

    // 2. Process incoming unread messages
    // We fetch them first to calculate individual expires_at values
    const { data: unreadRows } = await (supabase
      .from("messages") as any)
      .select("id, created_at, sender_id, first_read_at, viewed_at, expires_at, disappear_after_view")
      .eq("conversation_id", data.conversationId)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (unreadRows && unreadRows.length > 0) {
      const { davTrace, davVerifyUserViewRow, logSqlResult } = await import(
        "@/lib/dav-lifecycle-trace.server"
      );
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      for (const msg of unreadRows) {
        const updateData: any = { read_at: nowString };

        if (!msg.viewed_at) {
          updateData.viewed_at = nowString;
        }

        // Timer only starts on the FIRST read event
        if (!msg.first_read_at) {
          updateData.first_read_at = nowString;

          // Calculate permanent absolute expires_at if a timer is active
          if (sharedExpiry && sharedExpiry > 0 && !msg.disappear_after_view) {
            updateData.expires_at = new Date(now.getTime() + sharedExpiry * 1000).toISOString();
          }
        }

        const viewUpsert = await (supabaseAdmin as any)
          .from("message_user_views")
          .upsert(
            {
              message_id: msg.id,
              user_id: userId,
              viewed_at: nowString,
            },
            { onConflict: "message_id,user_id" },
          )
          .select("message_id, user_id, viewed_at");

        logSqlResult("STEP5_SQL", msg.id, "UPSERT", "message_user_views", {
          message_id: msg.id,
          user_id: userId,
          viewed_at: nowString,
        }, viewUpsert);

        logSqlResult("STEP6_AFFECTED", msg.id, "UPSERT", "message_user_views", {
          message_id: msg.id,
          user_id: userId,
        }, viewUpsert);

        if (viewUpsert.error) {
          console.error("Update error", { messageId: msg.id, stage: "message_user_views", error: viewUpsert.error });
          davTrace("STEP2_VIEWED", msg.id, { failed: true, stage: "message_user_views", error: viewUpsert.error.message });
        }

        const msgUpdate = await (supabase.from("messages") as any)
          .update(updateData)
          .eq("id", msg.id)
          .select("id, viewed_at, first_read_at, read_at");

        logSqlResult("STEP5_SQL", msg.id, "UPDATE", "messages", { id: msg.id }, msgUpdate);
        logSqlResult("STEP6_AFFECTED", msg.id, "UPDATE", "messages", { id: msg.id }, msgUpdate);

        if (msgUpdate.error) {
          console.error("Update error", { messageId: msg.id, stage: "messages", error: msgUpdate.error });
          davTrace("STEP2_VIEWED", msg.id, { failed: true, stage: "messages", error: msgUpdate.error.message });
          throw new Error(`[markRead] messages update failed: ${msgUpdate.error.message}`);
        }

        if (msg.disappear_after_view) {
          davTrace("STEP2_VIEWED", msg.id, {
            conversationId: data.conversationId,
            userId,
            viewed_at: updateData.viewed_at ?? msg.viewed_at,
            first_read_at: updateData.first_read_at ?? msg.first_read_at,
          });
          await davVerifyUserViewRow(supabaseAdmin, msg.id, userId);
        }
      }
    }

    // 3. Manual deletion logic for "After Viewing" mode (now integrated into visibility / exit)
    // Actually, view-once messages will get their expires_at set in commit_view_once_expiration 
    // when the user exits. 

    return { ok: true };
  });

const ALLOWED_MIME =
  /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(webm|ogg|mpeg|mp4|aac|m4a)|application\/pdf|application\/zip|text\/.*|application\/(msword|vnd\.openxmlformats-officedocument.*))$/;

export const createMediaUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        conversationId: z.string().uuid(),
        name: z.string().min(1).max(200),
        mime: z.string().min(1).max(120).regex(ALLOWED_MIME, "Unsupported file type"),
        size: z
          .number()
          .int()
          .positive()
          .max(25 * 1024 * 1024),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const ext = data.name.includes(".") ? data.name.split(".").pop() : "bin";
    const path = `${data.conversationId}/${crypto.randomUUID()}.${ext}`;
    const { data: signed, error } = await context.supabase.storage
      .from("chat-media")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    return { path, token: signed.token };
  });

export const signedMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ path: z.string().min(1).max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("chat-media")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });

export const saveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("save_message", { _msg_id: data.messageId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const unsaveMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as any).rpc("unsave_message", { _msg_id: data.messageId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
