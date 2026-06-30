import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listReactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("message_reactions")
      .select("id, user_id, emoji, created_at")
      .eq("message_id", data.messageId);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const addReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z.object({ messageId: z.string().uuid(), emoji: z.string().max(8) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("message_reactions")
      .upsert({ message_id: data.messageId, user_id: context.userId, emoji: data.emoji }, { onConflict: "message_id,user_id" })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeReaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ messageId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("message_reactions")
      .delete()
      .eq("message_id", data.messageId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
