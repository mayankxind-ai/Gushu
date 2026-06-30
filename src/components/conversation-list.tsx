import { Link, useParams } from "@tanstack/react-router";
import { memo, useState, useCallback } from "react";
import { VerifiedBadge } from "@/components/verified-badge";
import { Avatar } from "@/components/avatar";
import { ProfileView } from "@/components/profile-view";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelative, isOnline } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Lock, EyeOff, MoveHorizontal as MoreHorizontal, Trash2, ShieldAlert, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Profile } from "@/components/profile-view";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useServerFn } from "@tanstack/react-start";
import { clearConversation, toggleConversationHidden, toggleConversationLock, removeFromInbox } from "@/lib/conversation-settings.functions";
import { leaveConversation } from "@/lib/conversations.functions";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type Item = {
  id: string;
  other: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    verified: boolean;
    last_seen_at: string;
  } | null;
  last: {
    content: string | null;
    message_type: string;
    created_at: string;
    sender_id: string;
  } | null;
  unread: number;
  last_message_at: string;
  hidden?: boolean;
  locked?: boolean;
  hasPin?: boolean;
  hasSecretCode?: boolean;
  cleared_at?: string | null;
  removed_at?: string | null;
};

export const ConversationList = memo(function ConversationList({
  items,
  loading,
  showHidden,
}: {
  items: Item[];
  loading?: boolean;
  showHidden?: boolean;
}) {
  const params = useParams({ strict: false }) as { conversationId?: string };
  const queryClient = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfile, setFullProfile] = useState<Profile | null>(null);

  const openProfile = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, verified, last_seen_at, created_at")
        .eq("id", userId)
        .maybeSingle();
      if (data) {
        setFullProfile(data as Profile);
        setProfileOpen(true);
      }
    } catch {}
  }, []);
  const clear = useServerFn(clearConversation);
  const leave = useServerFn(leaveConversation);
  const toggleHidden = useServerFn(toggleConversationHidden);
  const toggleLock = useServerFn(toggleConversationLock);
  const remove = useServerFn(removeFromInbox);

  const visible = items.filter((c) => showHidden ? c.hidden : !c.hidden);

  const handleClear = async (convId: string) => {
    try {
      await clear({ data: { conversationId: convId } });
      toast.success("Chat history cleared");
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((conv: any) => (conv.id === convId ? { ...conv, cleared_at: new Date().toISOString() } : conv));
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to clear chat");
    }
  };

  const handleLeave = async (convId: string) => {
    try {
      await leave({ data: { id: convId } });
      toast.success("Conversation removed");
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((conv: any) => conv.id !== convId);
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove chat");
    }
  };

  const handleToggleHidden = async (convId: string, current: boolean) => {
    try {
      await toggleHidden({ data: { conversationId: convId, hidden: !current } });
      toast.success(current ? "Chat unhidden" : "Chat hidden");
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((conv: any) => (conv.id === convId ? { ...conv, hidden: !current } : conv));
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Action failed");
    }
  };

  const handleRemove = async (convId: string) => {
    try {
      await remove({ data: { conversationId: convId } });
      toast.success("Removed from inbox");
      queryClient.setQueryData(["conversations"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.filter((conv: any) => conv.id !== convId);
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to remove chat");
    }
  };

  if (loading) {
    return (
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex gap-3 p-4">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2 pt-1">
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (visible.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-muted-foreground">
        {showHidden ? "No hidden conversations" : "No conversations yet. Search for a user to start one."}
      </div>
    );
  }
  return (
    <div className="divide-y divide-border">
      {visible.map((c, idx) => {
        const isActive = params.conversationId === c.id;
        const o = c.other;
        const isCleared = c.cleared_at && c.last && new Date(c.last.created_at).getTime() <= new Date(c.cleared_at).getTime();
        const preview = (c.last && !isCleared)
          ? c.last.message_type === "text"
            ? (c.last.content ?? "")
            : c.last.message_type === "image"
              ? "📷 Photo"
              : c.last.message_type === "video"
                ? "🎬 Video"
                : "📎 File"
          : "Say hello";
        const unreadCount = isCleared ? 0 : c.unread;
        return (
          <ContextMenu key={c.id}>
            <ContextMenuTrigger asChild>
              <div className="group relative">
                <Link
                  to="/app/c/$conversationId"
                  params={{ conversationId: c.id }}
                  className={cn(
                    "block p-4 transition-all duration-300 hover:bg-muted/40 animate-in-fade",
                    idx < 10 && `stagger-${Math.min(Math.floor(idx / 2) + 1, 5)}`,
                    isActive && "bg-muted/60 scale-[1.02] shadow-sm z-10",
                    c.hidden && "opacity-60",
                  )}
                >
                  <div className="flex gap-3">
                    <div className="relative shrink-0">
                      {c.hidden && c.hasSecretCode ? (
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
                          <Lock className="size-4" />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (o?.id) openProfile(o.id);
                            }}
                            className="cursor-pointer transition-transform duration-300 hover:scale-110"
                            aria-label="View profile"
                          >
                            <Avatar
                              name={o?.display_name ?? o?.username ?? "?"}
                              url={o?.avatar_url}
                              size={40}
                            />
                          </button>
                          {o && isOnline(o.last_seen_at) && !o?.avatar_url && (
                            <span className="absolute bottom-0 right-0 size-2.5 rounded-full bg-emerald-400 ring-2 ring-sidebar" />
                          )}
                        </>
                      )}
                      {(c.locked || c.hasPin) && (
                        <span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-amber-400 text-[8px] font-bold text-black">
                          <Lock className="size-2.5" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="truncate text-sm font-medium text-foreground">
                            {c.hidden && c.hasSecretCode ? "Unknown User" : (o?.display_name ?? o?.username)}
                          </span>
                          {! (c.hidden && c.hasSecretCode) && o?.verified && <VerifiedBadge size={12} />}
                          {c.hidden && <EyeOff className="size-3 text-muted-foreground" />}
                        </div>
                        <span className="ml-2 shrink-0 text-[10px] text-muted-foreground pr-8">
                          {formatRelative(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 pr-8">
                        <p
                          className={cn(
                            "truncate text-xs",
                            unreadCount > 0 ? "text-foreground" : "text-muted-foreground",
                          )}
                        >
                          {c.locked ? "🔒 Locked conversation" : preview}
                        </p>
                        {unreadCount > 0 && (
                          <span className="grid size-4 shrink-0 place-items-center rounded-full brand-gradient text-[9px] font-bold text-white">
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>

                <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity hidden md:block z-20">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 rounded-full hover:bg-muted/50">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleToggleHidden(c.id, c.hidden ?? false); }} className="gap-2">
                        <EyeOff className="size-4 opacity-70" />
                        <span>{c.hidden ? "Unhide chat" : "Hide chat"}</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.preventDefault(); handleClear(c.id); }} className="gap-2">
                        <Trash2 className="size-4 opacity-70" />
                        <span>Clear history</span>
                      </DropdownMenuItem>
                      <ContextMenuSeparator />
                      <DropdownMenuItem 
                        onClick={(e) => { e.preventDefault(); handleRemove(c.id); }} 
                        className="gap-2 text-red-400 focus:text-red-400 focus:bg-red-400/10"
                      >
                        <Trash2 className="size-4 opacity-70" />
                        <span>Remove from list</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem onClick={() => handleToggleHidden(c.id, c.hidden ?? false)} className="gap-2">
                <EyeOff className="size-4 opacity-70" />
                <span>{c.hidden ? "Unhide chat" : "Hide chat"}</span>
              </ContextMenuItem>
              <ContextMenuItem onClick={() => handleClear(c.id)} className="gap-2">
                <Trash2 className="size-4 opacity-70" />
                <span>Clear history</span>
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem 
                onClick={() => handleRemove(c.id)} 
                className="gap-2 text-red-400 focus:text-red-400 focus:bg-red-400/10"
              >
                <Trash2 className="size-4 opacity-70" />
                <span>Remove from list</span>
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
      {fullProfile && (
        <ProfileView
          user={fullProfile}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}
    </div>
  );
});
