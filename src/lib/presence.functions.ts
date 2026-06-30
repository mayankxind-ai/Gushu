import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const updatePresence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("incognito_mode")
      .eq("id", context.userId)
      .maybeSingle();
    if (prof?.incognito_mode) return { ok: true };
    const { error } = await context.supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setTyping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("incognito_mode")
      .eq("id", context.userId)
      .maybeSingle();
    if (prof?.incognito_mode) return { ok: true };
    const { error } = await context.supabase.from("typing_status").upsert(
      {
        conversation_id: data.conversationId,
        user_id: context.userId,
        typing_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearTyping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("typing_status")
      .delete()
      .eq("conversation_id", data.conversationId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getTypingStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ conversationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("typing_status")
      .select("user_id, typing_at")
      .eq("conversation_id", data.conversationId)
      .neq("user_id", context.userId);

    if (error) throw new Error(error.message);

    const now = new Date();
    // Also check if each user is in incognito — if so, filter them out
    const active = (rows ?? []).filter((row) => {
      const diff = now.getTime() - new Date(row.typing_at).getTime();
      return diff < 3000;
    });

    if (active.length === 0) return { typingUsers: [] };

    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, incognito_mode")
      .in("id", active.map((r) => r.user_id));

    const incognitoSet = new Set((profs ?? []).filter((p) => p.incognito_mode).map((p) => p.id));

    return { typingUsers: active.filter((r) => !incognitoSet.has(r.user_id)).map((u) => u.user_id) };
  });

export const getUserProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile, error } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, verified, last_seen_at, incognito_mode")
      .eq("id", data.userId)
      .single();

    if (error) throw new Error(error.message);

    // If user is incognito, mask last_seen_at
    if (profile.incognito_mode) {
      return { ...profile, last_seen_at: null };
    }
    return profile;
  });
