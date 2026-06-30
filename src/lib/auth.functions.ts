import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase().replace(/[^a-z0-9_]/g, ""))
  .refine(
    (value) => /^[a-z0-9_]{3,20}$/.test(value),
    "3–20 chars: lowercase letters, numbers, underscore",
  );

export const resolveUsernameToEmail = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ username: usernameSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const username = data.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();
    if (!profile) throw new Error("User not found");
    const { data: userData, error } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (error || !userData?.user?.email) throw new Error("User has no email");
    return { email: userData.user.email };
  });

export const checkUsernameAvailable = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ username: usernameSchema }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", data.username)
      .maybeSingle();
    return { available: !row };
  });

/** Idempotent demo seed: ensures alex + sophia exist. Public on purpose. */
export const ensureDemoUsers = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const demos = [
    {
      username: "alex",
      email: "alex@gushu.demo",
      password: "alex123",
      display_name: "Alex Chen",
      bio: "Designer & demo account.",
    },
    {
      username: "sophia",
      email: "sophia@gushu.demo",
      password: "sophia123",
      display_name: "Sophia Vane",
      bio: "Product lead & demo account.",
    },
  ];
  for (const u of demos) {
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", u.username)
      .maybeSingle();
    if (existing) continue;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { username: u.username, display_name: u.display_name },
    });
    if (error) throw new Error(error.message);
    if (created.user) {
      await supabaseAdmin
        .from("profiles")
        .update({ bio: u.bio, verified: true })
        .eq("id", created.user.id);
    }
  }
  return { ok: true };
});
