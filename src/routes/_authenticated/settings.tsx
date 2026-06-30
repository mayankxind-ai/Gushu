import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader as Loader2, Upload, Trash2, Shield, Eye, EyeOff, Lock, LogOut, Smartphone, MonitorCheck, EyeOff as Hidden } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Logo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { PinDialog } from "@/components/pin-dialog";
import { updateMyProfile } from "@/lib/profiles.functions";
import { setIncognito, getIncognito, setAppPin, hasAppPin, removeAppPin, verifyAppPin, setPanicLocked } from "@/lib/privacy.functions";
import { unregisterPushNotifications } from "@/lib/notification-service";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const queryClient = useQueryClient();
  const update = useServerFn(updateMyProfile);
  const getIncognitoFn = useServerFn(getIncognito);
  const setIncognitoFn = useServerFn(setIncognito);
  const hasAppPinFn = useServerFn(hasAppPin);
  const setAppPinFn = useServerFn(setAppPin);
  const removeAppPinFn = useServerFn(removeAppPin);
  const verifyAppPinFn = useServerFn(verifyAppPin);
  const setPanicFn = useServerFn(setPanicLocked);

  const [me, setMe] = useState<{
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_url: string | null;
    verified: boolean;
    created_at: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  // Privacy state
  const [incognito, setIncognitoState] = useState(false);
  const [appHasPin, setAppHasPin] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);
  const [pinMode, setPinMode] = useState<"none" | "set" | "remove" | "panic">("none");

  async function refresh() {
    const { data } = await supabase.auth.getUser();
    if (!data.user) return;
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, username, display_name, bio, avatar_url, verified, created_at")
      .eq("id", data.user.id)
      .maybeSingle();
    if (prof) setMe(prof);
  }

  useEffect(() => {
    refresh();
    getIncognitoFn({ data: undefined as any }).then((r) => setIncognitoState(r.incognito)).catch(() => {});
    hasAppPinFn({ data: undefined as any }).then((r) => setAppHasPin(r.hasPin)).catch(() => {});
    loadSessions();
  }, []);

  async function loadSessions() {
    try {
      const { data } = await supabase.auth.admin?.listUsers?.() as any;
      // Fallback: use mfa
      const sessions = await supabase.auth.getSession();
      const now = new Date();
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
      const isMobile = /mobile|android|iphone|ipad/i.test(ua);
      setSessions([{
        id: "current",
        device: isMobile ? "Mobile" : "Desktop",
        browser: getBrowser(ua),
        os: getOS(ua),
        loginDate: now.toISOString(),
        current: true,
      }]);
    } catch {}
  }

  async function toggleIncognito(v: boolean) {
    try {
      await setIncognitoFn({ data: { incognito: v } });
      setIncognitoState(v);
      toast.success(v ? "Incognito mode enabled" : "Incognito mode disabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function handleSetPin(pin: string) {
    try {
      await setAppPinFn({ data: { pin } });
      setAppHasPin(true);
      toast.success("App PIN set");
      setPinMode("none");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to set PIN");
    }
  }

  async function handleRemovePin(pin: string): Promise<boolean | void> {
    const { valid } = await verifyAppPinFn({ data: { pin } });
    if (!valid) return false;
    await removeAppPinFn({ data: undefined as any });
    setAppHasPin(false);
    toast.success("App PIN removed");
    setPinMode("none");
  }

  async function handlePanicLock(pin: string): Promise<boolean | void> {
    const { valid } = await verifyAppPinFn({ data: { pin } });
    if (!valid) return false;
    await setPanicFn({ data: { locked: true } });
    
    // Cleanup push notifications before signing out
    await unregisterPushNotifications();
    
    await supabase.auth.signOut();
    toast.success("Gushu locked. Sign in to unlock.");
    setPinMode("none");
  }

  async function save() {
    if (!me) return;
    setBusy(true);
    try {
      await update({ data: { display_name: me.display_name ?? "", bio: me.bio ?? "" } });
      toast.success("Profile saved");
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!me) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Max 2 MB");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${me.id}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      await update({ data: { avatar_url: path } });
      toast.success("Avatar updated");
      await refresh();
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!me) return;
    setBusy(true);
    try {
      if (me.avatar_url) await supabase.storage.from("avatars").remove([me.avatar_url]);
      await update({ data: { avatar_url: null } });
      await refresh();
      queryClient.invalidateQueries();
    } catch (e: any) {
      toast.error(e?.message ?? "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  if (!me) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        {/* Desktop Header */}
        <div className="hidden items-center justify-between px-6 py-4 sm:flex">
          <Link to="/app" className="flex items-center gap-2 text-sm text-red-400 transition-colors hover:text-red-500">
            Exit <ArrowLeft className="size-4 rotate-180" />
          </Link>
          <div className="flex items-center gap-2">
            <Logo size={22} /> <span className="font-display text-lg">Settings</span>
          </div>
          <ThemeToggle />
        </div>

        {/* Mobile Header (Redesigned) */}
        <div className="grid grid-cols-3 items-center px-4 py-3 sm:hidden">
          <div className="flex items-center justify-start">
            <Logo size={24} />
          </div>
          
          <div className="flex items-center justify-center">
            <span className="font-display text-lg tracking-tight">Settings</span>
          </div>

          <div className="flex items-center justify-end gap-1">
            <ThemeToggle />
            <Link 
              to="/app" 
              className="grid size-10 place-items-center rounded-full text-red-400 active:bg-red-500/10 active:text-red-500"
              aria-label="Exit settings"
            >
              <ArrowLeft className="size-5 rotate-180" />
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-6 px-4 py-6 sm:px-6 sm:py-10">
        {/* Profile section */}
        <div>
          <h1 className="font-display text-3xl tracking-tight">Your profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Joined {new Date(me.created_at).toLocaleDateString()} · @{me.username}
            {me.verified && " · verified"}
          </p>
        </div>

        <section className="rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="flex flex-col items-center gap-5 sm:flex-row">
            <Avatar name={me.display_name ?? me.username} url={me.avatar_url} size={72} />
            <div className="flex flex-1 flex-col gap-2 sm:flex-row">
              <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:bg-foreground/90">
                <Upload className="size-3.5" /> Upload avatar
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }}
                />
              </label>
              {me.avatar_url && (
                <Button variant="outline" size="sm" onClick={removeAvatar} className="gap-1.5">
                  <Trash2 className="size-3.5" /> Remove
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-2xl bg-card p-6 ring-1 ring-border">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Username</Label>
            <Input value={me.username} disabled />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Display name</Label>
            <Input value={me.display_name ?? ""} onChange={(e) => setMe({ ...me, display_name: e.target.value })} maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Bio</Label>
            <Textarea value={me.bio ?? ""} onChange={(e) => setMe({ ...me, bio: e.target.value })} rows={3} maxLength={280} />
          </div>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save changes"}
          </Button>
        </section>

        <Separator />

        {/* Security & Privacy */}
        <div>
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-muted-foreground" />
            <h2 className="font-display text-2xl tracking-tight">Security & Privacy</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Control your visibility and app security.</p>
        </div>

        {/* Incognito Mode */}
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 grid size-8 place-items-center rounded-full bg-muted">
                <EyeOff className="size-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium">Incognito Mode</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Hides your online status, last seen, typing indicator, and read receipts from everyone.
                </p>
              </div>
            </div>
            <Switch
              checked={incognito}
              onCheckedChange={toggleIncognito}
              className="mt-0.5 shrink-0"
            />
          </div>
        </section>

        {/* Panic Lock */}
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-8 place-items-center rounded-full bg-muted">
              <Lock className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">App PIN & Panic Lock</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Set a 6-digit PIN to lock the entire app instantly. Use "Lock Gushu" for privacy emergencies.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!appHasPin ? (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPinMode("set")}>
                    <Lock className="size-3.5" /> Set App PIN
                  </Button>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => setPinMode("remove")}
                    >
                      <Lock className="size-3.5" /> Remove PIN
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => setPinMode("panic")}
                    >
                      <Lock className="size-3.5" /> Lock Gushu Now
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Hidden Chats shortcut */}
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-8 place-items-center rounded-full bg-muted">
              <EyeOff className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Hidden Conversations</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Conversations you've hidden won't appear in your main inbox. Access them from here.
              </p>
              <Link
                to="/hidden-chats"
                className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                <EyeOff className="size-3.5" /> View Hidden Chats
              </Link>
            </div>
          </div>
        </section>

        {/* Active Sessions */}
        <section className="rounded-2xl bg-card p-5 ring-1 ring-border">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid size-8 place-items-center rounded-full bg-muted">
              <MonitorCheck className="size-4 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Active Sessions</p>
              <p className="mt-0.5 mb-3 text-xs text-muted-foreground">Devices that have accessed your account.</p>
              <div className="space-y-2">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center justify-between rounded-xl border border-border p-3",
                      s.current && "ring-1 ring-primary/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="grid size-8 place-items-center rounded-full bg-muted">
                        {s.device === "Mobile" ? (
                          <Smartphone className="size-4 text-muted-foreground" />
                        ) : (
                          <MonitorCheck className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-medium">
                          {s.browser} · {s.os}
                          {s.current && (
                            <span className="ml-2 rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-500">
                              Current
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          Logged in {new Date(s.loginDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {!s.current && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                        onClick={async () => {
                          await supabase.auth.signOut({ scope: "others" });
                          toast.success("Other sessions signed out");
                          loadSessions();
                        }}
                      >
                        <LogOut className="size-3" />
                        Sign out
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 gap-1.5 text-destructive hover:text-destructive"
                onClick={async () => {
                  await supabase.auth.signOut({ scope: "others" });
                  toast.success("All other sessions signed out");
                }}
              >
                <LogOut className="size-3.5" /> Sign out all other devices
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* PIN Dialogs */}
      {pinMode === "set" && (
        <PinDialog
          open
          title="Set App PIN"
          description="Choose a 6-digit PIN to lock Gushu"
          onSubmit={async (pin) => { await handleSetPin(pin); }}
          onCancel={() => setPinMode("none")}
        />
      )}
      {pinMode === "remove" && (
        <PinDialog
          open
          title="Verify PIN"
          description="Enter your current PIN to remove it"
          onSubmit={handleRemovePin}
          onCancel={() => setPinMode("none")}
          errorMessage="Incorrect PIN"
        />
      )}
      {pinMode === "panic" && (
        <PinDialog
          open
          title="Lock Gushu"
          description="Enter your PIN to lock the entire app instantly"
          onSubmit={handlePanicLock}
          onCancel={() => setPinMode("none")}
          errorMessage="Incorrect PIN"
        />
      )}
    </div>
  );
}

function getBrowser(ua: string) {
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  if (ua.includes("Edg")) return "Edge";
  return "Browser";
}

function getOS(ua: string) {
  if (ua.includes("Windows")) return "Windows";
  if (ua.includes("Mac")) return "macOS";
  if (ua.includes("Linux")) return "Linux";
  if (ua.includes("Android")) return "Android";
  if (ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
  return "Unknown OS";
}
