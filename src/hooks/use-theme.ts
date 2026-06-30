import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getInitial(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem("gushu-theme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitial);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    localStorage.setItem("gushu-theme", theme);
  }, [theme]);

  return {
    theme,
    toggle: () => {
      const next = theme === "dark" ? "light" : "dark";
      
      // Use View Transitions API if supported for premium animation
      if (typeof document !== "undefined" && (document as any).startViewTransition) {
        (document as any).startViewTransition(() => setTheme(next));
      } else {
        setTheme(next);
      }
    },
    set: setTheme,
  };
}
