import { useEffect, useRef, useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Search, Loader as Loader2, Lock, Eye, KeyRound } from "lucide-react";
import { searchUsers } from "@/lib/profiles.functions";
import { getOrCreateConversation, checkConversationAccess } from "@/lib/conversations.functions";
import { findHiddenChatByCode, verifyConversationSecretCode } from "@/lib/conversation-settings.functions";
import { Avatar } from "@/components/avatar";
import { ProfileView } from "@/components/profile-view";
import { VerifiedBadge } from "@/components/verified-badge";
import { Input } from "@/components/ui/input";
import { useHiddenStore } from "@/lib/hidden-store";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type R = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  verified: boolean;
};

export function UserSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<R[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [codeMatch, setCodeMatch] = useState<{ conversationId: string } | null>(null);
  const [secretCodePrompt, setSecretCodePrompt] = useState<{ user: R; conversationId: string } | null>(null);
  const [secretCodeInput, setSecretCodeInput] = useState("");
  const [verifying, setVerifying] = useState(false);
  const search = useServerFn(searchUsers);
  const create = useServerFn(getOrCreateConversation);
  const checkAccess = useServerFn(checkConversationAccess);
  const findHidden = useServerFn(findHiddenChatByCode);
  const verifySecret = useServerFn(verifyConversationSecretCode);
  const navigate = useNavigate();
  const unlockHidden = useHiddenStore((s: any) => s.unlock);
  const ref = useRef<HTMLDivElement>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfile, setFullProfile] = useState<any>(null);

  const openProfile = useCallback(async (user: R) => {
    setProfileOpen(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, verified")
        .eq("id", user.id)
        .maybeSingle();
      if (data) setFullProfile(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      setCodeMatch(null);
      return;
    }
    const t = setTimeout(async () => {
      setLoading(true);
      setCodeMatch(null);
      try {
        const r = await search({ data: { q: q.trim() } });
        setResults(r);
        // Always check for hidden chat if looks like a code (4+ chars)
        if (q.trim().length >= 4) {
          const hidden = await findHidden({ data: { code: q.trim() } });
          if (hidden?.found && hidden.conversationId) {
            setCodeMatch({ conversationId: hidden.conversationId });
          }
        }
      } catch (e: any) {
        // ignore
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q, search, findHidden]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function start(user: R) {
    try {
      const { id } = await create({ data: { otherUserId: user.id } });

      // Check if this conversation requires a secret code
      const access = await checkAccess({ data: { conversationId: id } });

      if (access.requiresSecretCode) {
        // Block access - require secret code
        setSecretCodePrompt({ user, conversationId: id });
        setOpen(false);
        return;
      }

      setQ("");
      setOpen(false);
      navigate({ to: "/app/c/$conversationId", params: { conversationId: id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start chat");
    }
  }

  function openHiddenChat(conversationId: string) {
    setQ("");
    setOpen(false);
    setCodeMatch(null);
    unlockHidden(conversationId);
    navigate({ to: "/app/c/$conversationId", params: { conversationId } });
    toast.success("Hidden chat unlocked");
  }

  async function handleSecretCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!secretCodePrompt || !secretCodeInput.trim()) return;
    setVerifying(true);
    try {
      const { valid } = await verifySecret({
        data: { conversationId: secretCodePrompt.conversationId, code: secretCodeInput.trim() },
      });
      if (valid) {
        setSecretCodePrompt(null);
        setSecretCodeInput("");
        unlockHidden(secretCodePrompt.conversationId);
        navigate({ to: "/app/c/$conversationId", params: { conversationId: secretCodePrompt.conversationId } });
        toast.success("Hidden chat unlocked");
      } else {
        toast.error("Incorrect secret code");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      <div ref={ref} className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search here........😁!"
          className="h-9 rounded-full bg-muted/40 pl-9 text-xs ring-1 ring-border focus-visible:ring-foreground/30"
        />
        {open && q.trim() && (
          <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-72 overflow-y-auto rounded-xl bg-popover p-1.5 ring-1 ring-border shadow-2xl">
            {loading && (
              <div className="flex items-center justify-center p-3 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
              </div>
            )}
            {!loading && results.length === 0 && !codeMatch && (
              <div className="p-3 text-center text-xs text-muted-foreground">No users found</div>
            )}
            {codeMatch && (
              <button
                onClick={() => openHiddenChat(codeMatch.conversationId)}
                className="flex w-full items-center gap-3 rounded-lg bg-amber-500/10 p-2.5 text-left transition-colors hover:bg-amber-500/20 ring-1 ring-amber-500/30"
              >
                <div className="flex size-8 items-center justify-center rounded-full bg-amber-500/20">
                  <Lock className="size-4 text-amber-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Eye className="size-3 text-amber-500" />
                    <span className="truncate text-sm font-medium text-amber-600 dark:text-amber-400">
                      Unlock Hidden Chat
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    Secret code matched
                  </div>
                </div>
              </button>
            )}
            {results.map((u) => (
              <div
                key={u.id}
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted group"
              >
                <div 
                  className="cursor-pointer transition-transform duration-300 hover:scale-110 active:scale-95"
                  onClick={() => openProfile(u)}
                >
                  <Avatar name={u.display_name ?? u.username} url={u.avatar_url} size={32} />
                </div>
                <div 
                  className="min-w-0 flex-1 cursor-pointer"
                  onClick={() => start(u)}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">
                      {u.display_name ?? u.username}
                    </span>
                    {u.verified && <VerifiedBadge size={12} />}
                  </div>
                  <div className="truncate text-[11px] text-muted-foreground group-hover:text-primary transition-colors">@{u.username}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {fullProfile && (
        <ProfileView
          user={fullProfile}
          open={profileOpen}
          onOpenChange={setProfileOpen}
        />
      )}

      {/* Secret Code Prompt Modal */}
      {secretCodePrompt && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <KeyRound className="size-5 text-amber-400" />
              <h3 className="font-display text-lg text-foreground">Secret Code Required</h3>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">
              This chat is protected with a secret code. Enter it to access the conversation.
            </p>
            <form onSubmit={handleSecretCodeSubmit} className="space-y-3">
              <Input
                type="text"
                value={secretCodeInput}
                onChange={(e) => setSecretCodeInput(e.target.value)}
                placeholder="Enter secret code"
                className="h-10 bg-muted/40 border-border text-foreground"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => { setSecretCodePrompt(null); setSecretCodeInput(""); }}
                  className="flex-1 rounded-xl bg-muted py-2.5 text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={verifying || !secretCodeInput.trim()}
                  className="flex-1 rounded-xl bg-foreground py-2.5 text-sm font-medium text-background hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {verifying ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Unlock"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
