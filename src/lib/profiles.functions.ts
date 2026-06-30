import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const searchUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ q: z.string().trim().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const term = data.q.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!term) return [];
    
    // Fetch hidden user IDs first to exclude them
    const { data: hiddenSettings } = await supabase
      .from("conversation_settings")
      .select("conversation_id")
      .eq("user_id", userId)
      .eq("is_hidden", true)
      .not("secret_code_hash", "is", null);

    let excludeUserIds: string[] = [];
    if (hiddenSettings && hiddenSettings.length > 0) {
      const convIds = hiddenSettings.map(s => s.conversation_id);
      const { data: convs } = await supabase
        .from("conversations")
        .select("user1_id, user2_id")
        .in("id", convIds);
      
      if (convs) {
        excludeUserIds = convs.map(c => c.user1_id === userId ? c.user2_id : c.user1_id);
      }
    }

    let query = supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, verified")
      .ilike("username", `%${term}%`)
      .neq("id", userId);

    if (excludeUserIds.length > 0) {
      query = query.not("id", "in", `(${excludeUserIds.join(",")})`);
    }

    const { data: profiles, error: searchError } = await query.limit(10);
    if (searchError) throw new Error(searchError.message);
    return profiles ?? [];
  });

export const getProfileByUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ username: z.string().trim().min(1).max(40) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, verified, last_seen_at, created_at")
      .eq("username", data.username.toLowerCase())
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const getProfileByUserId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ userId: z.string().trim().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("profiles")
      .select("id, username, display_name, avatar_url, bio, verified, last_seen_at, created_at")
      .eq("id", data.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        display_name: z.string().trim().max(40).optional(),
        bio: z.string().trim().max(280).optional(),
        avatar_url: z.string().trim().max(300).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("profiles").update(data).eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const heartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("profiles")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", context.userId);
    return { ok: true };
  });

export const signedAvatarUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ path: z.string().min(1).max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: signed, error } = await context.supabase.storage
      .from("avatars")
      .createSignedUrl(data.path, 60 * 60 * 24);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
