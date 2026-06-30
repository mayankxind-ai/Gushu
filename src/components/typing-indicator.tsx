import { cn } from "@/lib/utils";

/**
 * Shows an animated typing indicator (three dots)
 */
export function TypingIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-1", className)}>
      
      <div className="flex gap-0.5">
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "100ms" }} />
        <span className="inline-block size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "200ms" }} />
      </div>
    </div>
  );
}

/**
 * Shows a chat bubble indicator when user is typing (appears above message input)
 */
export function TypingBubble() {
  return (
    <div className="flex items-end gap-2 px-4 py-2">
      <div className="flex h-8 w-12 items-center justify-center rounded-full bg-muted">
        <div className="flex gap-1">
          <span className="inline-block size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="inline-block size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "100ms" }} />
          <span className="inline-block size-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: "200ms" }} />
        </div>
      </div>
    </div>
  );
}
