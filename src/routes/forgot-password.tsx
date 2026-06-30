import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/logo";
import { toast } from "sonner";
import { Loader as Loader2, ArrowLeft, CircleCheck as CheckCircle } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  ssr: false,
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: any) {
      // Don't reveal if email exists or not - show generic success
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
        <div className="pointer-events-none absolute inset-0 opacity-50 [background:radial-gradient(60rem_60rem_at_20%_-10%,oklch(0.7_0.23_295/0.18),transparent_50%),radial-gradient(50rem_50rem_at_120%_120%,oklch(0.72_0.2_245/0.16),transparent_50%)]" />
        <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col items-center justify-center px-6 py-16">
          <div className="w-full rounded-2xl bg-card p-8 ring-1 ring-border shadow-2xl text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-emerald-500/10">
              <CheckCircle className="size-6 text-emerald-500" />
            </div>
            <h1 className="font-display text-2xl tracking-tight">Password reset link sent</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              If an account exists with this email address, you will receive a password reset link
              shortly. Check your inbox and follow the instructions.
            </p>
            <Button
              variant="outline"
              className="mt-6 w-full"
              onClick={() => navigate({ to: "/auth" })}
            >
              <ArrowLeft className="mr-2 size-4" />
              Back to Login
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
          <h1 className="font-display text-4xl tracking-tight">Forgot Your Password?</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Enter your email address and we'll send you a password reset link.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 rounded-2xl bg-card p-6 ring-1 ring-border shadow-2xl">
          <div className="space-y-1.5">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Email Address
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Send Reset Link"}
          </Button>
          <Link
            to="/auth"
            className="block text-center text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            Back to Login
          </Link>
        </form>
      </div>
    </div>
  );
}
