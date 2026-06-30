import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Logo } from "@/components/logo";
import { VerifiedBadge } from "@/components/verified-badge";
import { adminListUsers, adminSetVerified, amIAdmin } from "@/lib/admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const listFn = useServerFn(adminListUsers);
  const setFn = useServerFn(adminSetVerified);
  const checkFn = useServerFn(amIAdmin);
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ["amIAdmin"],
    queryFn: () => checkFn({ data: undefined as any }),
  });
  const users = useQuery({
    queryKey: ["adminUsers"],
    queryFn: () => listFn({ data: undefined as any }),
    enabled: !!me.data?.admin,
  });

  if (me.isLoading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  if (!me.data?.admin) {
    return (
      <div className="grid min-h-screen place-items-center px-6 text-center">
        <div>
          <h1 className="font-display text-3xl">Admins only</h1>
          <p className="mt-2 text-sm text-muted-foreground">You don't have access to this page.</p>
          <Link to="/app" className="mt-4 inline-block text-sm underline">
            Back to chats
          </Link>
        </div>
      </div>
    );
  }

  async function toggle(userId: string, value: boolean) {
    try {
      await setFn({ data: { userId, verified: value } });
      queryClient.invalidateQueries({ queryKey: ["adminUsers"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success(value ? "Verified" : "Unverified");
    } catch (e: any) {
      toast.error(e?.message ?? "Update failed");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6 sm:py-4">
        <Link
          to="/app"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to chats
        </Link>
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <span className="font-display text-lg">Admin</span>
        </div>
        <div />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        <h1 className="font-display text-3xl tracking-tight">Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Grant the verified badge to trusted accounts.
        </p>

        <div className="mt-6 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {users.isLoading && (
            <div className="grid h-40 place-items-center">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
          {users.data?.map((u) => (
            <div
              key={u.id}
              className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0 sm:px-5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-medium">
                    {u.display_name ?? u.username}
                  </span>
                  {u.verified && <VerifiedBadge size={12} />}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  @{u.username} · joined {new Date(u.created_at).toLocaleDateString()}
                </div>
              </div>
              <Switch
                checked={u.verified}
                onCheckedChange={(v) => toggle(u.id, v)}
                className="shrink-0"
              />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
