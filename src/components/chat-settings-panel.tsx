import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PinDialog } from "@/components/pin-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  setConversationPin,
  verifyConversationPin,
  removeConversationPin,
  toggleConversationHidden,
  clearConversation,
  setConversationExpiry,
  setConversationTheme,
  setConversationWallpaper,
  setConversationNotification,
  setConversationSecretCode,
  removeConversationSecretCode,
} from "@/lib/conversation-settings.functions";
import { leaveConversation } from "@/lib/conversations.functions";
import { toast } from "sonner";
import {
  Lock, EyeOff, Eye, Eraser, Timer, Palette, Image as ImageIcon, Bell, KeyRound, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";

const THEMES = [
  { id: "obsidian", label: "Obsidian", bg: "bg-zinc-950 border-zinc-700" },
  { id: "midnight", label: "Midnight Blue", bg: "bg-blue-950 border-blue-700" },
  { id: "neon", label: "Purple Neon", bg: "bg-violet-950 border-violet-600" },
  { id: "emerald", label: "Emerald", bg: "bg-emerald-950 border-emerald-700" },
  { id: "graphite", label: "Graphite", bg: "bg-neutral-800 border-neutral-600" },
];

const EXPIRY_OPTIONS = [
  { label: "After Viewing", value: 0, icon: "🔥" },
  { label: "Never", value: null },
  { label: "1 Hour", value: 3600 },
  { label: "24 Hours", value: 86400 },
  { label: "7 Days", value: 604800 },
  { label: "30 Days", value: 2592000 },
];

const WALLPAPERS = [
  { id: "none", label: "None", color: "bg-card border-border" },
  {
    id: "grid",
    label: "Grid",
    color: "bg-zinc-900 border-zinc-700",
    style: "bg-[radial-gradient(circle,_rgba(255,255,255,0.06)_1px,_transparent_1px)] bg-[size:20px_20px]",
  },
  {
    id: "dots",
    label: "Dots",
    color: "bg-zinc-900 border-zinc-700",
    style: "bg-[radial-gradient(rgba(255,255,255,0.12)_1px,_transparent_1px)] bg-[size:16px_16px]",
  },
  {
    id: "waves",
    label: "Waves",
    color: "bg-blue-950 border-blue-700",
    style: "bg-gradient-to-br from-blue-950 via-blue-900 to-blue-950",
  },
  {
    id: "aurora",
    label: "Aurora",
    color: "bg-emerald-950 border-emerald-800",
    style: "bg-gradient-to-br from-emerald-950 via-teal-900 to-emerald-950",
  },
];

type Settings = {
  is_locked?: boolean;
  is_hidden?: boolean;
  expiry_seconds?: number | null;
  theme?: string;
  wallpaper_url?: string | null;
  pin_hash?: string | null;
  notification_enabled?: boolean;
  secret_code_hash?: string | null;
};

interface ChatSettingsPanelProps {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  settings: Settings | null;
  onSettingsChange: (s: Partial<Settings>) => void;
}

export function ChatSettingsPanel({
  open,
  onClose,
  conversationId,
  settings,
  onSettingsChange,
}: ChatSettingsPanelProps) {
  const navigate = useNavigate();
  const [pinMode, setPinMode] = useState<"none" | "set" | "verify-remove">("none");
  const [secretCodeInput, setSecretCodeInput] = useState("");
  const setPinFn = useServerFn(setConversationPin);
  const verifyPinFn = useServerFn(verifyConversationPin);
  const removePinFn = useServerFn(removeConversationPin);
  const hideFn = useServerFn(toggleConversationHidden);
  const clearFn = useServerFn(clearConversation);
  const leaveFn = useServerFn(leaveConversation);
  const expiryFn = useServerFn(setConversationExpiry);
  const themeFn = useServerFn(setConversationTheme);
  const wallpaperFn = useServerFn(setConversationWallpaper);
  const notifFn = useServerFn(setConversationNotification);
  const secretCodeFn = useServerFn(setConversationSecretCode);
  const removeSecretCodeFn = useServerFn(removeConversationSecretCode);
  const queryClient = useQueryClient();

  const hasPin = !!settings?.pin_hash;
  const isHidden = !!settings?.is_hidden;
  const notificationEnabled = !!settings?.notification_enabled;
  const hasSecretCode = !!settings?.secret_code_hash;

  async function handleSetPin(pin: string) {
    try {
      await setPinFn({ data: { conversationId, pin } });
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((conv: any) => (conv.id === conversationId ? { ...conv, locked: true, has_pin: true } : conv));
      });
      onSettingsChange({ pin_hash: "set", is_locked: true });
      toast.success("Chat locked with PIN");
      setPinMode("none");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to set PIN");
    }
  }

  async function handleVerifyRemove(pin: string) {
    const { valid } = await verifyPinFn({ data: { conversationId, pin } });
    if (!valid) return false;
    await removePinFn({ data: { conversationId } });
    queryClient.setQueryData(["conversations"], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((conv: any) => (conv.id === conversationId ? { ...conv, locked: false, has_pin: false } : conv));
    });
    onSettingsChange({ pin_hash: null, is_locked: false });
    toast.success("PIN removed");
    setPinMode("none");
  }

  async function handleToggleHide(hidden: boolean) {
    try {
      await hideFn({ data: { conversationId, hidden } });
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((conv: any) => (conv.id === conversationId ? { ...conv, hidden } : conv));
      });
      onSettingsChange({ is_hidden: hidden });
      toast.success(hidden ? "Conversation hidden" : "Conversation visible");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function handleClear() {
    const clearedAt = new Date().toISOString();
    try {
      await clearFn({ data: { conversationId } });
      toast.success("Conversation history cleared for you");
      queryClient.setQueryData(["conv-settings", conversationId], (old: any) => ({ ...old, cleared_at: clearedAt }));
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((conv: any) => (conv.id === conversationId ? { ...conv, cleared_at: clearedAt } : conv));
      });
      queryClient.setQueryData(["messages", conversationId], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((msg: any) => msg.is_saved || new Date(msg.created_at).getTime() > new Date(clearedAt).getTime());
      });
      onSettingsChange({ cleared_at: clearedAt });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function handleLeave() {
    try {
      await leaveFn({ data: { id: conversationId } });
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((conv: any) => conv.id !== conversationId);
      });
      toast.success("Conversation deleted");
      onClose();
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to delete chat");
    }
  }

  async function handleExpiry(seconds: number | null) {
    try {
      await expiryFn({ data: { conversationId, seconds } });
      onSettingsChange({ expiry_seconds: seconds });
      toast.success(seconds !== null ? "Auto-delete timer set" : "Auto-delete disabled");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function handleTheme(theme: string) {
    try {
      await themeFn({ data: { conversationId, theme } });
      onSettingsChange({ theme });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function handleWallpaper(wallpaperId: string | null) {
    const url = wallpaperId === "none" || !wallpaperId ? null : wallpaperId;
    try {
      await wallpaperFn({ data: { conversationId, wallpaperUrl: url } });
      onSettingsChange({ wallpaper_url: url });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full max-w-xs overflow-y-auto bg-[#1c1c1f] border-white/[0.06]">
          <SheetHeader className="mb-4">
            <SheetTitle className="font-display text-lg text-white">Conversation Settings</SheetTitle>
          </SheetHeader>

          {/* Lock */}
          <Section icon={<Lock className="size-4 text-zinc-400" />} title="Chat Lock">
            {!hasPin ? (
              <Button size="sm" variant="outline" className="w-full border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white" onClick={() => setPinMode("set")}>
                Set 6-digit PIN
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-zinc-500">PIN is set</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-white/[0.08] bg-white/[0.04] text-red-400 hover:bg-red-400/10 hover:text-red-400"
                  onClick={() => setPinMode("verify-remove")}
                >
                  Remove PIN
                </Button>
              </div>
            )}
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Hidden */}
          <Section icon={<EyeOff className="size-4 text-zinc-400" />} title="Hidden Chat">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-500">Hide from conversation list</Label>
              <Switch
                checked={isHidden}
                onCheckedChange={handleToggleHide}
                className="scale-90"
              />
            </div>
            {isHidden && (
              <p className="mt-1 text-[10px] text-zinc-500">
                Access via Settings → Hidden Chats
              </p>
            )}
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Secret Code Protection */}
          <Section icon={<KeyRound className="size-4 text-zinc-400" />} title="Secret Code Protection">
            <p className="mb-2 text-[10px] text-zinc-500">
              Add a secret code to protect hidden chats.
            </p>
            {!hasSecretCode ? (
              <div className="space-y-2">
                {isHidden && (
                  <>
                    <Input
                      type="text"
                      placeholder="Enter secret code"
                      value={secretCodeInput}
                      onChange={(e) => setSecretCodeInput(e.target.value)}
                      className="h-8 text-xs bg-white/[0.04] border-white/[0.08] text-white"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white"
                      disabled={!secretCodeInput.trim()}
                      onClick={async () => {
                        const code = secretCodeInput.trim();
                        if (code.length < 4) {
                          toast.error("Please set a code with at least 4 characters for better security.");
                          return;
                        }
                        try {
                          await secretCodeFn({ data: { conversationId, code } });
                          onSettingsChange({ secret_code_hash: "set" });
                          toast.success("Secret code set");
                          setSecretCodeInput("");
                        } catch (e: any) {
                          toast.error(e?.message ?? "Failed");
                        }
                      }}
                    >
                      Set Secret Code
                    </Button>
                  </>
                )}
                {!isHidden && (
                  <p className="text-[10px] italic text-zinc-500">
                    Hide this chat first to add secret code protection
                  </p>
                )}
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full border-white/[0.08] bg-white/[0.04] text-red-400 hover:bg-red-400/10 hover:text-red-400"
                onClick={async () => {
                  try {
                    await removeSecretCodeFn({ data: { conversationId } });
                    onSettingsChange({ secret_code_hash: null });
                    toast.success("Secret code removed");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed");
                  }
                }}
              >
                Remove Secret Code
              </Button>
            )}
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Notifications */}
          <Section icon={<Bell className="size-4 text-zinc-400" />} title="Notifications">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-zinc-500">Enable notifications for this chat</Label>
              <Switch
                checked={notificationEnabled}
                onCheckedChange={async (enabled) => {
                  try {
                    await notifFn({ data: { conversationId, enabled } });
                    onSettingsChange({ notification_enabled: enabled });
                    toast.success(enabled ? "Notifications enabled" : "Notifications disabled");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed");
                  }
                }}
                className="scale-90"
              />
            </div>
            <p className="mt-1 text-[10px] text-zinc-500">
              Privacy-safe: Shows "Knock Knock!" without revealing content
            </p>
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Expiry */}
          <Section icon={<Timer className="size-4 text-zinc-400" />} title="Auto-Delete Messages (Under Developement">
            <div className="grid grid-cols-1 gap-1">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => handleExpiry(opt.value)}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs text-left transition-colors",
                    settings?.expiry_seconds === opt.value
                      ? "bg-white text-black font-medium"
                      : "hover:bg-white/[0.06] text-zinc-500",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Theme */}
          <Section icon={<Palette className="size-4 text-zinc-400" />} title="Chat Theme">
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTheme(t.id)}
                  title={t.label}
                  className={cn(
                    "aspect-square rounded-lg border-2 transition-all",
                    t.bg,
                    settings?.theme === t.id
                      ? "ring-2 ring-white ring-offset-1 ring-offset-[#1c1c1f]"
                      : "",
                  )}
                />
              ))}
            </div>
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Wallpaper */}
          <Section icon={<ImageIcon className="size-4 text-zinc-400" />} title="Wallpaper">
            <div className="grid grid-cols-5 gap-2">
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => handleWallpaper(w.id)}
                  title={w.label}
                  className={cn(
                    "aspect-square rounded-lg border-2 transition-all",
                    w.color,
                    w.style,
                    settings?.wallpaper_url === w.id || (!settings?.wallpaper_url && w.id === "none")
                      ? "ring-2 ring-white ring-offset-1 ring-offset-[#1c1c1f]"
                      : "",
                  )}
                />
              ))}
            </div>
          </Section>

          <Separator className="my-4 bg-white/[0.06]" />

          <Separator className="my-4 bg-white/[0.06]" />

          {/* Delete conversation */}
          <Section icon={<LogOut className="size-4 text-red-400" />} title="Danger Zone">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="w-full border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 hover:text-red-400">
                  Delete conversation permanently
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-[#1c1c1f] border-white/[0.08]">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete this conversation?</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    This will permanently remove the conversation from your account. 
                    If the other person also deletes it, the chat will be gone forever.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-white/[0.06] text-zinc-300 border-white/[0.08] hover:bg-white/[0.1]">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleLeave}
                    className="bg-red-500 text-white hover:bg-red-500/90"
                  >
                    Delete Chat
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </Section>
        </SheetContent>
      </Sheet>

      {pinMode === "set" && (
        <PinDialog
          open
          title="Set Chat PIN"
          description="Choose a 6-digit PIN to lock this conversation"
          onSubmit={async (pin) => { await handleSetPin(pin); }}
          onCancel={() => setPinMode("none")}
        />
      )}
      {pinMode === "verify-remove" && (
        <PinDialog
          open
          title="Enter PIN to Remove"
          description="Enter your current PIN to remove the lock"
          onSubmit={handleVerifyRemove}
          onCancel={() => setPinMode("none")}
          errorMessage="Incorrect PIN"
        />
      )}
    </>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <span className="text-zinc-400">{icon}</span>
        <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">{title}</span>
      </div>
      {children}
    </div>
  );
}
