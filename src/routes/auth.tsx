import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Logo, Wordmark } from "@/components/logo";
import { toast } from "sonner";
import { Loader as Loader2, ShieldCheck, Eye, EyeOff } from "lucide-react";
import {
  resolveUsernameToEmail,
  checkUsernameAvailable,
} from "@/lib/auth.functions";
import { promoteFirstAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-60 [background:radial-gradient(100rem_100rem_at_0%_-10%,oklch(0.7_0.23_295/0.25),transparent_60%),radial-gradient(80rem_80rem_at_100%_100%,oklch(0.72_0.2_245/0.2),transparent_60%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-[440px] flex-col px-6 py-16">
        <div className="mb-12 text-center animate-in-fade">
          <div className="mx-auto mb-6 grid size-20 place-items-center rounded-full ring-1 ring-border/50 bg-card/40 shadow-[0_20px_50px_rgba(0,0,0,0.2)] backdrop-blur-2xl transition-transform hover:scale-105 duration-500 overflow-hidden">
            <Logo size={48} />
          </div>
          <h1 className="font-display text-6xl tracking-tighter brand-gradient-text drop-shadow-sm">
            <Wordmark />
          </h1>
          <p className="mt-3 text-sm font-medium tracking-wide text-muted-foreground/80 uppercase">
            Private conversations. Zero clutter.
          </p>
        </div>

        <div className="rounded-3xl bg-card/30 ring-1 ring-white/10 p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)] backdrop-blur-3xl animate-in-fade stagger-1">
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted/50">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="p-4 pt-5">
              <SignInForm />
            </TabsContent>
            <TabsContent value="signup" className="p-4 pt-5">
              <SignUpForm />
            </TabsContent>
          </Tabs>
        </div>


        <p className="mt-8 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          <ShieldCheck className="mr-1 inline size-3 text-foreground/60" />
          End-to-conversation privacy — chats vanish when both leave
        </p>
      </div>
    </div>
  );
}

function SignInForm() {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const navigate = useNavigate();
  const resolve = useServerFn(resolveUsernameToEmail);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      let email = id.trim();
      if (!email.includes("@")) {
        setResolving(true);
        const r = await resolve({ data: { username: email } });
        setResolving(false);
        email = r.email;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back");
      navigate({ to: "/app", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Sign-in failed");
    } finally {
      setLoading(false);
      setResolving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Identity">
        <Input
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="email or username"
          autoComplete="username"
          required
        />
      </Field>
      <Field label="Credential">
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="pr-10"
            required
            minLength={6}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <div className="text-right">
        <Link
          to="/forgot-password"
          className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
        >
          Forgot Password?
        </Link>
      </div>
      <Button type="submit" disabled={loading || resolving} className="w-full">
        {loading || resolving ? <Loader2 className="size-4 animate-spin" /> : "Enter Vault"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const check = useServerFn(checkUsernameAvailable);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const u = username.trim().toLowerCase();
      const { available } = await check({ data: { username: u } });
      if (!available) throw new Error("Username already taken");
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
          data: { username: u, display_name: u },
        },
      });
      if (error) throw error;
      toast.success("Account created");
      navigate({ to: "/app", replace: true });
    } catch (err: any) {
      toast.error(err?.message ?? "Sign-up failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Username">
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="lowercase, 3–20 chars"
          pattern="[a-z0-9_]{3,20}"
          required
        />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
        />
      </Field>
      <Field label="Password">
        <div className="relative">
          <Input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="at least 8 characters"
            autoComplete="new-password"
            className="pr-10"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Field label="Confirm password">
        <div className="relative">
          <Input
            type={showConfirm ? "text" : "password"}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="repeat password"
            autoComplete="new-password"
            className="pr-10"
            required
            minLength={8}
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? <Loader2 className="size-4 animate-spin" /> : "Create account"}
      </Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
