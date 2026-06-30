import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getOrCreateConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ otherUserId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("get_or_create_conversation", {
      _other_user: data.otherUserId,
    });
    if (error) throw new Error(error.message);
    return { id: id as string };
  });

export const checkConversationAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Check if conversation is hidden with a secret code for this user
    const { data: settings } = await context.supabase
      .from("conversation_settings")
      .select("is_hidden, secret_code_hash")
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId)
      .maybeSingle();

    const requiresSecretCode = settings?.is_hidden && settings?.secret_code_hash;
    return {
      requiresSecretCode: !!requiresSecretCode,
      isHidden: !!settings?.is_hidden,
    };
  });

async function listMyConversationsFallback(supabase: any, userId: string) {
  const { data: statusRows, error: statusError } = await supabase
    .from("conversation_status")
    .select("conversation_id")
    .eq("user_id", userId)
    .eq("has_left", false);
  if (statusError) throw new Error(statusError.message);
  const conversationIds = (statusRows ?? []).map((row: any) => row.conversation_id).filter(Boolean);
  if (conversationIds.length === 0) return [];

  const lastMsgLimit = Math.min(conversationIds.length * 5, 200);
  const [{ data: convRows, error: convError }, { data: settingsRows, error: settingsError }, { data: lastMsgRows, error: lastMsgError }] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, user1_id, user2_id, last_message_at")
      .in("id", conversationIds),
    supabase
      .from("conversation_settings")
      .select("conversation_id, is_hidden, is_locked, pin_hash, secret_code_hash, cleared_at, removed_at")
      .in("conversation_id", conversationIds)
      .eq("user_id", userId),
    supabase
      .from("messages")
      .select("conversation_id, content, message_type, created_at, sender_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false })
      .limit(lastMsgLimit),
  ]);

  if (convError) throw new Error(convError.message);
  if (settingsError) throw new Error(settingsError.message);
  if (lastMsgError) throw new Error(lastMsgError.message);

  const settingsMap = new Map<string, any>();
  for (const setting of settingsRows ?? []) {
    settingsMap.set(setting.conversation_id, setting);
  }

  const lastMessageMap = new Map<string, any>();
  for (const msg of lastMsgRows ?? []) {
    if (!lastMessageMap.has(msg.conversation_id)) {
      lastMessageMap.set(msg.conversation_id, msg);
    }
  }

  const otherUserIds = Array.from(new Set((convRows ?? []).map((conv: any) =>
    conv.user1_id === userId ? conv.user2_id : conv.user1_id
  ).filter(Boolean)));

  const { data: profileRows, error: profileError } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url, verified, last_seen_at")
    .in("id", otherUserIds);
  if (profileError) throw new Error(profileError.message);

  const profileMap = new Map<string, any>();
  for (const profile of profileRows ?? []) {
    profileMap.set(profile.id, profile);
  }

  return (convRows ?? []).map((conv: any) => {
    const setting = settingsMap.get(conv.id) ?? {};
    const otherId = conv.user1_id === userId ? conv.user2_id : conv.user1_id;
    const other = profileMap.get(otherId) ?? null;
    const last = lastMessageMap.get(conv.id) ?? null;
    return {
      id: conv.id,
      other: other
        ? {
            id: other.id,
            username: other.username,
            display_name: other.display_name,
            avatar_url: other.avatar_url,
            verified: other.verified,
            last_seen_at: other.last_seen_at,
          }
        : null,
      last: last
        ? {
            content: last.content,
            message_type: last.message_type,
            created_at: last.created_at,
            sender_id: last.sender_id,
          }
        : null,
      unread: 0,
      last_message_at: conv.last_message_at,
      hidden: setting.is_hidden ?? false,
      locked: setting.is_locked ?? false,
      hasPin: !!setting.pin_hash,
      hasSecretCode: !!setting.secret_code_hash,
      cleared_at: setting.cleared_at,
      removed_at: setting.removed_at,
    };
  });
}

export const listMyConversations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: convs, error } = await supabase.rpc("list_my_conversations" as any);
    if (error) {
      console.warn("[listMyConversations] RPC failed, falling back to direct query:", error.message);
      return listMyConversationsFallback(supabase, userId);
    }

    const hiddenConversationIds = (convs ?? [])
      .filter((c: any) => c.hidden)
      .map((c: any) => c.id);

    const secretCodeMap = new Map<string, boolean>();
    if (hiddenConversationIds.length > 0) {
      const { data: secretSettings, error: secretError } = await supabase
        .from("conversation_settings")
        .select("conversation_id, secret_code_hash")
        .in("conversation_id", hiddenConversationIds)
        .eq("user_id", userId);
      if (secretError) throw new Error(secretError.message);
      for (const row of (secretSettings ?? []) as any[]) {
        if (row?.conversation_id) {
          secretCodeMap.set(row.conversation_id, !!row.secret_code_hash);
        }
      }
    }

    const results = (convs ?? []).map((c: any) => ({
      id: c.id,
      other: c.other ? {
        id: c.other.id,
        username: c.other.username,
        display_name: c.other.display_name,
        avatar_url: c.other.avatar_url,
        verified: c.other.verified,
        last_seen_at: c.other.last_seen_at,
      } : null,
      last: c.last ? {
        content: c.last.content,
        message_type: c.last.message_type,
        created_at: c.last.created_at,
        sender_id: c.last.sender_id,
      } : null,
      unread: Number(c.unread) || 0,
      last_message_at: c.last_message_at,
      hidden: c.hidden ?? false,
      locked: c.locked ?? false,
      hasPin: c.has_pin ?? false,
      hasSecretCode: secretCodeMap.get(c.id) ?? c.has_secret_code ?? false,
      cleared_at: c.cleared_at,
    }));

    return results;
  });

export const getConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: result, error } = await (supabase as any).rpc("get_conversation_with_header_data", {
      _conv_id: data.id,
      _user_id: userId,
    });
    
    if (error) {
      console.error(`[getConversation] RPC Error:`, error.message);
      // Fallback or throw
      throw new Error(error.message);
    }
    
    if (!result) return null;

    return {
      id: result.id,
      other: result.other ? {
        id: result.other.id,
        username: result.other.username,
        display_name: result.other.display_name,
        avatar_url: result.other.avatar_url,
        verified: result.other.verified,
        last_seen_at: result.other.last_seen_at,
      } : null
    };
  });

export const leaveConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: purged, error } = await context.supabase.rpc("leave_conversation", {
      _conv: data.id,
    });
    if (error) throw new Error(error.message);

    if (purged) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: objects, error: listError } = await supabaseAdmin.storage
        .from("chat-media")
        .list(data.id, { limit: 1000 });
      if (listError) {
        console.warn("Failed to list chat-media objects for purge:", listError.message);
      } else if (objects && objects.length > 0) {
        const paths = objects.map((obj) => `${data.id}/${obj.name}`);
        const { error: removeError } = await supabaseAdmin.storage
          .from("chat-media")
          .remove(paths);
        if (removeError) {
          console.warn("Failed to delete chat-media files for purge:", removeError.message);
        }
      }
    }

    return { purged: !!purged };
  });
