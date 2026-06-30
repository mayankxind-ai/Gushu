import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getConversation } from "@/lib/conversations.functions";
import { listMessages, markRead } from "@/lib/messages.functions";
import { markViewed } from "@/lib/message-delete.functions";
import { updatePresence, getTypingStatus } from "@/lib/presence.functions";
import { getConversationSettings, verifyConversationSecretCode, updateLastExit, enterChat } from "@/lib/conversation-settings.functions";
import { subscribeToMessageNotifications } from "@/lib/notification-service";
import { ChatHeader } from "@/components/chat-header";
import { MessageBubble } from "@/components/message-bubble";
import { TypingBubble } from "@/components/typing-indicator";
import { Composer } from "@/components/composer";
import { PinDialog } from "@/components/pin-dialog";
import { SecretCodeDialog } from "@/components/secret-code-dialog";
import { Loader as Loader2, CircleAlert as AlertCircle, Lock, KeyRound } from "lucide-react";
import { debounceInvalidation } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useHiddenStore } from "@/lib/hidden-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { verifyConversationPin } from "@/lib/conversation-settings.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/app/c/$conversationId")({
  component: ChatPage,
});

const THEME_BG: Record<string, string> = {
  obsidian: "",
  midnight: "bg-blue-950/30",
  neon: "bg-violet-950/30",
  emerald: "bg-emerald-950/30",
  graphite: "bg-neutral-800/30",
};

const WALLPAPER_STYLE: Record<string, string> = {
  none: "",
  grid: "bg-[radial-gradient(circle,_rgba(255,255,255,0.05)_1px,_transparent_1px)] bg-[size:20px_20px]",
  dots: "bg-[radial-gradient(rgba(255,255,255,0.1)_1px,_transparent_1px)] bg-[size:16px_16px]",
  waves: "bg-gradient-to-br from-blue-950/20 via-blue-900/20 to-blue-950/20",
  aurora: "bg-gradient-to-br from-emerald-950/20 via-teal-900/20 to-emerald-950/20",
};

function ChatPage() {
  const { conversationId } = Route.useParams();
  const { user } = Route.useRouteContext();
  const meId = user.id;
  const getConv = useServerFn(getConversation);
  const listMsgs = useServerFn(listMessages);
  const mark = useServerFn(markRead);
  const markView = useServerFn(markViewed);
  const updatePres = useServerFn(updatePresence);
  const getTyping = useServerFn(getTypingStatus);
  const getSettings = useServerFn(getConversationSettings);
  const verifyPin = useServerFn(verifyConversationPin);
  const verifySecret = useServerFn(verifyConversationSecretCode);
  const exitMsg = useServerFn(updateLastExit);
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [replyTarget, setReplyTarget] = useState<any | null>(null);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSecretUnlocked, setIsSecretUnlocked] = useState(false);
  const [showPinPrompt, setShowPinPrompt] = useState(false);
  const [showSecretPrompt, setShowSecretPrompt] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const isUnlockedGlobally = useHiddenStore((s: any) => s.isUnlocked(conversationId));
  const unlockGlobally = useHiddenStore((s: any) => s.unlock);
  const isMobile = useIsMobile();
  const realtimeRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const notifRef = useRef<(() => void) | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const conv = useQuery({
    queryKey: ["conversation", conversationId],
    queryFn: () => getConv({ data: { id: conversationId } }),
    staleTime: 30000,
  });

  const settingsQuery = useQuery({
    queryKey: ["conv-settings", conversationId],
    queryFn: () => getSettings({ data: { conversationId } }),
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  const settings = settingsQuery.data ?? null;
  const isLocked = !!settings?.is_locked && !!settings?.pin_hash && !isUnlocked;
  const isHiddenLocked = !!settings?.is_hidden && !!settings?.secret_code_hash && !isSecretUnlocked && !isUnlockedGlobally;

  // Show prompts if locked/hidden
  useEffect(() => {
    if (isLocked) {
      setIsUnlocked(false);
      setShowPinPrompt(true);
    }
  }, [isLocked, conversationId]);

  useEffect(() => {
    if (isHiddenLocked) {
      setIsSecretUnlocked(false);
      setShowSecretPrompt(true);
    }
  }, [isHiddenLocked, conversationId]);

  const msgs = useQuery({
    queryKey: ["messages", conversationId],
    queryFn: async () => {
      const result = await listMsgs({ data: { conversationId } });
      return result;
    },
    enabled: !isLocked && !isHiddenLocked,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const hasSavedByMe = (msgs.data ?? []).some((m: any) => m.saved_by_me);

  useEffect(() => {
    if (msgs.data) {
      // Trigger re-render for dynamic UI updates
    }
  }, [conversationId, msgs.data]);

  // Force re-render every second to handle "live" disappearing of messages
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!conversationId) return;
    if (realtimeRef.current) {
      supabase.removeChannel(realtimeRef.current);
      realtimeRef.current = null;
    }

    const ch = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          let msg = payload.new as any;
          if (!msg) return;

          queryClient.setQueryData(["messages", conversationId], (old: any) => {
            if (!Array.isArray(old)) return old;
            // Enrich replied_message if possible using local cache
            if (msg.reply_to) {
              const ref = (old || []).find((r: any) => r.id === msg.reply_to);
              if (ref) {
                msg = {
                  ...msg,
                  replied_message: {
                    id: ref.id,
                    content: ref.content ?? null,
                    message_type: ref.message_type ?? ref.message_type,
                    media_name: ref.media_name ?? null,
                    sender_id: ref.sender_id ?? null,
                    sender_name: ref.replied_message?.sender_name ?? null,
                  },
                };
              }
            }

            switch (payload.eventType) {
              case "INSERT": {
                // If server message already exists by id, ignore
                if (old.some((item) => item.id === msg.id)) return old;

                // If an optimistic message likely matches this server message, replace it instead of appending
                const confirmedTs = new Date(msg.created_at).getTime();
                for (let i = 0; i < old.length; i++) {
                  const item = old[i];
                  if (!item.is_optimistic) continue;
                  if (item.sender_id === msg.sender_id && item.content === msg.content && (item.reply_to ?? null) === (msg.reply_to ?? null)) {
                    const optTs = new Date(item.created_at).getTime();
                    if (Math.abs(optTs - confirmedTs) < 5000) {
                      const copy = old.slice();
                      copy[i] = { ...msg, is_optimistic: false, replied_message: item.replied_message ?? msg.replied_message ?? null };
                      return copy;
                    }
                  }
                }

                return [...old, msg];
              }
              case "UPDATE":
                return old.map((item) => (item.id === msg.id ? { ...item, ...msg } : item));
              case "DELETE":
                return old.filter((item) => item.id !== msg.id);
              default:
                return old;
            }
          });

          queryClient.setQueryData(["conversations"], (old: any) => {
            if (!Array.isArray(old)) return old;
            return old.map((conv: any) => {
              if (conv.id !== conversationId) return conv;
              return {
                ...conv,
                last: msg ? {
                  content: msg.content,
                  message_type: msg.message_type,
                  created_at: msg.created_at,
                  sender_id: msg.sender_id,
                } : conv.last,
                last_message_at: msg?.created_at ?? conv.last_message_at,
              };
            });
          });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_settings", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        queryClient.invalidateQueries({ queryKey: ["conv-settings", conversationId] });
        
        const oldCleared = (payload.old as any)?.cleared_at ?? null;
        const newCleared = (payload.new as any)?.cleared_at ?? null;
        if (oldCleared !== newCleared) {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_deletions" }, (payload) => {
        const row = (payload.new ?? payload.old) as { message_id?: string; user_id?: string } | null;
        if (!row || row.user_id !== meId || !row.message_id) return;
        queryClient.setQueryData(["messages", conversationId], (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.filter((item) => item.id !== row.message_id);
        });
      })
      .subscribe();

    realtimeRef.current = ch;

    return () => {
      if (realtimeRef.current) {
        supabase.removeChannel(realtimeRef.current);
        realtimeRef.current = null;
      }
    };
  }, [conversationId, queryClient]);

  useEffect(() => {
    if (!msgs.data?.length || isLocked) return;
    const nowString = new Date().toISOString();
    
    // Skip if there are no unread messages from the other user
    const hasUnread = msgs.data.some((msg: any) => msg.sender_id !== meId && !msg.read_at);
    if (!hasUnread) return;

    queryClient.setQueryData(["messages", conversationId], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((msg: any) => {
        if (msg.sender_id === meId || msg.read_at) return msg;
        return { ...msg, read_at: nowString };
      });
    });
    mark({ data: { conversationId } }).catch(() => {});
  }, [conversationId, msgs.data, isLocked, mark, meId, queryClient]);

  // DAV: Record viewed state in message_user_views for disappear_after_view messages
  // This is the critical step that enables updateLastExit to know whether the recipient
  // has viewed the message. Without this, message_user_views is always empty and
  // the delete-after-viewing lifecycle never completes.
  useEffect(() => {
    if (!msgs.data?.length || isLocked) return;
    const davMessages = msgs.data.filter(
      (msg: any) => msg.disappear_after_view && msg.sender_id !== meId
    );
    if (davMessages.length === 0) return;

    // Mark each DAV message as viewed for this user (idempotent — upsert on server)
    for (const msg of davMessages) {
      markView({ data: { messageId: msg.id } }).catch(() => {});
    }
  }, [conversationId, msgs.data, isLocked, meId, markView]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [msgs.data?.length]);

  // Presence heartbeat
  useEffect(() => {
    if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
    updatePres({ data: undefined as any }).catch(() => {});
    presenceTimerRef.current = setInterval(() => updatePres({ data: undefined as any }).catch(() => {}), 1000);
    return () => {
      if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
    };
  }, [updatePres]);

  // Presence heartbeat & Active Conversation tracking (Instant Cleanup focus)
  useEffect(() => {
    if (!meId || !conversationId) return;

    const upsertPresence = async () => {
      try {
        await enterChat({ data: { conversationId } });
      } catch (err) {
        // Presence upsert failed silently
      }
    };

    const removePresence = async () => {
      try {
        await supabase
          .from("active_conversations" as any)
          .delete()
          .eq("user_id", meId);
      } catch (err) {
        // Silently fail on unmount cleanup
      }
    };

    // 1. Immediate upsert on mount if active
    if (document.visibilityState === 'visible' && document.hasFocus()) {
      upsertPresence();
    }

    // 2. Heartbeat every 20s (as secondary/safety mechanism)
    const heartbeatInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        upsertPresence();
      }
    }, 20000);

    // 3. Lifecycle Listeners for instant response
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        removePresence();
      } else {
        upsertPresence();
      }
    };

    const handleFocus = () => upsertPresence();
    const handleBlur = () => removePresence();

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);

    const handleBeforeUnload = () => {
      try {
        void exitMsg({ data: { conversationId } }).catch(() => {});
      } catch (_) {}
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // 4. Instant cleanup on navigation/unmount
    return () => {
      clearInterval(heartbeatInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      removePresence();
      void exitMsg({ data: { conversationId } })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        })
        .catch(() => {});
    };
  }, [meId, conversationId]);

  // Typing indicator polling
  useEffect(() => {
    if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    const poll = async () => {
      try {
        const result = await getTyping({ data: { conversationId } });
        setIsTyping(result.typingUsers.length > 0);
      } catch {}
    };
    poll();
    typingTimerRef.current = setInterval(poll, 500);
    return () => {
      if (typingTimerRef.current) clearInterval(typingTimerRef.current);
    };
  }, [conversationId, getTyping]);

  // Global notification feed is handled by the app shell; chat page relies on realtime updates and local cache mutations.

  const onEdited = useCallback(() => {}, []);

  function handleSettingsChange(partial: any) {
    queryClient.setQueryData(["conv-settings", conversationId], (old: any) => ({ ...old, ...partial }));
  }

  async function handlePinVerify(pin: string): Promise<boolean | void> {
    const { valid } = await verifyPin({ data: { conversationId, pin } });
    if (!valid) return false;
    setIsUnlocked(true);
    setShowPinPrompt(false);
  }  async function handleSecretVerify(code: string): Promise<boolean | void> {
    const { valid } = await verifySecret({ data: { conversationId, code } });
    if (!valid) return false;
    unlockGlobally(conversationId);
    setIsSecretUnlocked(true);
    setShowSecretPrompt(false);
  }


  const theme = settings?.theme ?? "obsidian";
  const wallpaper = settings?.wallpaper_url ?? "none";
  const wallpaperClass = WALLPAPER_STYLE[wallpaper] ?? "";
  const themeBg = THEME_BG[theme] ?? "";


  return (
    <div className={cn("flex h-full min-h-0 flex-col", themeBg)}>
      <ChatHeader
        conversationId={conversationId}
        other={conv.data?.other ?? null}
        onLeft={() => queryClient.invalidateQueries({ queryKey: ["conversations"] })}
        settings={settings}
        onSettingsChange={handleSettingsChange}
        onUnlocked={() => setIsUnlocked(true)}
        isUnlocked={isUnlocked}
        isHiddenLocked={isHiddenLocked}
        loading={conv.isLoading && !conv.data}
        isCollapsed={isInputFocused}
        hasSavedByMe={hasSavedByMe}
      />

      {/* Locked screen */}
      {isLocked || isHiddenLocked ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="rounded-full bg-slate-400/10 p-4">
            {isHiddenLocked ? <KeyRound className="size-10 text-slate-400" /> : <Lock className="size-10 text-amber-400" />}
          </div>
          <div>
            <h3 className="font-display text-xl text-foreground">
              {isHiddenLocked ? "Hidden Chat" : "This chat is locked"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {isHiddenLocked ? "Enter secret code to reveal conversation" : "Enter your PIN to view messages"}
            </p>
          </div>
          <button
            onClick={() => isHiddenLocked ? setShowSecretPrompt(true) : setShowPinPrompt(true)}
            className="rounded-xl bg-foreground px-6 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {isHiddenLocked ? "Unlock with Code" : "Enter PIN"}
          </button>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-6 space-y-5 sm:px-8 no-scrollbar", wallpaperClass)}
          >
            {msgs.isLoading && (
              <div className="grid h-full place-items-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {msgs.isError && (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-red-400">
                <AlertCircle className="size-5" />
                <p>Failed to load messages</p>
                <button
                  onClick={() => msgs.refetch()}
                  className="text-xs underline underline-offset-2 hover:no-underline"
                >
                  Try again
                </button>
              </div>
            )}
            {msgs.data?.filter((m: any) => {
              // Local filter: Hide if expired and NOT saved.
              if (m.is_saved) return true;
              
              if (settings?.cleared_at) {
                const clearedAt = new Date(settings.cleared_at).getTime();
                const createdAt = new Date(m.created_at).getTime();
                if (createdAt <= clearedAt) return false;
              }

              const now = Date.now();

              // In the new static model, we rely strictly on expires_at.
              // If expires_at is NULL, it's either unread or "Never" active.
              if (!m.expires_at) return true;
              
              return new Date(m.expires_at).getTime() > now;
            }).map((m: any, idx: number) => {
              if (m.message_type === "system") {
                return (
                  <div key={m.id} className="flex justify-center my-6">
                    <span className="px-4 py-1.5 bg-neutral-800/40 backdrop-blur-sm border border-white/5 text-neutral-400 text-[10px] rounded-full uppercase tracking-widest font-semibold shadow-xl">
                      {m.content}
                    </span>
                  </div>
                );
              }

              return (
              <div 
                key={m.id} 
                className={cn(
                  "animate-in-fade",
                  idx < 8 && `stagger-${Math.min(idx + 1, 5)}`
                )}
              >
                <MessageBubble
                  m={m as any}
                  mine={m.sender_id === meId}
                  onEdited={onEdited}
                  onReply={(mm) => setReplyTarget(mm)}
                  meId={meId}
                  theme={theme}
                />
              </div>
            );
          })}
            {isTyping && <TypingBubble />}
            {msgs.data && msgs.data.length === 0 && !msgs.isLoading && (
              <div className="flex h-full min-h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
                <div>
                  <p>This is a fresh, private conversation.</p>
                  <p className="mt-1 text-xs">Say hello — messages disappear when you both leave.</p>
                </div>
              </div>
            )}
          </div>
          <Composer
            conversationId={conversationId}
            replyTo={replyTarget}
            onCancelReply={() => setReplyTarget(null)}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            isTyping={isTyping}
            other={conv.data?.other ?? null}
            meId={meId}
          />
        </>
      )}

      {showPinPrompt && (
        <PinDialog
          open
          title="Chat is Locked"
          description="Enter your 6-digit PIN to unlock"
          onSubmit={handlePinVerify}
          onCancel={() => setShowPinPrompt(false)}
          errorMessage="Incorrect PIN"
        />
      )}

      {showSecretPrompt && (
        <SecretCodeDialog
          open
          title="Hidden Conversation"
          description="Enter your secret code to reveal this chat"
          onSubmit={handleSecretVerify}
          onCancel={() => setShowSecretPrompt(false)}
          errorMessage="Incorrect Secret Code"
        />
      )}
    </div>
  );
}
