import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { toast } from "sonner";
import { Loader as Loader2, CircleCheck as CheckCircle, Circle as XCircle, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const navigate = useNavigate();

  // Check if we have a valid recovery session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setValidSession(true);
      } else {
        // Listen for auth state changes ( recovery flow sets session via hash fragment )
        const { data: listener } = supabase.auth.onAuthStateChange((event) => {
          if (event === "PASSWORD_RECOVERY") {
            setValidSession(true);
          }
        });
        // Give it a moment to process the hash
        const timeout = setTimeout(() => {
          if (validSession === null) {
            setValidSession(false);
          }
        }, 2000);
        return () => {
          listener.subscription.unsubscribe();
          clearTimeout(timeout);
        };
      }
    });
  }, []);

  // Password requirements
  const hasMinLength = pwd.length >= 8;
  const hasUppercase = /[A-Z]/.test(pwd);
  const hasLowercase = /[a-z]/.test(pwd);
  const hasNumber = /[0-9]/.test(pwd);
  const passwordsMatch = pwd === confirm && pwd.length > 0;
  const allValid = hasMinLength && hasUppercase && hasLowercase && hasNumber && passwordsMatch;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!allValid) {
      toast.error("Please meet all password requirements");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(60rem_60rem_at_20%_-10%,oklch(0.7_0.23_295/0.18),transparent_50%),radial-gradient(50rem_50rem_at_120%_120%,oklch(0.72_0.2_245/0.16),transparent_50%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col items-center justify-center px-6 py-16">
          <div className="w-full rounded-2xl bg-card p-8 ring-1 ring-border shadow-2xl text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-emerald-500/10">
              <CheckCircle className="size-6 text-emerald-500" />
            </div>
            <h1 className="font-display text-2xl tracking-tight">Password updated successfully</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Your password has been changed. You can now sign in with your new password.
            </p>
            <Button
              className="mt-6 w-full"
              onClick={() => navigate({ to: "/auth" })}
            >
              Go to Login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (validSession === false) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(60rem_60rem_at_20%_-10%,oklch(0.7_0.23_295/0.18),transparent_50%),radial-gradient(50rem_50rem_at_120%_120%,oklch(0.72_0.2_245/0.16),transparent_50%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col items-center justify-center px-6 py-16">
          <div className="w-full rounded-2xl bg-card p-8 ring-1 ring-border shadow-2xl text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-destructive/10">
              <XCircle className="size-6 text-destructive" />
            </div>
            <h1 className="font-display text-2xl tracking-tight">Invalid or expired link</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => navigate({ to: "/forgot-password" })}
            >
              Request new reset link
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(60rem_60rem_at_20%_-10%,oklch(0.7_0.23_295/0.18),transparent_50%),radial-gradient(50rem_50rem_at_120%_120%,oklch(0.72_0.2_245/0.16),transparent_50%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col px-6 py-16">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-5 grid size-16 place-items-center rounded-2xl ring-1 ring-border bg-card shadow-xl">
            <Logo size={40} />
          </div>
          <h1 className="font-display text-4xl tracking-tight">Create New Password</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter a new password for your account.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 rounded-2xl bg-card p-6 ring-1 ring-border shadow-2xl">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              New Password
            </Label>
            <Input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Confirm Password
            </Label>
            <Input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-2">
            <p className="font-medium text-muted-foreground">Password requirements:</p>
            <Requirement met={hasMinLength}>At least 8 characters</Requirement>
            <Requirement met={hasUppercase}>Contains an uppercase letter</Requirement>
            <Requirement met={hasLowercase}>Contains a lowercase letter</Requirement>
            <Requirement met={hasNumber}>Contains a number</Requirement>
            <Requirement met={passwordsMatch}>Passwords match</Requirement>
          </div>

          <Button type="submit" disabled={loading || !allValid} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Update Password"}
          </Button>

          <Link
            to="/auth"
            className="block text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            <ArrowLeft className="mr-1 inline size-3" />
            Back to Login
          </Link>
        </form>
      </div>
    </div>
  );
}

function Requirement({ met, children }: { met: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center gap-2", met ? "text-emerald-600" : "text-muted-foreground")}>
      {met ? (
        <CheckCircle className="size-3.5 shrink-0" />
      ) : (
        <div className="size-3.5 shrink-0 rounded-full border border-current" />
      )}
      <span>{children}</span>
    </div>
  );
}
