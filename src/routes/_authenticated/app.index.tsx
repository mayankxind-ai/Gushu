import { createFileRoute } from "@tanstack/react-router";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/_authenticated/app/")({
  component: EmptyState,
});

function EmptyState() {
  return (
    <div className="grid h-full place-items-center p-10 text-center">
      <div className="max-w-sm">
        <div className="mx-auto mb-6 opacity-30">
          <Logo size={160} />
        </div>
        <h2 className="font-display text-3xl tracking-tight">Select a conversation</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a chat from the sidebar, or search a username to start a new private conversation.
        </p>
      </div>
    </div>
  );
}
