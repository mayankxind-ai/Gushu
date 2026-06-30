import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { X, MessageCircle, Calendar } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { VerifiedBadge } from "@/components/verified-badge";
import { formatRelative, isOnline } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getOrCreateConversation } from "@/lib/conversations.functions";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  verified: boolean;
  last_seen_at: string | null;
  created_at: string | null;
}

interface ProfileViewProps {
  user: Profile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meId?: string;
}

export function ProfileView({ user, open, onOpenChange, meId }: ProfileViewProps) {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);
  const navigate = useNavigate();
  const create = useServerFn(getOrCreateConversation);

  useEffect(() => {
    if (open) {
      setClosing(false);
      const id = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id);
    }
  }, [open]);

  if (!open || !user) return null;

  const handleClose = () => {
    setClosing(true);
    setVisible(false);
    setTimeout(() => onOpenChange(false), 300);
  };

  const isUserOnline = isOnline(user.last_seen_at);
  const isMe = meId === user.id;

  const handleStartChat = async () => {
    if (isMe) return;
    try {
      const { id } = await create({ data: { otherUserId: user.id } });
      onOpenChange(false);
      navigate({ to: "/app/c/$conversationId", params: { conversationId: id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start chat");
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Backdrop with blur */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-xl transition-opacity duration-300",
          visible && !closing ? "opacity-100" : "opacity-0",
        )}
        onClick={handleClose}
      />

      {/* Centered card */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div
          className={cn(
            "relative w-full max-w-[420px] overflow-hidden rounded-3xl border border-border/50 bg-card shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            visible && !closing
              ? "scale-100 opacity-100 translate-y-0"
              : "scale-95 opacity-0 translate-y-4",
          )}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute right-4 top-4 z-10 grid size-8 place-items-center rounded-full bg-black/20 text-white/80 backdrop-blur-sm transition-all hover:bg-black/30 hover:text-white"
          >
            <X className="size-4" />
          </button>

          {/* Header gradient */}
          <div className="relative h-32 bg-gradient-to-br from-[var(--brand-violet)]/20 to-[var(--brand-blue)]/20">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 50% 50%, rgba(139,92,246,0.15), transparent 70%)" }} />
          </div>

          {/* Avatar overlapping header */}
          <div className="relative -mt-14 flex justify-center">
            <div className="relative">
              <Avatar
                name={user.display_name ?? user.username}
                url={user.avatar_url}
                size={120}
                className="size-[120px] rounded-full ring-4 ring-card shadow-[0_0_30px_rgba(139,92,246,0.3)]"
              />
              {isUserOnline && (
                <span className="absolute bottom-2 right-2 size-4 rounded-full bg-emerald-400 ring-[3px] ring-card" />
              )}
            </div>
          </div>

          {/* Content */}
          <div className="px-6 pb-6 pt-4 text-center">
            {/* Display name */}
            <div className="flex items-center justify-center gap-2">
              <h2 className="font-display text-2xl tracking-tight text-foreground">
                {user.display_name ?? user.username}
              </h2>
              {user.verified && <VerifiedBadge size={18} />}
            </div>

            {/* Username */}
            <p className="mt-1 text-sm text-muted-foreground">@{user.username}</p>

            {/* Online status */}
            <div className="mt-3 flex items-center justify-center gap-2">
              <span
                className={cn(
                  "size-2 rounded-full",
                  isUserOnline ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" : "bg-muted-foreground/50",
                )}
              />
              <span className="text-xs text-muted-foreground">
                {isUserOnline
                  ? "Online"
                  : user.last_seen_at
                    ? `Last seen ${formatRelative(user.last_seen_at)} ago`
                    : "Offline"}
              </span>
            </div>

            {/* Bio */}
            {user.bio && (
              <div className="mt-4 rounded-2xl bg-muted/50 px-4 py-3 text-sm leading-relaxed text-foreground/80">
                {user.bio}
              </div>
            )}

            {/* Meta info */}
            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              {user.created_at && (
                <div className="flex items-center gap-1">
                  <Calendar className="size-3" />
                  <span>Member since {new Date(user.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
                </div>
              )}
            </div>

            {/* Start Chat button */}
            {!isMe && (
              <button
                onClick={handleStartChat}
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-foreground px-6 py-2.5 text-sm font-medium text-background transition-all hover:opacity-90 active:scale-95"
              >
                <MessageCircle className="size-4" />
                Start Chat
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
