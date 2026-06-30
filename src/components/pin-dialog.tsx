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
import { cn } from "@/lib/utils";
import { Loader as Loader2, Delete } from "lucide-react";

interface PinDialogProps {
  open: boolean;
  title: string;
  description?: string;
  onSubmit: (pin: string) => Promise<boolean | void>;
  onCancel?: () => void;
  errorMessage?: string;
}

export function PinDialog({ open, title, description, onSubmit, onCancel, errorMessage }: PinDialogProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const digits = ["1","2","3","4","5","6","7","8","9","","0","⌫"];

  const press = async (d: string) => {
    if (d === "⌫") {
      setPin((p) => p.slice(0, -1));
      setError(null);
      return;
    }
    if (!d) return;
    const next = pin + d;
    setPin(next);
    if (next.length === 6) {
      setLoading(true);
      try {
        const ok = await onSubmit(next);
        if (ok === false) {
          setError(errorMessage ?? "Incorrect PIN");
        }
      } catch {
        setError("Something went wrong");
      } finally {
        setLoading(false);
        setPin("");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="w-80 rounded-2xl bg-card"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center font-display text-xl">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-center text-xs">{description}</DialogDescription>
          )}
        </DialogHeader>

        {/* Dots */}
        <div className="my-2 flex justify-center gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "size-3 rounded-full border-2 transition-all duration-150",
                i < pin.length
                  ? "border-primary bg-primary scale-110"
                  : "border-muted-foreground/40",
              )}
            />
          ))}
        </div>

        {error && <p className="text-center text-xs text-destructive">{error}</p>}

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-2 px-2">
          {digits.map((d, i) => (
            <button
              key={i}
              onClick={() => press(d)}
              disabled={loading}
              className={cn(
                "flex h-14 items-center justify-center rounded-xl text-lg font-medium transition-all active:scale-95",
                d === ""
                  ? "pointer-events-none"
                  : d === "⌫"
                    ? "text-muted-foreground hover:bg-muted"
                    : "bg-muted hover:bg-muted/70 text-foreground",
              )}
            >
              {loading && d === "⌫" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : d === "⌫" ? (
                <Delete className="size-4" />
              ) : (
                d
              )}
            </button>
          ))}
        </div>

        {onCancel && (
          <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
