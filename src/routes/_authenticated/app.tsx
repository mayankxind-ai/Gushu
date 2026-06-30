import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LogOut, Settings as SettingsIcon, Shield, CircleAlert as AlertCircle, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo, Wordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar } from "@/components/avatar";
import { UserSearch } from "@/components/user-search";
import { ConversationList } from "@/components/conversation-list";
import { ProfileView } from "@/components/profile-view";
import { Button } from "@/components/ui/button";
import { listMyConversations } from "@/lib/conversations.functions";
import { heartbeat } from "@/lib/profiles.functions";
import { getIncognito } from "@/lib/privacy.functions";
import { amIAdmin } from "@/lib/admin.functions";
import { initializeGlobalNotifications, unregisterPushNotifications } from "@/lib/notification-service";
import { useHiddenStore } from "@/lib/hidden-store";
import { toast } from "sonner";
import { cn, debounceInvalidation } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  component: AppShell,
});

function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMyConversations);
  const beat = useServerFn(heartbeat);
  const isAdminFn = useServerFn(amIAdmin);
  const getIncognitoFn = useServerFn(getIncognito);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const notifCleanupRef = useRef<(() => void) | null>(null);
  const beatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [fullProfile, setFullProfile] = useState<any>(null);

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return null;
      const { data: prof } = await supabase
        .from("profiles")
        .select("username, avatar_url")
        .eq("id", u.id)
        .maybeSingle();
      return {
        id: u.id,
        email: u.email ?? null,
        username: prof?.username ?? u.email?.split("@")[0] ?? "you",
        avatar_url: prof?.avatar_url ?? null,
      };
    },
  });

  const openProfile = useCallback(async () => {
    if (!meQuery.data) return;
    setProfileOpen(true);
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, bio, verified, last_seen_at, created_at")
        .eq("id", meQuery.data.id)
        .maybeSingle();
      if (data) setFullProfile(data);
    } catch {}
  }, [meQuery.data]);

  const incognitoQuery = useQuery({
    queryKey: ["incognito"],
    queryFn: () => getIncognitoFn({ data: undefined as any }),
  });

  const me = meQuery.data;
  const params = useParams({ strict: false }) as { conversationId?: string };
  const hasActiveConversation = !!params.conversationId;

  // Initialize global notifications once per user
  useEffect(() => {
    if (!me?.id) return;
    notifCleanupRef.current = initializeGlobalNotifications(me.id, () => {
      debounceInvalidation(queryClient, [["conversations"]]);
    });
    return () => {
      if (notifCleanupRef.current) {
        notifCleanupRef.current();
        notifCleanupRef.current = null;
      }
    };
  }, [me?.id]);

  // Presence heartbeat - don't run if incognito
  useEffect(() => {
    if (incognitoQuery.data?.incognito) {
      if (beatTimerRef.current) clearInterval(beatTimerRef.current);
      return;
    }
    beat({ data: undefined as any }).catch(() => {});
    beatTimerRef.current = setInterval(() => beat({ data: undefined as any }).catch(() => {}), 1000);
    return () => {
      if (beatTimerRef.current) clearInterval(beatTimerRef.current);
    };
  }, [beat, incognitoQuery.data?.incognito]);

  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listFn({ data: undefined as any }),
    enabled: meQuery.isSuccess && !!me,
    retry: 2,
    staleTime: 60000,
    gcTime: 300000,
    refetchOnWindowFocus: false,
  });

  const isAdminQ = useQuery({
    queryKey: ["amIAdmin"],
    queryFn: () => isAdminFn({ data: undefined as any }),
    enabled: !!me,
  });

  // Single realtime channel for app-level updates
  useEffect(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const ch = supabase
      .channel("app-feed")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const message = payload.new as any;
        if (!message) return;
        queryClient.setQueryData(["conversations"], (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((conv: any) => {
            if (conv.id !== message.conversation_id) return conv;
            return {
              ...conv,
              last: {
                content: message.content,
                message_type: message.message_type,
                created_at: message.created_at,
                sender_id: message.sender_id,
              },
              last_message_at: message.created_at,
            };
          });
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (payload) => {
        const convUpdate = payload.new as any;
        queryClient.setQueryData(["conversations"], (old: any) => {
          if (!Array.isArray(old)) return old;
          return old.map((conv: any) => (conv.id === convUpdate.id ? { ...conv, ...convUpdate } : conv));
        });
      })
      .subscribe();

    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [queryClient]);

  useEffect(() => {
    const totalUnread = (conversations.data ?? [])
      .filter((c: any) => !c.hidden)
      .reduce((n: number, c: any) => n + c.unread, 0);
    document.title = totalUnread > 0 ? `(${totalUnread}) Gushu` : "Gushu";
  }, [conversations.data]);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    
    // Cleanup push notifications before signing out
    await unregisterPushNotifications();
    
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background text-foreground">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-border bg-card transition-all duration-300 ease-in-out",
          "fixed inset-y-0 left-0 z-20 w-full md:relative md:w-80",
          hasActiveConversation ? "-translate-x-full md:translate-x-0" : "translate-x-0",
        )}
      >
        <div className="border-b border-border p-5">
          <div className="mb-5 flex items-center justify-between">
            <Link to="/app" className="flex items-center gap-2">
              <Logo size={28} />
              <Wordmark className="text-xl text-foreground" />
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => window.location.reload()} 
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
                aria-label="Refresh page"
              >
                <RefreshCw className="size-4" />
              </Button>
              <Link to="/settings">
                <Button variant="ghost" size="icon" aria-label="Settings" className="text-muted-foreground hover:text-foreground hover:bg-muted">
                  <SettingsIcon className="size-4" />
                </Button>
              </Link>
              {isAdminQ.data?.admin && (
                <Link to="/admin">
                  <Button variant="ghost" size="icon" aria-label="Admin" className="text-amber-400 hover:bg-amber-400/10">
                    <Shield className="size-4" />
                  </Button>
                </Link>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                aria-label="Sign out" 
                onClick={signOut} 
                className="text-red-400 hover:text-red-500 hover:bg-red-500/10 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:scale-110 active:scale-90"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
          <UserSearch />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
          {conversations.isError && (
            <div className="flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-red-400">
              <AlertCircle className="size-5" />
              <p>
                Failed to load conversations{conversations.error?.message ? `: ${conversations.error.message}` : ""}
              </p>
              <button
                onClick={() => conversations.refetch()}
                className="text-xs underline underline-offset-2 hover:no-underline"
              >
                Try again
              </button>
            </div>
          )}
          {!conversations.isError && (
            <ConversationList
              items={conversations.data ?? []}
              loading={conversations.isLoading}
              showHidden={false}
            />
          )}
        </nav>

        <div className="border-t border-border bg-card/80 p-4">
          <div 
            className="flex items-center gap-3 cursor-pointer group"
            onClick={openProfile}
          >
            <div className="relative">
              <Avatar 
                name={me?.username ?? "you"} 
                url={me?.avatar_url} 
                size={34} 
                className="transition-all duration-300 group-hover:ring-2 group-hover:ring-primary/20"
              />
              {incognitoQuery.data?.incognito && (
                <span className="absolute -top-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-background">
                  <span className="text-[9px]">🥷</span>
                </span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">@{me?.username ?? "you"}</div>
              <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
                {incognitoQuery.data?.incognito ? "Incognito" : "Online"}
              </div>
            </div>
          </div>
        </div>
      </aside>

      <main
        className={cn(
          "relative flex min-h-0 flex-col bg-background transition-all duration-300 ease-in-out",
          "fixed inset-0 z-10 w-full md:relative md:flex-1",
          hasActiveConversation ? "translate-x-0" : "translate-x-full md:translate-x-0",
        )}
      >
        <Outlet />
      </main>

      {fullProfile && (
        <ProfileView
          user={fullProfile}
          open={profileOpen}
          onOpenChange={setProfileOpen}
          meId={me?.id}
        />
      )}
    </div>
  );
}
