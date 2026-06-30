import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Use the server-side function that ensures defaults and returns full row
export const getConversationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [settingsRes, convRes] = await Promise.all([
      context.supabase
        .from("conversation_settings")
        .select("*")
        .eq("conversation_id", data.conversationId)
        .eq("user_id", context.userId)
        .maybeSingle(),
      context.supabase
        .from("conversations")
        .select("expiry_seconds")
        .eq("id", data.conversationId)
        .maybeSingle()
    ]);

    let row = settingsRes.data;

    // If no row exists, create one with defaults
    if (!row) {
      const { data: newRow, error } = await context.supabase
        .from("conversation_settings")
        .insert({
          conversation_id: data.conversationId,
          user_id: context.userId,
          theme: "obsidian",
          is_locked: false,
          is_hidden: false,
          notification_enabled: false,
          disappear_after_view_enabled: false,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      row = newRow;
    }

    return {
      ...(row as any),
      expiry_seconds: (convRes.data as any)?.expiry_seconds ?? null
    };
  });

export const setConversationPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), pin: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.pin, 10);
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          pin_hash: hash,
          is_locked: true,
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyConversationPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), pin: z.string().regex(/^\d{6}$/) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("conversation_settings")
      .select("pin_hash")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .single();
    if (!row?.pin_hash) return { valid: false };
    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(data.pin, row.pin_hash);
    return { valid };
  });

export const removeConversationPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .update({ pin_hash: null, is_locked: false })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleConversationLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), locked: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .update({ is_locked: data.locked })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const toggleConversationHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), hidden: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          is_hidden: data.hidden,
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ 
    conversationId: z.string().uuid(),
    clearSaved: z.boolean().optional()
  }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    console.log("[clearConversation] entered", { userId, conversationId: data.conversationId, clearSaved: data.clearSaved });
    
    let updatedRows = 0;
    let deletedRows = 0;
    let clearError: string | null = null;
    const debug: Record<string, any> = {
      conversationId: data.conversationId,
      userId,
      clearedAt: null,
      participantCount: 0,
      earliestClearedAt: null,
      latestClearedAt: null,
      savedMessageCount: 0,
      messagesBeforeDelete: null,
      deleteQueryFilters: null,
      deletedRows: 0,
      messagesAfterDelete: null,
      cleanupExecuted: false,
      error: null,
    };

    // 1. Set cleared_at
    const clearedAt = new Date().toISOString();
    debug.clearedAt = clearedAt;
    const { data: upsertedRows, error } = await supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: userId,
          cleared_at: clearedAt,
        },
        { onConflict: "conversation_id,user_id" },
      )
      .select();

    if (error) {
      clearError = error.message;
      console.error("[clearConversation] upsert error", { error });
      throw new Error(error.message);
    }

    updatedRows = Array.isArray(upsertedRows) ? upsertedRows.length : 0;

    if (data.clearSaved) {
      const { data: mySavedRows, error: mySavedError } = await supabase
        .from("message_saves" as any)
        .select("message_id")
        .eq("conversation_id", data.conversationId)
        .eq("user_id", userId)
        .limit(1);
      if (mySavedError) {
        clearError = mySavedError.message;
        console.error("[clearConversation] fetch my saved messages error", { error: mySavedError });
        throw new Error(mySavedError.message);
      }
      if (!Array.isArray(mySavedRows) || mySavedRows.length === 0) {
        throw new Error("You can only clear saved chats if you have saved messages in this conversation.");
      }
    }

    // Message visibility is now driven by per-user cleared_at points.
    // Do not insert delete-for-me rows for a full chat clear, because clear chat is user-specific and new messages after the clear must remain visible.

    // 3. If every active participant has cleared the conversation, delete any unsaved messages older than or equal to the earliest cleared timestamp.
    const { data: participantRows, error: participantsError } = await supabase
      .from("conversation_status")
      .select("user_id")
      .eq("conversation_id", data.conversationId)
      .eq("has_left", false);
    if (participantsError) {
      clearError = participantsError.message;
      debug.error = clearError;
      console.error("[clearConversation] fetch participants error", { error: participantsError });
      throw new Error(participantsError.message);
    }

    const participantIds = Array.isArray(participantRows)
      ? participantRows.map((row: any) => row.user_id).filter(Boolean)
      : [];
    debug.participantCount = participantIds.length;

    if (participantIds.length > 0) {
      const { data: settingsRows, error: settingsError } = await supabase
        .from("conversation_settings")
        .select("user_id, cleared_at")
        .eq("conversation_id", data.conversationId)
        .in("user_id", participantIds);
      if (settingsError) {
        clearError = settingsError.message;
        debug.error = clearError;
        console.error("[clearConversation] fetch settings error", { error: settingsError });
        throw new Error(settingsError.message);
      }

      const settingsList: any[] = Array.isArray(settingsRows) ? settingsRows : [];
      const clearedSettings = settingsList.filter((row: any) => row.cleared_at);

      if (clearedSettings.length === participantIds.length) {
        const minClearedAt = clearedSettings
          .map((row: any) => row.cleared_at)
          .sort()[0];

        debug.earliestClearedAt = minClearedAt;
        debug.latestClearedAt = clearedSettings
          .map((row: any) => row.cleared_at)
          .sort()[clearedSettings.length - 1];

        console.log("[clearConversation] ALL PARTICIPANTS CLEARED", {
          participantIds,
          minClearedAt,
          conversationId: data.conversationId,
        });

        const { data: deletedCount, error: cleanupError } = await supabase
          .from("messages")
          .delete()
          .lte("created_at", minClearedAt)
          .eq("conversation_id", data.conversationId)
          .not("id", "in", "(SELECT message_id FROM message_saves)")
          .select("id");

        if (cleanupError) {
          clearError = cleanupError.message;
          debug.error = clearError;
          console.error("[clearConversation] cleanup delete error", { error: cleanupError });
          throw new Error(cleanupError.message);
        }

        const deletedMessages = Array.isArray(deletedCount) ? deletedCount.length : 0;
        debug.cleanupExecuted = true;
        debug.deletedRows = deletedMessages;
        deletedRows += deletedMessages;

        console.log("[clearConversation] cleanup completed", {
          conversationId: data.conversationId,
          deletedMessages,
        });
      }
    }

    // If every active participant has cleared the conversation, purge the conversation entirely.
    if (debug.cleanupExecuted === false && participantIds.length > 0) {
      const { data: settingsRows, error: settingsError } = await supabase
        .from("conversation_settings")
        .select("user_id, cleared_at")
        .eq("conversation_id", data.conversationId)
        .in("user_id", participantIds);
      if (settingsError) {
        clearError = settingsError.message;
        debug.error = clearError;
        console.error("[clearConversation] fetch settings error", { error: settingsError });
        throw new Error(settingsError.message);
      }

      const settingsList: any[] = Array.isArray(settingsRows) ? settingsRows : [];
      const clearedSettings = settingsList.filter((row: any) => row.cleared_at);

      if (clearedSettings.length === participantIds.length) {
        console.log("[clearConversation] ALL PARTICIPANTS CLEARED, purging conversation", {
          participantIds,
          conversationId: data.conversationId,
        });

        const { data: purgeResult, error: purgeError } = await supabase.rpc("purge_conversation", {
          _conv: data.conversationId,
        } as any);
        if (purgeError) {
          clearError = purgeError.message;
          debug.error = clearError;
          console.error("[clearConversation] purge_conversation error", { error: purgeError });
          throw new Error(purgeError.message);
        }

        const { data: deletedSaves, error: deleteSavedError } = await supabase
          .from("message_saves" as any)
          .delete()
          .eq("conversation_id", data.conversationId)
          .select();
        if (deleteSavedError) {
          clearError = deleteSavedError.message;
          console.error("[clearConversation] delete saved error", { error: deleteSavedError });
          throw new Error(deleteSavedError.message);
        }

        deletedRows += Array.isArray(deletedSaves) ? deletedSaves.length : 0;
        debug.purged = true;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: objects, error: listError } = await supabaseAdmin.storage
            .from("chat-media")
            .list(data.conversationId, { limit: 1000 });
          if (listError) {
            console.warn("Failed to list chat-media objects for purge:", listError.message);
          } else if (objects && objects.length > 0) {
            const paths = objects.map((obj: any) => `${data.conversationId}/${obj.name}`);
            const { error: removeError } = await supabaseAdmin.storage
              .from("chat-media")
              .remove(paths);
            if (removeError) {
              console.warn("Failed to delete chat-media files for purge:", removeError.message);
            }
          }
        } catch (storageError) {
          console.warn("Failed to cleanup chat-media after purge:", storageError);
        }
      }
    }

    // 5. If clearSaved is true, delete all saved messages for this user and conversation
    if (data.clearSaved) {
      const { data: deletedSaves, error: deleteSavedError } = await supabase
        .from("message_saves" as any)
        .delete()
        .eq("user_id", userId)
        .eq("conversation_id", data.conversationId)
        .select();
      if (deleteSavedError) {
        clearError = deleteSavedError.message;
        console.error("[clearConversation] delete saved error", { error: deleteSavedError });
        throw new Error(deleteSavedError.message);
      }
      deletedRows += Array.isArray(deletedSaves) ? deletedSaves.length : 0;
    }

    console.log("[clearConversation] finished", {
      userId,
      conversationId: data.conversationId,
      updatedRows,
      deletedRows,
      clearSaved: data.clearSaved,
      clearError,
      debug,
    });
    
    return { ok: true, updatedRows, deletedRows, debug };
  });

export const removeFromInbox = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          removed_at: new Date().toISOString(),
        } as any,
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationExpiry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      seconds: z.number().nullable(),
    }).parse(input))
  .handler(async ({ data, context }) => {
    // 1. Fetch current profile for system message
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", context.userId)
      .single();

    const name = profile?.display_name || profile?.username || "Someone";
    
    // 2. Format duration for message
    let durationLabel = "Never";
    if (data.seconds === 0) durationLabel = "After Viewing";
    else if (data.seconds === 3600) durationLabel = "1 Hour";
    else if (data.seconds === 86400) durationLabel = "24 Hours";
    else if (data.seconds === 604800) durationLabel = "7 Days";

    const systemText = data.seconds === null 
      ? `${name} disabled disappearing messages.`
      : `${name} changed disappearing messages to ${durationLabel}.`;

    // 3. Update Shared Conversation Setting
    const { error: updateError } = await (context.supabase
      .from("conversations") as any)
      .update({ expiry_seconds: data.seconds })
      .eq("id", data.conversationId);
    
    if (updateError) {
      console.error("[setConversationExpiry] Error updating conversation:", updateError);
      throw new Error(updateError.message);
    }

    // 4. Insert System Message (Soft failure allowed here)
    try {
      const { error: msgError } = await (context.supabase
        .from("messages") as any)
        .insert({
          conversation_id: data.conversationId,
          sender_id: context.userId,
          content: systemText,
          message_type: "system",
        });

      if (msgError) {
        console.error("[setConversationExpiry] Error inserting system message (non-blocking):", msgError);
      }
    } catch (e) {
      console.error("[setConversationExpiry] Exception inserting system message:", e);
    }
    
    return { ok: true };
  });

export const updateLastExit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const exitTimestamp = new Date().toISOString();
    const { davTrace, davVerifyDeletionRow, davVerifyMessageRow, logSqlResult } = await import(
      "@/lib/dav-lifecycle-trace.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    davTrace("STEP3_EXIT", null, {
      userId,
      conversationId: data.conversationId,
      timestamp: exitTimestamp,
    });

    davTrace("STEP4_HANDLER", null, {
      handler: "updateLastExit",
      userId,
      conversationId: data.conversationId,
    });

    // Step 1: Record last_exit_at for this user
    const settingsUpsert = await supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: userId,
          last_exit_at: exitTimestamp,
        } as any,
        { onConflict: "conversation_id,user_id" },
      )
      .select("conversation_id, user_id, last_exit_at");

    logSqlResult("STEP5_SQL", null, "UPSERT", "conversation_settings", {
      conversation_id: data.conversationId,
      user_id: userId,
      last_exit_at: exitTimestamp,
    }, settingsUpsert);

    logSqlResult("STEP6_AFFECTED", null, "UPSERT", "conversation_settings", {
      conversation_id: data.conversationId,
      user_id: userId,
    }, settingsUpsert);

    if (settingsUpsert.error) {
      console.error("[updateLastExit] failed to update last_exit_at:", settingsUpsert.error);
      throw new Error(settingsUpsert.error.message);
    }

    // Step 2: Find the other participant
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("user1_id, user2_id")
      .eq("id", data.conversationId)
      .maybeSingle();

    if (conversationError) throw new Error(conversationError.message);

    const participants = [conversation?.user1_id, conversation?.user2_id].filter(Boolean) as string[];
    const otherParticipantId = participants.find((p) => p !== userId) ?? null;

    if (!otherParticipantId) {
      davTrace("STEP4_HANDLER", null, { halt: true, reason: "no_other_participant" });
      return { ok: true };
    }

    // Step 3: Find all disappear_after_view messages in this conversation
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from("messages")
      .select("id, sender_id, conversation_id, disappear_after_view")
      .eq("conversation_id", data.conversationId)
      .eq("disappear_after_view", true);

    logSqlResult("STEP5_SQL", null, "SELECT", "messages", {
      conversation_id: data.conversationId,
      disappear_after_view: true,
    }, { data: messages, error: messagesError, count: messages?.length ?? 0 });

    if (messagesError) throw new Error(messagesError.message);

    const messageIds = (messages ?? []).map((m: any) => m.id as string).filter(Boolean);
    if (messageIds.length === 0) {
      davTrace("STEP4_HANDLER", null, { halt: true, reason: "no_dav_messages_in_conversation" });
      return { ok: true };
    }

    davTrace("STEP4_HANDLER", null, {
      davMessageCount: messageIds.length,
      davMessageIds: messageIds,
    });

    // Step 4: Fetch view records for both participants (admin bypasses RLS)
    const { data: viewRows, error: viewRowsError } = await (supabaseAdmin as any)
      .from("message_user_views")
      .select("message_id, user_id, viewed_at")
      .in("message_id", messageIds)
      .in("user_id", [userId, otherParticipantId]);

    logSqlResult("STEP5_SQL", null, "SELECT", "message_user_views", {
      message_id: messageIds,
      user_id: [userId, otherParticipantId],
    }, { data: viewRows, error: viewRowsError, count: viewRows?.length ?? 0 });

    if (viewRowsError) throw new Error(viewRowsError.message);

    const viewMap = new Map<string, Map<string, string>>();
    for (const row of (viewRows ?? []) as { message_id: string; user_id: string; viewed_at: string }[]) {
      if (!viewMap.has(row.message_id)) viewMap.set(row.message_id, new Map());
      viewMap.get(row.message_id)!.set(row.user_id, row.viewed_at);
    }

    const toHideForMe: string[] = [];

    for (const msg of messages ?? []) {
      const userViews = viewMap.get(msg.id as string);
      const msgId = msg.id as string;

      if (msg.sender_id === userId) {
        const recipientViewedAt = userViews?.get(otherParticipantId);
        davTrace("STEP4_HANDLER", msgId, {
          role: "sender_leaving",
          recipientViewedAt: recipientViewedAt ?? null,
          willHide: !!recipientViewedAt,
        });
        if (recipientViewedAt) {
          toHideForMe.push(msgId);
        }
      } else {
        const myViewedAt = userViews?.get(userId);
        davTrace("STEP4_HANDLER", msgId, {
          role: "recipient_leaving",
          myViewedAt: myViewedAt ?? null,
          willHide: !!myViewedAt,
        });
        if (myViewedAt) {
          toHideForMe.push(msgId);
        } else {
          await davVerifyMessageRow(supabaseAdmin, msgId);
        }
      }
    }

    if (toHideForMe.length === 0) {
      davTrace("STEP4_HANDLER", null, {
        halt: true,
        reason: "no_viewed_dav_messages_for_leaving_user",
        userId,
      });
      return { ok: true };
    }

    const rowsToInsert = toHideForMe.map((message_id) => ({
      message_id,
      user_id: userId,
      deleted_for_all: false,
    }));

    const deletionUpsert = await supabaseAdmin
      .from("message_deletions")
      .upsert(rowsToInsert, { onConflict: "message_id,user_id" })
      .select("message_id, user_id, deleted_for_all");

    for (const message_id of toHideForMe) {
      logSqlResult("STEP5_SQL", message_id, "UPSERT", "message_deletions", {
        message_id,
        user_id: userId,
        deleted_for_all: false,
      }, deletionUpsert);
    }

    if (deletionUpsert.error) {
      console.error("[updateLastExit] upsert message_deletions failed:", deletionUpsert.error);
      throw new Error(deletionUpsert.error.message);
    }

    const affectedRows = deletionUpsert.data?.length ?? 0;
    for (const message_id of toHideForMe) {
      logSqlResult("STEP6_AFFECTED", message_id, "UPSERT", "message_deletions", {
        message_id,
        user_id: userId,
      }, { data: deletionUpsert.data, error: null, count: affectedRows });
    }

    if (affectedRows === 0) {
      davTrace("STEP6_AFFECTED", toHideForMe[0] ?? null, {
        halt: true,
        reason: "message_deletions_upsert_zero_rows",
        attempted: rowsToInsert,
      });
      throw new Error("[updateLastExit] message_deletions upsert affected 0 rows");
    }

    for (const message_id of toHideForMe) {
      const deletionRow = await davVerifyDeletionRow(supabaseAdmin, message_id, userId);
      if (!deletionRow) {
        throw new Error(`[updateLastExit] message_deletions row missing after upsert for message ${message_id}`);
      }
      await davVerifyMessageRow(supabaseAdmin, message_id);
    }

    davTrace("STEP7_VERIFY", null, {
      success: true,
      hiddenCount: toHideForMe.length,
      hiddenMessageIds: toHideForMe,
      userId,
    });

    return { ok: true };
  });

export const setConversationTheme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ conversationId: z.string().uuid(), theme: z.string() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        { conversation_id: data.conversationId, user_id: context.userId, theme: data.theme },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setConversationWallpaper = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      wallpaperUrl: z.string().nullable(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          wallpaper_url: data.wallpaperUrl,
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Notification settings
export const setConversationNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      enabled: z.boolean(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          notification_enabled: data.enabled,
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Secret code for hidden chats
export const setConversationSecretCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      code: z.string().min(4, "Secret code must be at least 4 characters long").max(50),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.code, 10);
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          secret_code_hash: hash,
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyConversationSecretCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      code: z.string().min(4, "Secret code must be at least 4 characters long").max(50),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("conversation_settings")
      .select("secret_code_hash")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.secret_code_hash) return { valid: true };
    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(data.code, row.secret_code_hash);
    return { valid };
  });

export const removeConversationSecretCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("conversation_settings")
      .update({ secret_code_hash: null })
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setHiddenWithSecretCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({
      conversationId: z.string().uuid(),
      hidden: z.boolean(),
      code: z.string().min(4, "Secret code must be at least 4 characters long").max(50).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    let secretCodeHash = null;
    if (data.hidden && data.code) {
      const bcrypt = await import("bcryptjs");
      secretCodeHash = await bcrypt.hash(data.code, 10);
    }
    const { error } = await context.supabase
      .from("conversation_settings")
      .upsert(
        {
          conversation_id: data.conversationId,
          user_id: context.userId,
          is_hidden: data.hidden,
          secret_code_hash: secretCodeHash,
        },
        { onConflict: "conversation_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Find hidden chat by secret code - server-side only
export const findHiddenChatByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ code: z.string().min(4, "Secret code must be at least 4 characters long").max(50) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const bcrypt = await import("bcryptjs");
    // Get all hidden chats with secret codes for this user
    const { data: hiddenChats, error } = await context.supabase
      .from("conversation_settings")
      .select("conversation_id, secret_code_hash")
      .eq("user_id", context.userId)
      .eq("is_hidden", true)
      .not("secret_code_hash", "is", null);
    if (error) throw new Error(error.message);
    // Check each one
    for (const chat of hiddenChats ?? []) {
      if (chat.secret_code_hash) {
        const match = await bcrypt.compare(data.code, chat.secret_code_hash);
        if (match) {
          return { found: true, conversationId: chat.conversation_id };
        }
      }
    }
    return { found: false, conversationId: null };
  });
