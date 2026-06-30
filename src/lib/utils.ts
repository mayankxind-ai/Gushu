import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function debounceInvalidation(
  qc: import("@tanstack/react-query").QueryClient,
  keys: string[][],
  ms = 300,
) {
  const tag = keys.map((k) => k.join("/")).join("|");
  const existing = (qc as any).__debounceMap;
  const map: Map<string, ReturnType<typeof setTimeout>> = existing ?? new Map();
  if (!existing) (qc as any).__debounceMap = map;
  const prev = map.get(tag);
  if (prev) clearTimeout(prev);
  map.set(
    tag,
    setTimeout(() => {
      map.delete(tag);
      for (const k of keys) qc.invalidateQueries({ queryKey: k });
    }, ms),
  );
}
