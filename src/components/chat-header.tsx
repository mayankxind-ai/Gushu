import { useState, useEffect, useRef, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Trash2, MoveVertical as MoreVertical, EyeOff, Eye, Lock, StickyNote, Settings as SettingsIcon, Loader as Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar } from "@/components/avatar";
import { ProfileView } from "@/components/profile-view";
import { Skeleton } from "@/components/ui/skeleton";
import { VerifiedBadge } from "@/components/verified-badge";
import { TypingIndicator } from "@/components/typing-indicator";
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
import { Button } from "@/components/ui/button";
import { ChatSettingsPanel } from "@/components/chat-settings-panel";
import { PrivateNotesDrawer } from "@/components/private-notes-drawer";
import { PinDialog } from "@/components/pin-dialog";
import { PremiumDropdownMenu, PremiumMenuItem, PremiumMenuSeparator } from "@/components/premium-dropdown-menu";
import { leaveConversation } from "@/lib/conversations.functions";
import { toggleConversationHidden, clearConversation, removeFromInbox } from "@/lib/conversation-settings.functions";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { verifyConversationPin } from "@/lib/conversation-settings.functions";
import { getTypingStatus } from "@/lib/presence.functions";
import { isOnline, formatRelative } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Other = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
  last_seen_at: string;
};

type Settings = {
  is_locked?: boolean;
  is_hidden?: boolean;
  expiry_seconds?: number | null;
  theme?: string;
  wallpaper_url?: string | null;
  pin_hash?: string | null;
  notification_enabled?: boolean;
  secret_code_hash?: string | null;
  cleared_at?: string | null;
};

interface ChatHeaderProps {
  conversationId: string;
  other: Other | null;
  onLeft: () => void;
  settings: Settings | null;
  onSettingsChange: (s: Partial<Settings>) => void;
  onUnlocked: () => void;
  isUnlocked: boolean;
  isHiddenLocked?: boolean;
  loading?: boolean;
  isCollapsed?: boolean;
  hasSavedByMe?: boolean;
}

export function ChatHeader({
  conversationId,
  other,
  onLeft,
  settings,
  onSettingsChange,
  onUnlocked,
  isUnlocked,
  isHiddenLocked,
  loading,
  isCollapsed,
  hasSavedByMe,
}: ChatHeaderProps) {
  const leave = useServerFn(leaveConversation);
  const hideFn = useServerFn(toggleConversationHidden);
  const clearFn = useServerFn(clearConversation);
  const removeFn = useServerFn(removeFromInbox);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const getTyping = useServerFn(getTypingStatus);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const verifyPin = useServerFn(verifyConversationPin);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfile, setFullProfile] = useState<any>(null);
  const [alsoClearSaved, setAlsoClearSaved] = useState(false);

  const openProfile = useCallback(async () => {
    if (!other) return;
    setProfileOpen(true);
    // Fetch bio if missing
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, verified")
        .eq("id", other.id)
        .maybeSingle();
      if (data) setFullProfile(data);
    } catch {}
  }, [other]);

  // Typing indicator polling
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const result = await getTyping({ data: { conversationId } });
        if (!cancelled) setIsTyping(result.typingUsers.length > 0);
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [conversationId, getTyping]);

  async function handleClearChat() {
    setBusy(true);
    try {
      await clearFn({ data: { conversationId, clearSaved: alsoClearSaved } });
      const clearedAt = new Date().toISOString();
      toast.success(alsoClearSaved ? "All messages cleared" : "Chat history cleared (saved kept)");
      queryClient.setQueryData(["conv-settings", conversationId], (old: any) => ({ ...old, cleared_at: clearedAt }));
      queryClient.setQueryData(["messages", conversationId], (old: any) => {
        if (!Array.isArray(old)) return old;
        return alsoClearSaved ? [] : old.filter((msg: any) => msg.is_saved || new Date(msg.created_at).getTime() > new Date(clearedAt).getTime());
      });
      onSettingsChange({ cleared_at: clearedAt });
      setClearOpen(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Clear failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveFromInbox() {
    setBusy(true);
    try {
      await removeFn({ data: { conversationId } });
      toast.success("Removed from inbox");
      navigate({ to: "/app" });
    } catch (e: any) {
      toast.error(e?.message ?? "Remove failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleHide() {
    const hidden = !settings?.is_hidden;
    try {
      await hideFn({ data: { conversationId, hidden } });
      queryClient.setQueryData(["conv-settings", conversationId], (old: any) => ({ ...old, is_hidden: hidden }));
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((conv: any) => (conv.id === conversationId ? { ...conv, hidden } : conv));
      });
      onSettingsChange({ is_hidden: hidden });
      toast.success(hidden ? "Conversation hidden" : "Conversation visible again");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function handlePinVerify(pin: string): Promise<boolean | void> {
    const { valid } = await verifyPin({ data: { conversationId, pin } });
    if (!valid) return false;
    onUnlocked();
    setPinOpen(false);
  }

  const toggleMenu = useCallback(() => {
    setMenuOpen((prev) => !prev);
  }, []);

  const isHidden = !!settings?.is_hidden;
  const shouldMaskOther = isHiddenLocked;

  return (
    <>
      <header className={cn(
        "relative z-10 flex shrink-0 items-center justify-between border-b border-border bg-card/80 px-4 backdrop-blur-xl transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] sm:px-6",
        isCollapsed ? "h-14 sm:h-16 shadow-[0_4px_20px_rgba(0,0,0,0.1)] backdrop-blur-2xl" : "h-16 sm:h-20 shadow-none"
      )}>
        {/* Aesthetic Brand Gradient Border (Bottom) */}
        <div className={cn(
          "absolute bottom-0 left-0 h-[1.5px] w-full brand-gradient transition-all duration-700 ease-in-out",
          isCollapsed ? "opacity-40 scale-x-100" : "opacity-0 scale-x-0"
        )} />
        {loading || !other ? (
          <div className="flex min-w-0 items-center gap-3">
             <Button
              variant="ghost"
              size="icon"
              className="shrink-0 md:hidden"
              onClick={() => navigate({ to: "/app" })}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn(
              "flex items-center gap-3 transition-opacity duration-300",
              isCollapsed ? "opacity-60" : "opacity-100"
            )}>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 md:hidden"
                onClick={() => navigate({ to: "/app" })}
                aria-label="Back to chats"
              >
                <ArrowLeft className="size-4" />
              </Button>
            </div>

            <div className={cn(
              "flex shrink-0 items-center transition-all duration-500",
              isCollapsed ? "opacity-90" : "opacity-100"
            )}>
              {shouldMaskOther ? (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                  <Lock className="size-4" />
                </div>
              ) : (
                <button
                  onClick={openProfile}
                  className="shrink-0 cursor-pointer transition-all duration-300 hover:scale-105"
                  aria-label="View profile"
                >
                  <Avatar
                    name={other.display_name ?? other.username}
                    url={other.avatar_url}
                    size={36}
                    className={cn(
                      "size-9 shrink-0 transition-all duration-500",
                      isTyping
                        ? "ring-2 ring-primary shadow-[0_0_25px_rgba(139,92,246,0.8)] animate-pulse"
                        : isOnline(other.last_seen_at)
                          ? "ring-2 ring-primary/40 shadow-[0_0_15px_rgba(139,92,246,0.4)] animate-pulse"
                          : "ring-1 ring-white/10 shadow-[0_0_10px_rgba(255,255,255,0.05)]"
                    )}
                  />
                </button>
              )}
            </div>

            <div className={cn(
              "min-w-0 transition-transform duration-500",
              isCollapsed ? "translate-x-2" : "translate-x-0"
            )}>
              <div className="flex flex-wrap items-center gap-1.5">
                <h2 className="truncate font-display text-base tracking-tight text-foreground sm:text-xl group-hover:text-primary transition-colors">
                  {shouldMaskOther ? "User xyz" : other.display_name ?? other.username}
                </h2>
                {!shouldMaskOther && other.verified && <VerifiedBadge size={14} />}
                {settings?.pin_hash && (
                  <Lock className={`size-3 ${isUnlocked ? "text-emerald-400" : "text-amber-400"}`} />
                )}
                {isHidden && <EyeOff className="size-3 text-muted-foreground" />}
                {!shouldMaskOther && (
                  <span className="hidden rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
                    @{other.username}
                  </span>
                )}
              </div>
              <p className={cn(
                "text-[11px] text-muted-foreground transition-all duration-300",
                isCollapsed ? "opacity-0 h-0 overflow-hidden" : "opacity-100 h-auto"
              )}>
                {shouldMaskOther ? (
                  <span className="text-xs text-muted-foreground">Hidden conversation</span>
                ) : isTyping ? (
                  <TypingIndicator className="inline-flex" />
                ) : isOnline(other.last_seen_at) ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-emerald-400" /> Online
                  </span>
                ) : (
                  `Last seen ${formatRelative(other.last_seen_at)} ago`
                )}
              </p>
            </div>
          </div>
        )}

        <div className={cn(
          "flex shrink-0 items-center gap-1 transition-opacity duration-300",
          isCollapsed ? "opacity-60" : "opacity-100"
        )}>
          {/* Leave button */}
          <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 gap-1.5 text-xs uppercase tracking-widest text-red-400 hover:bg-red-400/10 hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-border bg-card">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Clear chat history?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  This will clear all messages and media in this conversation for YOU. The other person will still see the history. This action cannot be undone.
                </AlertDialogDescription>
                
                <div className="flex items-center space-x-2 py-4">
                  <Checkbox 
                    id="clearSaved" 
                    checked={alsoClearSaved} 
                    onCheckedChange={(v) => setAlsoClearSaved(!!v)}
                    disabled={!hasSavedByMe}
                    className="border-primary"
                  />
                  <Label 
                    htmlFor="clearSaved"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground cursor-pointer"
                  >
                    Also clear saved chats
                  </Label>
                  {!hasSavedByMe && (
                    <span className="text-xs text-muted-foreground">Only enabled when you have saved chats.</span>
                  )}
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="border-border bg-muted text-muted-foreground hover:bg-muted/80">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  type="button"
                  onClick={handleClearChat}
                  disabled={busy}
                  className="bg-red-500 text-white hover:bg-red-500/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear Chat
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>


          {/* 3-dot menu button */}
          <Button
            ref={menuButtonRef}
            variant="ghost"
            size="icon"
            className="premium-button size-8 text-muted-foreground sm:size-9"
            onClick={toggleMenu}
            aria-label="More options"
            aria-expanded={menuOpen}
          >
            <div className="flex flex-col gap-[3px]">
              <span className="size-1 rounded-full bg-current" />
              <span className="size-1 rounded-full bg-current" />
              <span className="size-1 rounded-full bg-current" />
            </div>
          </Button>

          <PremiumDropdownMenu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            triggerRef={menuButtonRef}
          >
            <PremiumMenuItem
              icon={<StickyNote />}
              label="Private Notes"
              onClick={() => { setMenuOpen(false); setNotesOpen(true); }}
            />
            <PremiumMenuItem
              icon={<RefreshCw className="size-4" />}
              label="Refresh Chat"
              onClick={() => { setMenuOpen(false); window.location.reload(); }}
            />
            <PremiumMenuItem
              icon={isHidden ? <Eye /> : <EyeOff />}
              label={isHidden ? "Unhide Conversation" : "Hide Conversation"}
              onClick={() => { setMenuOpen(false); handleToggleHide(); }}
            />
            <PremiumMenuItem
              icon={<Trash2 className="size-4" />}
              label="Remove from inbox"
              variant="destructive"
              onClick={() => { setMenuOpen(false); handleRemoveFromInbox(); }}
            />
            {settings?.pin_hash && !isUnlocked && (
              <PremiumMenuItem
                icon={<Lock />}
                label="Unlock Conversation"
                variant="accent"
                onClick={() => { setMenuOpen(false); setPinOpen(true); }}
              />
            )}
            <PremiumMenuSeparator />
            <PremiumMenuItem
              icon={<SettingsIcon />}
              label="Chat Settings"
              onClick={() => { setMenuOpen(false); setSettingsOpen(true); }}
            />
          </PremiumDropdownMenu>
        </div>
      </header>

      <ChatSettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        conversationId={conversationId}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />

      <PrivateNotesDrawer
        open={notesOpen}
        onClose={() => setNotesOpen(false)}
        conversationId={conversationId}
      />

      {pinOpen && (
        <PinDialog
          open
          title="Chat is Locked"
          description="Enter your 6-digit PIN to unlock"
          onSubmit={handlePinVerify}
          onCancel={() => setPinOpen(false)}
          errorMessage="Incorrect PIN"
        />
      )}

      {fullProfile && (
        <ProfileView
          user={fullProfile}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
    </>
  );
}
