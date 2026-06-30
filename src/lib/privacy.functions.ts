import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Incognito mode
export const getIncognito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("incognito_mode")
      .eq("id", context.userId)
      .single();
    return { incognito: data?.incognito_mode ?? false };
  });

export const setIncognito = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ incognito: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ incognito_mode: data.incognito })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// App PIN (bcrypt)
export const setAppPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash(data.pin, 10);
    const { error } = await context.supabase
      .from("profiles")
      .update({ app_pin_hash: hash })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const verifyAppPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ pin: z.string().regex(/^\d{6}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("app_pin_hash")
      .eq("id", context.userId)
      .single();
    if (!prof?.app_pin_hash) return { valid: false };
    const bcrypt = await import("bcryptjs");
    const valid = await bcrypt.compare(data.pin, prof.app_pin_hash);
    return { valid };
  });

export const hasAppPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("app_pin_hash")
      .eq("id", context.userId)
      .single();
    return { hasPin: !!data?.app_pin_hash };
  });

export const removeAppPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ app_pin_hash: null })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Panic lock
export const getPanicLocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("panic_locked")
      .eq("id", context.userId)
      .single();
    return { locked: data?.panic_locked ?? false };
  });

export const setPanicLocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ locked: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({ panic_locked: data.locked })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
