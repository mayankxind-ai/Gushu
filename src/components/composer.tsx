import { useRef, useState, useEffect, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, Send, Smile, Loader as Loader2, X, Mic, Camera, EyeOff } from "lucide-react";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTrigger, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { VoiceRecorder } from "./voice-recorder";
import { CameraCapture } from "./camera-capture";
import { PrivacyOptionsPicker, type PrivacyOption } from "./privacy-options-picker";
import { createMediaUpload, sendMessage } from "@/lib/messages.functions";
import { setTyping, clearTyping } from "@/lib/presence.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { isOnline, formatRelative } from "@/lib/format";
import { TypingIndicator } from "@/components/typing-indicator";

const MAX_MESSAGE_LENGTH = 4000;

function kindForMime(mime: string): "image" | "video" | "file" {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export function Composer({
  conversationId,
  replyTo,
  onCancelReply,
  onFocus,
  onBlur,
  isTyping,
  other,
  meId,
}: {
  conversationId: string;
  replyTo?: any | null;
  onCancelReply?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  isTyping?: boolean;
  other?: any | null;
  meId: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [drag, setDrag] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [privacyOption, setPrivacyOption] = useState<PrivacyOption>({
    viewOnce: false,
    disappearAfterView: false,
    viewLimit: null,
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submittingRef = useRef(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const send = useServerFn(sendMessage);
  const createUpload = useServerFn(createMediaUpload);
  const setTypingStatus = useServerFn(setTyping);
  const clearTypingStatus = useServerFn(clearTyping);
  const queryClient = useQueryClient();

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      // Clear typing status when component unmounts
      clearTypingStatus({ data: { conversationId } }).catch(() => {});
    };
  }, [conversationId, clearTypingStatus]);

  // Send typing status with debounce
  const handleTyping = useCallback(
    (currentText: string) => {
      if (!currentText.trim()) {
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        clearTypingStatus({ data: { conversationId } }).catch(() => {});
        return;
      }

      // Send typing status at most every 1 second
      const now = Date.now();
      if (now - lastTypingSentRef.current > 1000) {
        setTypingStatus({ data: { conversationId } }).catch(() => {});
        lastTypingSentRef.current = now;
      }

      // Clear typing after 3 seconds of inactivity
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        clearTypingStatus({ data: { conversationId } }).catch(() => {});
      }, 3000);
    },
    [conversationId, setTypingStatus, clearTypingStatus],
  );

  async function uploadAndSend(file: File) {
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File too large (max 25 MB)");
      return;
    }
    setBusy(true);
    try {
      const { path, token } = await createUpload({
        data: {
          conversationId,
          name: file.name,
          mime: file.type || "application/octet-stream",
          size: file.size,
        },
      });
      const { error } = await supabase.storage
        .from("chat-media")
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (error) throw error;
      await send({
        data: {
          conversationId,
          media: {
            path,
            mime: file.type || "application/octet-stream",
            name: file.name,
            size: file.size,
            kind: kindForMime(file.type),
          },
          viewOnce: privacyOption.viewOnce,
          disappearAfterView: privacyOption.disappearAfterView,
          viewLimit: privacyOption.viewLimit,
        },
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  const uploadAndSendMedia = useCallback(
    async (blob: Blob, kind: "image" | "audio" | "video", name: string) => {
      setBusy(true);
      try {
        const { path, token } = await createUpload({
          data: {
            conversationId,
            name,
            mime: blob.type,
            size: blob.size,
          },
        });
        const { error } = await supabase.storage
          .from("chat-media")
          .uploadToSignedUrl(path, token, blob, {
            contentType: blob.type,
          });
        if (error) throw error;
        await send({
          data: {
            conversationId,
            media: {
              path,
              mime: blob.type,
              name,
              size: blob.size,
              kind,
            },
            viewOnce: privacyOption.viewOnce,
            disappearAfterView: privacyOption.disappearAfterView,
            viewLimit: privacyOption.viewLimit,
          },
        });
        if (kind === "audio") setShowVoice(false);
        if (kind === "image" || kind === "video") setShowCamera(false);
        setPrivacyOption({ viewOnce: false, disappearAfterView: false, viewLimit: null });
      } catch (e: any) {
        toast.error(e?.message ?? "Upload failed");
      } finally {
        setBusy(false);
      }
    },
    [conversationId, createUpload, send, privacyOption],
  );

  const refocusInput = useCallback(() => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
  }, []);

  async function submit() {
    const content = text.trim();
    if (!content || busy) return;

    if (content.length > MAX_MESSAGE_LENGTH) {
      toast.error("Message cannot exceed 4000 characters.");
      setText(content.slice(0, MAX_MESSAGE_LENGTH));
      return;
    }

    submittingRef.current = true;

    const queryKey = ["messages", conversationId];
    const optimisticId = crypto.randomUUID();
    const createdAt = new Date().toISOString();

    const repliedMessage = replyTo
      ? {
          id: replyTo.id,
          content: replyTo.content,
          message_type: replyTo.message_type,
          media_name: replyTo.media_name,
          sender_id: replyTo.sender_id,
          sender_name:
            replyTo.sender_id === meId
              ? "You"
              : other?.display_name || other?.username || "Other",
        }
      : null;

    const newMessage = {
      id: optimisticId,
      conversation_id: conversationId,
      sender_id: meId,
      content,
      reply_to: replyTo?.id ?? null,
      replied_message: repliedMessage,
      created_at: createdAt,
      message_type: "text" as const,
      is_optimistic: true,
      read_at: null,
      edited: false,
      reactions: [],
      is_saved: false,
      saved_by_me: false,
    };

    setText("");
    queryClient.setQueryData(queryKey, (old: any) => {
      return [...(old || []), newMessage];
    });
    queryClient.setQueryData(["conversations"], (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map((conv: any) => {
        if (conv.id !== conversationId) return conv;
        return {
          ...conv,
          last: {
            content,
            message_type: "text",
            created_at: createdAt,
            sender_id: meId,
          },
          last_message_at: createdAt,
          unread: 0,
        };
      });
    });

    setBusy(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    try {
      clearTypingStatus({ data: { conversationId } }).catch(() => {});

      const confirmedMessage = await send({
        data: {
          conversationId,
          content,
          replyTo: replyTo?.id,
          viewOnce: privacyOption.viewOnce,
          disappearAfterView: privacyOption.disappearAfterView,
          viewLimit: privacyOption.viewLimit,
        },
      });

      if (confirmedMessage) {
        queryClient.setQueryData(queryKey, (old: any) => {
          const list = (old || []).slice();
          const alreadyHasConfirmed = list.some((item: any) => item.id === confirmedMessage.id);
          if (alreadyHasConfirmed) {
            return list.filter((item: any) => item.id !== optimisticId);
          }

          let replaced = false;
          for (let i = 0; i < list.length; i++) {
            const msg = list[i];
            if (msg.id === optimisticId) {
              list[i] = {
                ...confirmedMessage,
                is_optimistic: false,
                reactions: msg.reactions ?? confirmedMessage.reactions ?? [],
                is_saved: msg.is_saved ?? confirmedMessage.is_saved,
                saved_by_me: msg.saved_by_me ?? confirmedMessage.saved_by_me,
                replied_message: msg.replied_message ?? confirmedMessage.replied_message ?? null,
              };
              replaced = true;
              break;
            }
          }

          if (!replaced) {
            const confirmedTs = new Date(confirmedMessage.created_at).getTime();
            for (let i = 0; i < list.length; i++) {
              const msg = list[i];
              if (!msg.is_optimistic) continue;
              if (msg.sender_id === confirmedMessage.sender_id && msg.content === confirmedMessage.content && (msg.reply_to ?? null) === (confirmedMessage.reply_to ?? null)) {
                const optTs = new Date(msg.created_at).getTime();
                if (Math.abs(optTs - confirmedTs) < 5000) {
                  list[i] = {
                    ...confirmedMessage,
                    is_optimistic: false,
                    reactions: msg.reactions ?? confirmedMessage.reactions ?? [],
                    is_saved: msg.is_saved ?? confirmedMessage.is_saved,
                    saved_by_me: msg.saved_by_me ?? confirmedMessage.saved_by_me,
                    replied_message: msg.replied_message ?? confirmedMessage.replied_message ?? null,
                  };
                  replaced = true;
                  break;
                }
              }
            }
          }

          if (!replaced) {
            list.push(confirmedMessage);
          }
          return list;
        });
      }

      onCancelReply?.();
      setPrivacyOption({ viewOnce: false, disappearAfterView: false, viewLimit: null });
    } catch (e: any) {
      toast.error(e?.message ?? "Send failed");
      setText(content);
      queryClient.setQueryData(queryKey, (old: any) => {
        return (old || []).map((msg: any) => {
          if (msg.id === optimisticId) {
            return { ...msg, is_optimistic: false, send_failed: true };
          }
          return msg;
        });
      });
    } finally {
      setBusy(false);
      submittingRef.current = false;
      if (isMobile) refocusInput();
    }
  }

  const isMobile = useIsMobile();

  const handleTextChange = useCallback(
    (value: string) => {
      const nextValue = value.length > MAX_MESSAGE_LENGTH ? value.slice(0, MAX_MESSAGE_LENGTH) : value;
      setText(nextValue);
      handleTyping(nextValue);

      if (value.length > MAX_MESSAGE_LENGTH) {
        toast.error("Message cannot exceed 4000 characters.");
      }
    },
    [handleTyping],
  );

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) uploadAndSend(f);
      }}
      className="relative p-2 sm:p-6"
    >
      {drag && (
        <div className="pointer-events-none absolute inset-4 grid place-items-center rounded-2xl border-2 border-dashed border-foreground/30 bg-foreground/5 text-xs uppercase tracking-widest text-foreground/70">
          Drop to send
        </div>
      )}

      {/* Floating Status Indicator for Focus - Aligned to Top Left of Textbox */}
      {other && (
        <div className={cn(
          "pointer-events-none absolute left-3 sm:left-6 top-0 z-[100] flex items-center gap-1.5 rounded-2xl border border-border bg-card/90 px-3 py-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.12)] backdrop-blur-xl transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          (isFocused || isTyping) ? "opacity-100 translate-y-[-120%] scale-100" : "opacity-0 translate-y-2 scale-90"
        )}>
          <div className="flex items-center gap-2 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider">
            {isTyping ? (
              <div className="flex items-center gap-2 text-primary">
                <div className="relative flex size-5 items-center justify-center rounded-full bg-primary/10">
                   <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                   <TypingIndicator className="scale-75" />
                </div>
                <span className="font-display lowercase italic text-primary/90">typing...</span>
              </div>
            ) : isOnline(other.last_seen_at) ? (
              <div className="flex items-center gap-1.5 text-emerald-500">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500"></span>
                </span>
                <span className="opacity-80">Online</span>
              </div>
            ) : (
              <span className="text-muted-foreground/60">Seen {formatRelative(other.last_seen_at)}</span>
            )}
          </div>
        </div>
      )}
      
      {/* Reply Section - Stacked on top for mobile, floating for desktop */}
      {replyTo && (
        <div className="mx-auto mb-2 max-w-4xl px-2 md:px-0">
          <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-2 text-sm shadow-sm backdrop-blur-sm">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="mt-1 size-1 shrink-0 rounded-full bg-primary" />
              <div className="min-w-0 flex-1 break-all whitespace-normal text-muted-foreground" style={{ overflowWrap: "anywhere" }}>
                <span className="font-semibold text-foreground">
                  {replyTo.sender_name ? `${replyTo.sender_name}: ` : ""}
                </span>
                {replyTo.content ?? replyTo.media_name ?? "message"}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => onCancelReply?.()}
            >
              <X className="size-3" />
            </Button>
          </div>
        </div>
      )}

      <div className="relative mx-auto flex max-w-4xl items-end gap-1.5 rounded-2xl bg-card/80 p-1.5 ring-1 ring-border backdrop-blur sm:gap-2 sm:p-2">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8 sm:size-10"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          aria-label="Attach"
        >
          <Paperclip className="size-4" />
        </Button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadAndSend(f);
            e.currentTarget.value = "";
          }}
        />
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            handleTextChange(e.target.value);
          }}
          onFocus={() => {
            setIsFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            if (submittingRef.current) return;
            setIsFocused(false);
            onBlur?.();
            // Clear typing on blur
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            clearTypingStatus({ data: { conversationId } }).catch(() => {});
          }}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Type a message…"
          maxLength={MAX_MESSAGE_LENGTH}
          className="min-h-[40px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-sm focus-visible:ring-0 sm:py-2"
        />
        
        <EmojiPickerWrapper text={text} setText={setText} />

        {!text.trim() && !busy && (
          <div className="flex items-center gap-1 sm:gap-2">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 sm:size-10 text-muted-foreground hover:text-primary"
              onClick={() => setShowCamera(true)}
              aria-label="Camera"
            >
              <Camera className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 sm:size-10 text-muted-foreground hover:text-primary"
              onClick={() => setShowVoice(true)}
              aria-label="Voice Note"
            >
              <Mic className="size-4" />
            </Button>
          </div>
        )}

        {text.trim() && (
          <div className="flex items-center gap-1">
            <PrivacyOptionsPicker value={privacyOption} onChange={setPrivacyOption} />
            <Button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                refocusInput();
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                refocusInput();
              }}
              onClick={submit}
              disabled={busy || !text.trim()}
              className={cn("h-8 rounded-xl px-3 sm:h-10 sm:px-4 sm:gap-1.5")}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              <span className="hidden text-[11px] font-bold uppercase tracking-wider sm:inline-block">Send</span>
            </Button>
          </div>
        )}
      </div>

      {showVoice && (
        <div className="absolute inset-x-2 bottom-2 z-40 sm:inset-x-6 sm:bottom-6">
          <VoiceRecorder
            onCancel={() => setShowVoice(false)}
            onSend={(blob) => uploadAndSendMedia(blob, "audio", `voice-${Date.now()}.webm`)}
          />
        </div>
      )}

      {showCamera && (
        <CameraCapture
          onClose={() => setShowCamera(false)}
          onCapture={(blob, kind) => uploadAndSendMedia(blob, kind, kind === "video" ? `capture-${Date.now()}.webm` : `capture-${Date.now()}.jpg`)}
        />
      )}
    </div>
  );
}

function EmojiPickerWrapper({ text, setText }: { text: string; setText: (t: string | ((prev: string) => string)) => void }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const onEmoji = (d: any) => {
    setText((t) => t + d.emoji);
    if (!isMobile) setOpen(false);
  };

  const picker = (
    <EmojiPicker
      className="!border-none !shadow-none"
      width="100%"
      height={isMobile ? 350 : 400}
      theme={
        typeof document !== "undefined" &&
        document.documentElement.classList.contains("dark")
          ? EmojiTheme.DARK
          : EmojiTheme.LIGHT
      }
      onEmojiClick={onEmoji}
    />
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button type="button" size="icon" variant="ghost" className="size-8">
            <Smile className="size-4" />
          </Button>
        </DrawerTrigger>
        <DrawerContent className="p-0">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Emoji Picker</DrawerTitle>
          </DrawerHeader>
          <div className="p-1 pb-4">
            {picker}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" size="icon" variant="ghost" className="size-10">
          <Smile className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-auto border-none p-0 shadow-2xl">
        {picker}
      </PopoverContent>
    </Popover>
  );
}
