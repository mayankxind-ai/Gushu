import { cn } from "@/lib/utils";

export function VerifiedBadge({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <span
      title="Verified"
      className={cn(
        "inline-flex items-center justify-center rounded-full brand-gradient text-white shadow-sm ring-1 ring-white/20",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" width={size * 0.7} height={size * 0.7}>
        <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
    </span>
  );
}
