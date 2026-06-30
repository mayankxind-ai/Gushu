import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteForMe = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      const { supabase, userId } = context;

      // Insert the deletion record for this user
      const { error } = await supabase.from("message_deletions").upsert(
        {
          message_id: data.messageId,
          user_id: userId,
          deleted_for_all: false,
        },
        { onConflict: "message_id,user_id" },
      );
      if (error) throw error;

      // Check if both participants have deleted this message
      const { data: conv } = await supabase
        .from("conversations")
        .select("user1_id, user2_id")
        .eq("id", data.conversationId)
        .single();

      if (conv) {
        const participants = [conv.user1_id, conv.user2_id];

        const { data: deletions } = await supabase
          .from("message_deletions")
          .select("user_id")
          .eq("message_id", data.messageId);

        const deletedUserIds = (deletions ?? []).map((d) => d.user_id);
        const allParticipantsDeleted = participants.every((p) => deletedUserIds.includes(p));

        if (allParticipantsDeleted) {
          // Get message media path before deletion
          const { data: msg } = await supabase
            .from("messages")
            .select("media_path")
            .eq("id", data.messageId)
            .maybeSingle();

          // Hard delete the message
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Delete message_deletions entries first (due to FK constraint)
          await supabaseAdmin.from("message_deletions").delete().eq("message_id", data.messageId);
          await supabaseAdmin.from("messages").delete().eq("id", data.messageId);

          // Remove media from storage if present
          if (msg?.media_path) {
            await supabaseAdmin.storage.from("chat-media").remove([msg.media_path]);
          }
        }
      }

      return { ok: true };
    } catch (e: any) {
      console.error("Delete for me error:", e);
      throw new Error("Could not hide message. Please try again.");
    }
  });

export const deleteForEveryone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), conversationId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    try {
      const { data: msg } = await context.supabase
        .from("messages")
        .select("sender_id, media_path")
        .eq("id", data.messageId)
        .single();
        
      if (!msg) throw new Error("Message not found");
      if (msg.sender_id !== context.userId) {
        throw new Error("Only the sender can delete for everyone");
      }

      // Remove media if present
      if (msg.media_path) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        await supabaseAdmin.storage
          .from("chat-media")
          .remove([msg.media_path]);
      }

      // Soft delete from database (marks as deleted_for_all and sets deleted_by_id)
      const { error } = await context.supabase.rpc("soft_delete_message_for_everyone" as any, {
        _msg_id: data.messageId,
        _sender_id: context.userId,
      });
      
      if (error) throw error;

      return { ok: true };
    } catch (e: any) {
      console.error("Delete for everyone error:", e);
      throw new Error(e.message ?? "Message deletion failed. You might not have permission.");
    }
  });

export const markViewed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { davTrace, davVerifyUserViewRow, logSqlResult } = await import(
      "@/lib/dav-lifecycle-trace.server"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: msg } = await (supabase
      .from("messages") as any)
      .select("id, conversation_id, sender_id, disappear_after_view, media_path, message_type, view_count, viewed_at, first_read_at")
      .eq("id", data.messageId)
      .maybeSingle();

    if (!msg) return { ok: true };

    const viewedAt = new Date().toISOString();
    const updateData: Record<string, any> = {
      viewed_at: msg.viewed_at ?? viewedAt,
    };

    if (msg.message_type && ["image", "video", "file"].includes(msg.message_type)) {
      updateData.view_count = (msg.view_count ?? 0) + 1;
    }

    const viewUpsert = await (supabaseAdmin as any)
      .from("message_user_views")
      .upsert(
        {
          message_id: data.messageId,
          user_id: userId,
          viewed_at: viewedAt,
        },
        { onConflict: "message_id,user_id" },
      )
      .select("message_id, user_id, viewed_at");

    logSqlResult("STEP5_SQL", data.messageId, "UPSERT", "message_user_views", {
      message_id: data.messageId,
      user_id: userId,
      viewed_at: viewedAt,
    }, viewUpsert);

    logSqlResult("STEP6_AFFECTED", data.messageId, "UPSERT", "message_user_views", {
      message_id: data.messageId,
      user_id: userId,
    }, viewUpsert);

    if (viewUpsert.error) {
      davTrace("STEP2_VIEWED", data.messageId, {
        failed: true,
        stage: "message_user_views",
        error: viewUpsert.error.message,
      });
      throw new Error(`[markViewed] message_user_views upsert failed: ${viewUpsert.error.message}`);
    }

    const msgUpdate = await (supabase.from("messages") as any)
      .update(updateData)
      .eq("id", data.messageId)
      .select("id, viewed_at, first_read_at");

    logSqlResult("STEP5_SQL", data.messageId, "UPDATE", "messages", { id: data.messageId }, msgUpdate);
    logSqlResult("STEP6_AFFECTED", data.messageId, "UPDATE", "messages", { id: data.messageId }, msgUpdate);

    if (msgUpdate.error) {
      davTrace("STEP2_VIEWED", data.messageId, {
        failed: true,
        stage: "messages",
        error: msgUpdate.error.message,
      });
      throw new Error(`[markViewed] messages update failed: ${msgUpdate.error.message}`);
    }

    if (msg.disappear_after_view) {
      davTrace("STEP2_VIEWED", data.messageId, {
        conversationId: msg.conversation_id,
        userId,
        viewed_at: viewedAt,
        first_read_at: msgUpdate.data?.[0]?.first_read_at ?? msg.first_read_at,
      });
      await davVerifyUserViewRow(supabaseAdmin, data.messageId, userId);

      // The recipient just viewed this DAV message. Run cleanup so that any
      // participant who already left (e.g. the sender) immediately loses it
      // — no need to wait for them to reopen the chat.
      const { runDavCleanup } = await import("@/lib/dav-lifecycle-trace.server");
      await runDavCleanup(supabaseAdmin, msg.conversation_id, userId);
    }

    return { ok: true };
  });
