import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader as Loader2 } from "lucide-react";
import { listMyConversations } from "@/lib/conversations.functions";
import { ConversationList } from "@/components/conversation-list";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/_authenticated/hidden-chats")({
  component: HiddenChatsPage,
});

function HiddenChatsPage() {
  const listFn = useServerFn(listMyConversations);
  const conversations = useQuery({
    queryKey: ["conversations"],
    queryFn: () => listFn({ data: undefined as any }),
    retry: 2,
    staleTime: 60000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <Link to="/settings" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to Settings
        </Link>
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-display text-lg">Hidden Chats</span>
        </div>
        <div />
      </header>
      <main className="mx-auto max-w-lg">
        {conversations.isLoading ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : (
          <ConversationList
            items={conversations.data ?? []}
            loading={false}
            showHidden
          />
        )}
      </main>
    </div>
  );
}
