import { ReactNode, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface PremiumDropdownMenuProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  triggerRef: React.RefObject<HTMLElement | null>;
}

export function PremiumDropdownMenu({
  open,
  onClose,
  children,
  triggerRef,
}: PremiumDropdownMenuProps) {
  const isMobile = useIsMobile();
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position using useLayoutEffect to avoid flicker
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 220;
    const menuHeight = 280;
    const gap = 4;
    const padding = 8;

    // Desktop: position menu so its top-right aligns with button's top-right
    // (dropdown opens below and to the left of the button's right edge)
    let x = rect.right - menuWidth;
    let y = rect.bottom + gap;

    // Viewport bounds
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    if (x < padding) x = padding;
    if (x + menuWidth > vw - padding) x = vw - menuWidth - padding;
    if (y + menuHeight > vh - padding) {
      // Flip above
      y = rect.top - menuHeight - gap;
      if (y < padding) y = padding;
    }

    setPosition({ x, y });
  }, [open, triggerRef]);

  // Close on escape
  useLayoutEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  // Click outside to close
  useLayoutEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener("mousedown", handleMouseDown, true);
    return () => document.removeEventListener("mousedown", handleMouseDown, true);
  }, [open, onClose, triggerRef]);

  // Prevent body scroll on mobile
  useLayoutEffect(() => {
    if (!open || !isMobile) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, [open, isMobile]);

  if (!open || !mounted) return null;

  const content = isMobile ? (
    <MobileMenu onClose={onClose} menuRef={menuRef}>
      {children}
    </MobileMenu>
  ) : (
    <DesktopMenu
      onClose={onClose}
      menuRef={menuRef}
      position={position}
    >
      {children}
    </DesktopMenu>
  );

  return createPortal(content, document.body);
}

function MobileMenu({
  onClose,
  menuRef,
  children,
}: {
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9999]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ animation: "fadeIn 0.2s ease" }}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        className="absolute bottom-0 left-0 right-0 z-[10000] rounded-t-3xl border-t border-white/10 bg-[#1c1c1f]/80 p-3 shadow-2xl backdrop-blur-2xl"
        style={{ 
          animation: "slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          boxShadow: "0 -20px 40px -10px rgba(0,0,0,0.5)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/10" />
        <div className="max-h-[75vh] overflow-y-auto pb-8">
          {children}
        </div>
      </div>
    </div>
  );
}

function DesktopMenu({
  onClose,
  menuRef,
  position,
  children,
}: {
  onClose: () => void;
  menuRef: React.RefObject<HTMLDivElement | null>;
  position: { x: number; y: number };
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "none" }}>
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ pointerEvents: "auto" }}
        onClick={onClose}
      />
      {/* Menu */}
      <div
        ref={menuRef}
        className="glass-surface absolute z-[10000] min-w-[240px] rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
        style={{
          left: position.x,
          top: position.y,
          pointerEvents: "auto",
          animation: "zoomIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          transformOrigin: "top right"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative z-10">
          {children}
        </div>
        {/* Subtle inner glow */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
      </div>
    </div>
  );
}

export function PremiumMenuItem({
  icon,
  label,
  description,
  onClick,
  variant = "default",
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  description?: string;
  onClick: () => void;
  variant?: "default" | "destructive" | "accent";
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200",
        disabled && "opacity-40 cursor-not-allowed",
        variant === "destructive"
          ? "text-red-400 hover:bg-red-400/10 hover:text-red-300"
          : variant === "accent"
            ? "text-amber-400 hover:bg-amber-400/10 hover:text-amber-300"
            : "text-zinc-300 hover:bg-white/10 hover:text-white",
      )}
    >
      <div className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/5 transition-colors group-hover:bg-white/10 [&>svg]:size-4",
        variant === "destructive" ? "text-red-400/70 group-hover:text-red-400" : 
        variant === "accent" ? "text-amber-400/70 group-hover:text-amber-400" : 
        "text-zinc-500 group-hover:text-zinc-200"
      )}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold tracking-tight">{label}</div>
        {description && (
          <div className="text-[11px] text-zinc-500 line-clamp-1">{description}</div>
        )}
      </div>
    </button>
  );
}

export function PremiumMenuSeparator() {
  return <div className="my-1.5 h-px bg-white/[0.06]" />;
}
