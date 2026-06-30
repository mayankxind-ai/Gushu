"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, KeyRound } from "lucide-react";

interface SecretCodeDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onSubmit: (code: string) => Promise<boolean | void>;
  onCancel?: () => void;
  errorMessage?: string;
}

export function SecretCodeDialog({
  open,
  title,
  description,
  onSubmit,
  onCancel,
  errorMessage,
}: SecretCodeDialogProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const ok = await onSubmit(code);
      if (ok === false) {
        setError(errorMessage ?? "Incorrect Secret Code");
      }
    } catch {
      setError("Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onCancel?.()}>
      <DialogContent className="w-80 rounded-3xl border-border bg-card/95 backdrop-blur-xl shadow-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader className="space-y-4">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="size-7" />
          </div>
          <div className="space-y-1.5 text-center">
            <DialogTitle className="font-display text-xl tracking-tight">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-muted-foreground text-xs leading-relaxed">
                {description}
              </DialogDescription>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Input
              autoFocus
              type="password"
              placeholder="Enter secret code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              className="h-12 border-border/50 bg-muted/30 text-center text-lg tracking-widest placeholder:text-muted-foreground/30 focus-visible:ring-primary/20 rounded-2xl"
              disabled={loading}
            />
            {error && (
              <p className="text-center text-[10px] font-medium text-destructive animate-in fade-in slide-in-from-top-1">
                {error}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Button
              type="submit"
              disabled={loading || !code.trim()}
              className="h-12 w-full rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              {loading ? <Loader2 className="mr-2 size-4 animate-spin" /> : "Unlock Conversation"}
            </Button>
            {onCancel && (
              <Button
                type="button"
                variant="ghost"
                onClick={onCancel}
                disabled={loading}
                className="h-10 w-full rounded-xl text-muted-foreground hover:bg-muted/50"
              >
                Cancel
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
