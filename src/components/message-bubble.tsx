import { memo, useEffect, useRef, useState, useCallback, useMemo } from "react";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Copy, 
  Reply, 
  Smile, 
  Trash2, 
  Check, 
  CheckCheck, 
  Clock, 
  EyeOff, 
  RotateCcw, 
  Edit2, 
  UserMinus,
  Star,
  FileText, 
  Play, 
  Pause, 
  Trash, 
  Eye, 
  MoreHorizontal, 
  Plus,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { editMessage, saveMessage, unsaveMessage, signedMediaUrl, sendMessage } from "@/lib/messages.functions";
import { deleteForMe, deleteForEveryone, markViewed } from "@/lib/message-delete.functions";
import { addReaction, removeReaction } from "@/lib/reactions.functions";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  media_path: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  message_type: "text" | "image" | "video" | "file" | "audio";
  edited: boolean;
  read_at: string | null;
  created_at: string;
  reply_to?: string | null;
  replied_message?: { id: string; content: string | null; message_type: string; media_name?: string | null; sender_id?: string; sender_name?: string } | null;
  view_once?: boolean;
  viewed_at?: string | null;
  deleted_for_all?: boolean;
  view_limit?: number | null;
  view_count?: number;
  disappear_after_view?: boolean;
  deleted_for_everyone_at?: string | null;
  deleted_by_id?: string | null;
  deleted_by_name?: string | null;
  reactions?: { user_id: string; emoji: string }[];
  is_saved?: boolean;
  saved_by_me?: boolean;
  is_optimistic?: boolean;
  send_failed?: boolean;
};

const DEFAULT_REACTIONS = ["❤️", "😂", "🔥", "👍", "😮", "😢"];

export const MessageBubble = memo(function MessageBubble({
  m,
  mine,
  onEdited,
  onReply,
  meId,
  theme,
}: {
  m: Message & { is_saved?: boolean; saved_by_me?: boolean };
  mine: boolean;
  onEdited: () => void;
  onReply?: (m: Message) => void;
  meId: string;
  theme?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.content ?? "");
  const [slideOffset, setSlideOffset] = useState(0);
  const [hovering, setHovering] = useState(false);
  const [localReactions, setLocalReactions] = useState<{ user_id: string; emoji: string }[]>(
    m.reactions ?? []
  );
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useServerFn(saveMessage);
  const unsave = useServerFn(unsaveMessage);
  const edit = useServerFn(editMessage);
  const delMe = useServerFn(deleteForMe);
  const delAll = useServerFn(deleteForEveryone);
  const retrySend = useServerFn(sendMessage);
  const addReact = useServerFn(addReaction);
  const removeReact = useServerFn(removeReaction);
  const queryClient = useQueryClient();
  const messageQueryKey = ["messages", m.conversation_id];

  const updateCachedMessage = useCallback(
    (updater: (msg: any) => any) => {
      queryClient.setQueryData(messageQueryKey, (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((msg: any) => {
          if (msg.id !== m.id) return msg;
          return updater(msg);
        });
      });
    },
    [messageQueryKey, m.id, queryClient],
  );

  const setMessageField = useCallback(
    (partial: Record<string, any>) => {
      updateCachedMessage((msg) => ({ ...msg, ...partial }));
    },
    [updateCachedMessage],
  );

  const setMessageReactions = useCallback(
    (reactions: { user_id: string; emoji: string }[]) => {
      setLocalReactions(reactions);
      updateCachedMessage((msg) => ({ ...msg, reactions }));
    },
    [updateCachedMessage],
  );

  const setSavedState = useCallback(
    (saved: boolean, savedByMe: boolean) => {
      updateCachedMessage((msg) => ({ ...msg, is_saved: saved, saved_by_me: savedByMe }));
    },
    [updateCachedMessage],
  );

  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    if (typeof window === "undefined") return DEFAULT_REACTIONS;
    const saved = localStorage.getItem("recent_emojis");
    return saved ? JSON.parse(saved) : DEFAULT_REACTIONS;
  });

  const updateRecent = useCallback((emoji: string) => {
    setRecentEmojis((prev) => {
      const next = [emoji, ...prev.filter((e) => e !== emoji)].slice(0, 6);
      localStorage.setItem("recent_emojis", JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    setLocalReactions(m.reactions ?? []);
  }, [m.reactions]);

  const isDeleted = m.deleted_for_all && m.deleted_for_everyone_at;
  const isViewOnce = m.view_once;
  const isViewed = !!m.viewed_at;
  const remainingViews = m.view_limit != null ? Math.max(0, (m.view_limit ?? 0) - (m.view_count ?? 0)) : null;

  const bubbleBg = mine
    ? theme === "emerald"
      ? "bg-emerald-600 text-white"
      : theme === "neon"
        ? "bg-violet-600 text-white"
        : theme === "midnight"
          ? "bg-blue-600 text-white"
          : theme === "graphite"
            ? "bg-neutral-600 text-white"
            : "bg-foreground text-background"
    : "bg-muted text-foreground";

  const ringColor = mine
    ? theme === "emerald" ? "ring-emerald-500/20"
    : theme === "neon" ? "ring-violet-500/20"
    : theme === "midnight" ? "ring-blue-500/20"
    : theme === "graphite" ? "ring-neutral-500/20"
    : "ring-foreground/10"
    : "ring-border";

  async function commit() {
    const text = draft.trim();
    if (!text || text === m.content) { setEditing(false); return; }
    setMessageField({ content: text, edited: true });
    setEditing(false);
    try {
      await edit({ data: { id: m.id, content: text } });
    } catch (e: any) {
      toast.error(e?.message ?? "Edit failed");
      setMessageField({ content: m.content, edited: m.edited });
    }
  }

  async function handleDeleteForMe() {
    const previous = m;
    updateCachedMessage((msg) => ({ ...msg, deleted_for_all: false, deleted_for_everyone_at: new Date().toISOString(), deleted_by_name: "You" }));
    try {
      await delMe({ data: { messageId: m.id, conversationId: m.conversation_id } });
      toast.success("Message deleted for you");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
      updateCachedMessage(() => previous);
    }
  }

  async function handleDeleteForEveryone() {
    const previous = m;
    updateCachedMessage((msg) => ({ ...msg, deleted_for_all: true, deleted_for_everyone_at: new Date().toISOString(), deleted_by_name: "You" }));
    try {
      await delAll({ data: { messageId: m.id, conversationId: m.conversation_id } });
      toast.success("Message deleted for everyone");
    } catch (e: any) {
      toast.error(e?.message ?? "Delete failed");
      updateCachedMessage(() => previous);
    }
  }

  async function handleReact(emoji: string) {
    const myReact = localReactions.find((r) => r.user_id === meId);
    if (myReact?.emoji === emoji) {
      const optimistic = localReactions.filter((r) => r.user_id !== meId);
      setMessageReactions(optimistic);
      try {
        await removeReact({ data: { messageId: m.id } });
      } catch (e: any) {
        toast.error(e?.message ?? "React failed");
        setMessageReactions(localReactions);
      }
    } else {
      const next = [...localReactions.filter((r) => r.user_id !== meId), { user_id: meId, emoji }];
      setMessageReactions(next);
      updateRecent(emoji);
      try {
        await addReact({ data: { messageId: m.id, emoji } });
      } catch (e: any) {
        toast.error(e?.message ?? "React failed");
        setMessageReactions(localReactions);
      }
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - touchStartXRef.current;
    const dy = e.touches[0].clientY - touchStartYRef.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (!mine && dx > 0) setSlideOffset(Math.min(dx, 60));
      else if (mine && dx < 0) setSlideOffset(Math.max(dx, -60));
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current;
    const dy = e.changedTouches[0].clientY - touchStartYRef.current;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      onReply?.(m);
    }
    setSlideOffset(0);
  };

  const reactionCounts: Record<string, number> = {};
  const myReact = localReactions.find((r) => r.user_id === meId);
  for (const r of localReactions) {
    reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1;
  }

  if (isDeleted) {
    const deletedByText = mine
      ? "You deleted this message for everyone"
      : `Message deleted by ${m.deleted_by_name || "sender"}`;
    return (
      <div className={cn("flex flex-col py-1", mine ? "items-end" : "items-start")}>
        <div className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ring-1 flex items-center gap-2",
          bubbleBg, ringColor,
          mine ? "rounded-tr-md" : "rounded-tl-md",
        )}>
          <Trash className="size-3.5 opacity-50" />
          <span className="italic opacity-70">{deletedByText}</span>
        </div>
      </div>
    );
  }

  return (
    <ContextMenu>
      <div className={cn("group relative flex items-center gap-2 w-full", mine ? "flex-row-reverse" : "flex-row")}>
        <ContextMenuTrigger asChild>
          <div className={cn("w-full flex flex-col", mine ? "items-end" : "items-start")}>
            {slideOffset !== 0 && (
              <div className={cn("absolute top-1/2 z-10 -translate-y-1/2 text-muted-foreground pointer-events-none", !mine ? "left-2" : "right-2")}>
                <RotateCcw className="size-4 animate-pulse" />
              </div>
            )}

            <div className={cn("flex flex-col w-full", mine ? "items-end" : "items-start")}>
              <div className="max-w-[75%] md:max-w-[70%] space-y-1">
                <div
                  onClick={async (e) => {
                    // Don't trigger if selecting text
                    if (window.getSelection()?.toString()) return;
                    
                    // Don't trigger if it's already being handled by media click
                    if (m.media_path && e.target instanceof Element && e.target.closest('button, a')) return;

                    if (m.is_saved) {
                      if (m.saved_by_me) {
                        const prev = m;
                        setSavedState(false, false);
                        try {
                          await unsave({ data: { messageId: m.id } });
                          toast.success("Message unsaved");
                        } catch (err: any) {
                          toast.error(err.message);
                          setSavedState(prev.is_saved ?? false, prev.saved_by_me ?? false);
                        }
                      } else {
                        toast.info("Saved by other user");
                      }
                    } else {
                      const prev = m;
                      setSavedState(true, true);
                      try {
                        await save({ data: { messageId: m.id } });
                        onEdited();
                        toast.success("Message saved");
                      } catch (err: any) {
                        toast.error(err.message);
                        setSavedState(prev.is_saved ?? false, prev.saved_by_me ?? false);
                      }
                    }
                  }}
                  className={cn(
                    "relative inline-block max-w-full min-w-[2rem] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ring-1 transition-all duration-100 select-text cursor-pointer active:scale-[0.98] hover:ring-primary/20",
                    bubbleBg, ringColor,
                    mine ? "rounded-tr-md" : "rounded-tl-md",
                    m.is_saved && "pr-8",
                    m.is_optimistic && "opacity-70 grayscale-[0.3]"
                  )}
                style={{ transform: `translateX(${slideOffset}px)`, maxWidth: "100%", overflowWrap: "anywhere" }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {m.replied_message && (
                  <div className="mb-2 max-w-full rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs">
                    <div className="break-all whitespace-normal text-[11px] font-medium leading-relaxed opacity-80" style={{ overflowWrap: "anywhere" }}>
                      {m.replied_message.sender_name ? `${m.replied_message.sender_name}: ` : ""}
                      {m.replied_message.message_type === "text" ? m.replied_message.content : m.replied_message.media_name}
                    </div>
                  </div>
                )}

                {m.media_path && (
                  <MediaBlock
                    m={m}
                    onViewOnceOpen={async () => {
                      if (isViewOnce && !mine && !isViewed) {
                        const { markViewed: mv } = await import("@/lib/message-delete.functions");
                      }
                    }}
                    mine={mine}
                  />
                )}

                {editing ? (
                  <div className="space-y-2">
                    <Textarea
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={2}
                      className="min-h-0 resize-none border-0 bg-transparent p-0 text-sm focus-visible:ring-0"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={commit} className="h-7 text-xs">Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 text-xs">Cancel</Button>
                    </div>
                  </div>
                ) : (
                  m.content && <p className="whitespace-pre-wrap break-all" style={{ overflowWrap: "anywhere" }}>{m.content}</p>
                )}

                {m.is_saved && (
                  <div className={cn("absolute right-2 top-2", mine ? "text-yellow-400" : "text-yellow-400")}>
                    <Star className="size-3 fill-current" />
                  </div>
                )}

                {isViewOnce && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                    {isViewed ? <><Eye className="size-3" /><span>Viewed</span></> : <><EyeOff className="size-3" /><span>View once</span></>}
                  </div>
                )}

                {m.disappear_after_view && !mine && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                    <EyeOff className="size-3" />
                    <span>Deletes after viewing</span>
                  </div>
                )}

                {remainingViews !== null && remainingViews > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                    <Eye className="size-3" />
                    <span>{remainingViews} view{remainingViews !== 1 ? "s" : ""} remaining</span>
                  </div>
                )}
              </div>
            </div>

              {Object.keys(reactionCounts).length > 0 && (
                <div className={cn("flex flex-wrap gap-1", mine && "flex-row-reverse")}>
                  {Object.entries(reactionCounts).map(([emoji, count]) => (
                    <button
                      key={emoji}
                      onClick={() => handleReact(emoji)}
                      className={cn(
                        "flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-xs transition-all active:scale-110",
                        myReact?.emoji === emoji
                          ? "bg-primary/20 border-primary/30 text-primary"
                          : "bg-background/80 border-border text-foreground hover:bg-muted",
                      )}
                    >
                      <span>{emoji}</span>
                      {count > 1 && <span className="text-[10px] opacity-70">{count}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={cn("mt-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground", mine && "flex-row-reverse")}>
              <span>{formatTime(m.created_at)}</span>
              {m.edited && <span className="italic">edited</span>}
              {m.is_optimistic ? (
                <Clock className="size-3 animate-pulse text-muted-foreground" />
              ) : mine && (
                m.read_at ? <CheckCheck className="size-3 text-foreground/70" /> : <Check className="size-3" />
              )}
              {m.send_failed && (
                <button
                  onClick={async () => {
                    setMessageField({ is_optimistic: true, send_failed: false });
                    try {
                      await retrySend({
                        data: {
                          conversationId: m.conversation_id,
                          content: m.content ?? undefined,
                          replyTo: m.reply_to ?? undefined,
                          viewOnce: m.view_once,
                          disappearAfterView: m.disappear_after_view,
                          viewLimit: m.view_limit,
                        },
                      });
                    } catch (err) {
                      setMessageField({ is_optimistic: false, send_failed: true });
                    }
                  }}
                  className="text-red-400"
                  aria-label="Retry send"
                >
                  <RefreshCw className="size-3" />
                </button>
              )}
              {mine && !editing && m.content && (
                <button
                  onClick={() => { setDraft(m.content ?? ""); setEditing(true); }}
                  className="opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Edit2 className="size-3" />
                </button>
              )}
              <button
                onClick={() => onReply?.(m)}
                onMouseEnter={() => setHovering(true)}
                onMouseLeave={() => setHovering(false)}
                className="hidden md:block opacity-0 transition-all duration-200 group-hover:opacity-100"
              >
                <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded transition-all", hovering && "scale-110")}>
                  <RotateCcw className={cn("transition-all", hovering ? "size-4" : "size-3")} />
                  <span className={cn("text-xs font-medium transition-all opacity-0", hovering && "opacity-100")}>Reply</span>
                </div>
              </button>
            </div>
          </div>
        </ContextMenuTrigger>

        {!isDeleted && (
          <div className="hidden md:flex opacity-0 group-hover:opacity-100 transition-opacity self-start mt-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 rounded-full hover:bg-muted/50">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? "end" : "start"} className="w-56">
                <div className="flex items-center gap-1 p-2 border-b border-border/50 overflow-x-auto no-scrollbar">
                  {recentEmojis.slice(0, 4).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleReact(emoji)}
                      className={cn(
                        "text-xl p-1.5 rounded-lg transition-all active:scale-125 hover:bg-accent",
                        myReact?.emoji === emoji && "bg-primary/20 scale-110"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                  
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent border border-dashed border-border/50">
                        <Plus className="size-4 opacity-70" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent side="bottom" align="center" className="w-auto p-0 border-0 shadow-2xl">
                      <EmojiPicker
                        theme={EmojiTheme.AUTO}
                        onEmojiClick={(e) => {
                          handleReact(e.emoji);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="p-1">
                  <DropdownMenuItem onClick={() => onReply?.(m)} className="gap-2 px-3 py-2.5">
                    <RotateCcw className="size-4 opacity-70" />
                    <span>Reply</span>
                  </DropdownMenuItem>
                  
                  {m.is_saved ? (
                    m.saved_by_me ? (
                      <DropdownMenuItem
                        onClick={async () => {
                          const prev = m;
                          setSavedState(false, false);
                          try {
                            await unsave({ data: { messageId: m.id } });
                            onEdited();
                            toast.success("Message unsaved");
                          } catch (e: any) {
                            toast.error(e.message);
                            setSavedState(prev.is_saved ?? false, prev.saved_by_me ?? false);
                          }
                        }}
                        className="gap-2 px-3 py-2.5"
                      >
                        <Star className="size-4 fill-current text-yellow-400" />
                        <span>Unsave</span>
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem disabled className="gap-2 px-3 py-2.5 opacity-50 cursor-not-allowed">
                        <Star className="size-4 fill-current text-yellow-400" />
                        <span>Saved by other user</span>
                      </DropdownMenuItem>
                    )
                  ) : (
                    <DropdownMenuItem
                      onClick={async () => {
                        const prev = m;
                        setSavedState(true, true);
                        try {
                          await save({ data: { messageId: m.id } });
                          onEdited();
                          toast.success("Message saved");
                        } catch (e: any) {
                          toast.error(e.message);
                          setSavedState(prev.is_saved ?? false, prev.saved_by_me ?? false);
                        }
                      }}
                      className="gap-2 px-3 py-2.5"
                    >
                      <Star className="size-4" />
                      <span>Save Chat</span>
                    </DropdownMenuItem>
                  )}

                  {mine && m.content && (
                    <DropdownMenuItem onClick={() => { setDraft(m.content ?? ""); setEditing(true); }} className="gap-2 px-3 py-2.5">
                      <Edit2 className="size-4 opacity-70" />
                      <span>Edit</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={handleDeleteForMe} className="gap-2 px-3 py-2.5 text-muted-foreground">
                    <Trash className="size-4 opacity-70" />
                    <span>Delete for me</span>
                  </DropdownMenuItem>
                  {mine && (
                    <DropdownMenuItem onClick={handleDeleteForEveryone} className="gap-2 px-3 py-2.5 text-destructive focus:text-destructive">
                      <Trash2 className="size-4 opacity-70" />
                      <span>Delete for everyone</span>
                    </DropdownMenuItem>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      <ContextMenuContent className="w-56">
        <div className="flex items-center gap-1 p-2 border-b border-border/50 overflow-x-auto no-scrollbar">
          {recentEmojis.slice(0, 4).map((emoji) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className={cn(
                "text-xl p-1.5 rounded-lg transition-all active:scale-125 hover:bg-accent",
                myReact?.emoji === emoji && "bg-primary/20 scale-110"
              )}
            >
              {emoji}
            </button>
          ))}

          <Popover>
            <PopoverTrigger asChild>
              <button className="flex size-9 shrink-0 items-center justify-center rounded-lg hover:bg-accent border border-dashed border-border/50">
                <Plus className="size-4 opacity-70" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="bottom" align="center" className="w-auto p-0 border-0 shadow-2xl">
              <EmojiPicker
                theme={EmojiTheme.AUTO}
                onEmojiClick={(e) => {
                  handleReact(e.emoji);
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="p-1">
          <ContextMenuItem onClick={() => onReply?.(m)} className="gap-2 px-3 py-2.5">
            <RotateCcw className="size-4 opacity-70" />
            <span>Reply</span>
          </ContextMenuItem>
          
          {m.is_saved ? (
            m.saved_by_me ? (
              <ContextMenuItem
                onClick={async () => {
                          const prev = m;
                          setSavedState(false, false);
                          try {
                            await unsave({ data: { messageId: m.id } });
                            onEdited();
                            toast.success("Message unsaved");
                          } catch (e: any) {
                            toast.error(e.message);
                            setSavedState(prev.is_saved ?? false, prev.saved_by_me ?? false);
                          }
                        }}
                        className="gap-2 px-3 py-2.5"
                      >
                        <Star className="size-4 fill-current text-yellow-400" />
                        <span>Unsave</span>
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem disabled className="gap-2 px-3 py-2.5 opacity-50 cursor-not-allowed">
                        <Star className="size-4 fill-current text-yellow-400" />
                        <span>Saved by other user</span>
                      </ContextMenuItem>
                    )
                  ) : (
                    <ContextMenuItem
                      onClick={async () => {
                        const prev = m;
                        setSavedState(true, true);
                        try {
                          await save({ data: { messageId: m.id } });
                          onEdited();
                          toast.success("Message saved");
                        } catch (e: any) {
                          toast.error(e.message);
                          setSavedState(prev.is_saved ?? false, prev.saved_by_me ?? false);
                        }
                      }}
                      className="gap-2 px-3 py-2.5"
                    >
                      <Star className="size-4" />
                      <span>Save Chat</span>
                    </ContextMenuItem>
                  )}

                  {mine && m.content && (
                    <ContextMenuItem onClick={() => { setDraft(m.content ?? ""); setEditing(true); }} className="gap-2 px-3 py-2.5">
                      <Edit2 className="size-4 opacity-70" />
                      <span>Edit</span>
                    </ContextMenuItem>
                  )}

          <ContextMenuSeparator />
          
          <ContextMenuItem onClick={handleDeleteForMe} className="gap-2 px-3 py-2.5 text-muted-foreground">
            <Trash className="size-4 opacity-70" />
            <span>Delete for me</span>
          </ContextMenuItem>
          
          {mine && (
            <ContextMenuItem onClick={handleDeleteForEveryone} className="gap-2 px-3 py-2.5 text-destructive focus:text-destructive">
              <Trash2 className="size-4 opacity-70" />
              <span>Delete for everyone</span>
            </ContextMenuItem>
          )}
        </div>
      </ContextMenuContent>
    </ContextMenu>
  );
});

function MediaBlock({ m, onViewOnceOpen, mine }: { m: Message; onViewOnceOpen?: () => void; mine: boolean }) {
  const sign = useServerFn(signedMediaUrl);
  const [url, setUrl] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const markViewedFn = useServerFn(markViewed);
  const queryClient = useQueryClient();

  const isViewOnce = m.view_once;
  const isViewed = !!m.viewed_at;
  const hasViewLimit = m.view_limit != null && m.view_limit > 0;
  const hasExpiry = m.disappear_after_view;

  useEffect(() => {
    if (!m.media_path) return;
    let cancel = false;
    sign({ data: { path: m.media_path } })
      .then((r) => !cancel && setUrl(r.url))
      .catch(() => {});
    return () => { cancel = true; };
  }, [m.media_path, sign]);

  const handleView = async () => {
    // Mark as viewed for view_once, view_limit, or disappear_after_view
    if (!mine && !opened) {
      setOpened(true);
      // Call markViewed to increment view count and handle deletion
      try {
        await markViewedFn({ data: { messageId: m.id } });
        // Invalidate messages to refresh view count
        queryClient.invalidateQueries({ queryKey: ["messages", m.conversation_id] });
      } catch {}
      onViewOnceOpen?.();
    }
  };

  // Show "Viewed" placeholder for view_once messages that have been viewed
  if (isViewOnce && isViewed && !opened) {
    return (
      <div className="mb-2 rounded-xl bg-white/10 p-4 text-center text-xs opacity-70">
        <EyeOff className="mx-auto mb-1 size-4" />
        <p>Viewed</p>
      </div>
    );
  }

  if (m.message_type === "image") {
    return (
      <div className="mb-2 overflow-hidden rounded-xl ring-1 ring-black/10">
        {(isViewOnce || hasExpiry) && !opened && !mine ? (
          <button
            onClick={handleView}
            className="flex h-40 w-full flex-col items-center justify-center gap-2 bg-white/10 text-xs opacity-70 transition-opacity hover:opacity-100"
          >
            <EyeOff className="size-5" />
            <span>Tap to view once</span>
          </button>
        ) : (
          <a href={url ?? "#"} target="_blank" rel="noreferrer" className="block" onClick={!opened && !mine && (hasViewLimit || hasExpiry) ? handleView : undefined}>
            {url ? <img src={url} alt={m.media_name ?? ""} className="max-h-80 w-full object-cover" /> : <div className="h-40 animate-pulse bg-muted-foreground/10" />}
          </a>
        )}
      </div>
    );
  }

  if (m.message_type === "video") {
    return (
      <div className="mb-2 overflow-hidden rounded-xl ring-1 ring-black/10">
        {(isViewOnce || hasExpiry) && !opened && !mine ? (
          <button onClick={handleView} className="flex h-40 w-full flex-col items-center justify-center gap-2 bg-white/10 text-xs opacity-70 transition-opacity hover:opacity-100">
            <EyeOff className="size-5" /><span>Tap to view once</span>
          </button>
        ) : url ? <video src={url} controls className="max-h-80 w-full" onPlaying={!opened && !mine && (hasViewLimit || hasExpiry) ? handleView : undefined} /> : <div className="h-40 animate-pulse bg-muted-foreground/10" />}
      </div>
    );
  }

  if (m.message_type === "audio") {
    return (
      <div className="mb-2 p-1">
        {url ? <AudioPlayer src={url} /> : <div className="h-10 w-48 animate-pulse bg-muted-foreground/10 rounded-lg" />}
      </div>
    );
  }

  return (
    <a href={url ?? "#"} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-3 rounded-xl bg-black/10 p-3 text-xs">
      <FileText className="size-5 shrink-0" />
      <div className="min-w-0">
        <div className="truncate font-medium">{m.media_name}</div>
        {m.media_size && <div className="text-[10px] opacity-70">{(m.media_size / 1024).toFixed(0)} KB</div>}
      </div>
    </a>
  );
}

function AudioPlayer({ src }: { src: string }) {
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (audioRef.current) {
      if (playing) audioRef.current.pause();
      else audioRef.current.play();
      setPlaying(!playing);
    }
  };

  const format = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3 bg-black/5 rounded-xl p-2 min-w-[200px]">
      <Button size="icon" variant="ghost" className="size-8 shrink-0" onClick={toggle}>
        {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
      </Button>
      <div className="flex-1 space-y-1">
        <div className="h-1 bg-black/10 rounded-full overflow-hidden">
          <div className="h-full bg-primary transition-all duration-100" style={{ width: `${(currentTime / (duration || 1)) * 100}%` }} />
        </div>
        <div className="flex justify-between text-[10px] tabular-nums opacity-70">
          <span>{format(currentTime)}</span>
          <span>{format(duration)}</span>
        </div>
      </div>
      <audio ref={audioRef} src={src}
        onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
        onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
        onEnded={() => setPlaying(false)}
        className="hidden"
      />
    </div>
  );
}
