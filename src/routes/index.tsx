import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/logo";

export const Route = createFileRoute("/")({
  ssr: false,
  component: Index,
});

function Index() {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      // Small delay for aesthetic splash experience
      setTimeout(() => {
        setTarget(data.session ? "/app" : "/auth");
      }, 1000);
    });
  }, []);

  if (!target) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background">
        <div className="relative mb-6">
          <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
          <div className="relative animate-in-scale rounded-full overflow-hidden">
            <Logo size={80} />
          </div>
        </div>
        <div className="h-0.5 w-32 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-full origin-left animate-[loading_1.5s_infinite_linear] brand-gradient" />
        </div>
        <style>{`
          @keyframes loading {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      </div>
    );
  }
  return <Navigate to={target} />;
}
