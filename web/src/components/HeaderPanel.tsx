import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A page's lead panel, edged in pitch green like the header: the scoreboard, the home page's lead, a club's or team's header. */
export function HeaderPanel({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section aria-label={label} className={cn("rounded-xl border border-t-[3px] border-t-pitch bg-card text-card-foreground", className)}>
      {children}
    </section>
  );
}
