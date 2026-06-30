import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { signedAvatarUrl } from "@/lib/profiles.functions";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/** Renders a user avatar by signing the storage path on demand. */
export function Avatar({
  name,
  url,
  size = 40,
  className,
}: {
  name: string;
  url: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const sign = useServerFn(signedAvatarUrl);
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setSrc(null);
      return;
    }
    if (url.startsWith("http")) {
      setSrc(url);
      return;
    }
    sign({ data: { path: url } })
      .then((r) => {
        if (!cancelled) setSrc(r.url);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
    };
  }, [url, sign]);

  return (
    <div
      className={cn(
        "relative grid place-items-center overflow-hidden bg-muted text-xs font-semibold uppercase text-muted-foreground ring-1 ring-border transition-all duration-200 ease-out hover:shadow-[0_0_15px_rgba(139,92,246,0.4),0_0_5px_rgba(59,130,246,0.2)] hover:ring-primary/40",
        !className?.includes("rounded-") && "rounded-full",
        className,
      )}
      style={{ 
        width: className?.includes("w-") || className?.includes("size-") ? undefined : size, 
        height: className?.includes("h-") || className?.includes("size-") ? undefined : size,
        minWidth: className?.includes("w-") || className?.includes("size-") ? undefined : size,
        maxWidth: className?.includes("w-") || className?.includes("size-") ? undefined : size,
        minHeight: className?.includes("h-") || className?.includes("size-") ? undefined : size,
        maxHeight: className?.includes("h-") || className?.includes("size-") ? undefined : size,
      }}
    >
      {src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <span>{initials(name)}</span>
      )}
    </div>
  );
}
