import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Eye, EyeOff, Timer, Hash, X, Check } from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";

export type PrivacyOption = {
  viewOnce: boolean;
  disappearAfterView: boolean;
  viewLimit: number | null; // null = no limit, or 1/2/3/5/custom
};

const VIEW_LIMIT_OPTIONS = [
  { label: "No limit", value: null, icon: Eye },
  { label: "1 View", value: 1, icon: Hash },
  { label: "2 Views", value: 2, icon: Hash },
  { label: "3 Views", value: 3, icon: Hash },
  { label: "5 Views", value: 5, icon: Hash },
];

interface PrivacyOptionsPickerProps {
  value: PrivacyOption;
  onChange: (option: PrivacyOption) => void;
}

export function PrivacyOptionsPicker({ value, onChange }: PrivacyOptionsPickerProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const hasOptions = value.viewOnce || value.disappearAfterView || value.viewLimit !== null;
  const label = hasOptions ? getLabel(value) : "Privacy";

  const content = (
    <div className="space-y-3 p-3">
      {/* View Once */}
      <button
        onClick={() => onChange({ ...value, viewOnce: !value.viewOnce })}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
          value.viewOnce
            ? "bg-amber-500/10 text-amber-400"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <div className="flex items-center gap-2">
          <EyeOff className="size-4" />
          <span className="font-medium">View Once</span>
        </div>
        {value.viewOnce && <Check className="size-4" />}
      </button>

      {/* Disappear After View */}
      <button
        onClick={() => onChange({
          ...value,
          disappearAfterView: !value.disappearAfterView,
          viewOnce: false
        })}
        className={cn(
          "flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs transition-colors",
          value.disappearAfterView
            ? "bg-orange-500/10 text-orange-400"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <div className="flex items-center gap-2">
          <Timer className="size-4" />
          <div className="text-left">
            <div className="font-medium">After Viewing</div>
            <div className="text-[10px] opacity-70">Deletes when opened</div>
          </div>
        </div>
        {value.disappearAfterView && <Check className="size-4" />}
      </button>

      {/* View Limit */}
      <div className="space-y-1.5 pt-2">
        <div className="flex items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Hash className="size-3" />
          View Limit
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {VIEW_LIMIT_OPTIONS.map((opt) => (
            <button
              key={String(opt.value ?? "unlimited")}
              onClick={() => onChange({
                ...value,
                viewLimit: opt.value,
                viewOnce: false,
                disappearAfterView: false,
              })}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs transition-colors",
                value.viewLimit === opt.value
                  ? "bg-violet-500/10 text-violet-400 ring-1 ring-violet-500/20"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <opt.icon className="size-3" />
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Clear button */}
      {hasOptions && (
        <button
          onClick={() => onChange({ viewOnce: false, disappearAfterView: false, viewLimit: null })}
          className="mt-2 w-full rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
        >
          Clear all privacy settings
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className={cn(
              "gap-1 h-8 px-2",
              hasOptions ? "text-amber-400" : "text-muted-foreground",
            )}
          >
            {hasOptions ? (
              <>
                <EyeOff className="size-3.5" />
                <span className="text-[10px] font-semibold uppercase">{label}</span>
              </>
            ) : (
              <Eye className="size-4" />
            )}
          </Button>
        </DrawerTrigger>
        <DrawerContent className="px-2 pb-4">
          <DrawerHeader className="sr-only">
            <DrawerTitle>Message Privacy Options</DrawerTitle>
          </DrawerHeader>
          <h3 className="px-3 pt-2 text-sm font-semibold text-foreground">Message Privacy</h3>
          {content}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "gap-1 h-8 px-2",
            hasOptions ? "text-amber-400" : "text-muted-foreground",
          )}
        >
          {hasOptions ? (
            <>
              <EyeOff className="size-3.5" />
              <span className="text-[10px] font-semibold uppercase">{label}</span>
            </>
          ) : (
            <Eye className="size-4" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="end"
        className="w-64 rounded-xl border border-border bg-popover/95 p-0 shadow-2xl backdrop-blur-xl"
      >
        <div className="border-b border-border p-3">
          <h3 className="text-sm font-semibold text-foreground">Message Privacy</h3>
        </div>
        {content}
      </PopoverContent>
    </Popover>
  );
}

function getLabel(opt: PrivacyOption): string {
  if (opt.disappearAfterView) return "After view";
  if (opt.viewOnce) return "View once";
  if (opt.viewLimit !== null && opt.viewLimit !== undefined) {
    return `${opt.viewLimit} view${opt.viewLimit > 1 ? "s" : ""}`;
  }
  return "";
}
