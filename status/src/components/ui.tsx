import type { ReactNode } from "react";
import { LEVEL_LOOK, LEVEL_TEXT, type Level } from "@/lib/status";

export function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-3xl px-5 ${className}`}>{children}</div>;
}

/** The coloured dot beside a component. Never the only thing saying what's wrong. */
export function Dot({ level, size = 10 }: { level: Level; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 rounded-full ${LEVEL_LOOK[level].dot}`}
      style={{ width: size, height: size }}
    />
  );
}

export function LevelText({ level }: { level: Level }) {
  return <span className={`text-sm font-medium ${LEVEL_LOOK[level].text}`}>{LEVEL_TEXT[level].label}</span>;
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border bg-card ${className}`}>{children}</div>;
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | Level }) {
  const look = tone === "muted" ? "border-border text-muted-foreground" : `${LEVEL_LOOK[tone].band} ${LEVEL_LOOK[tone].text}`;
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${look}`}>{children}</span>;
}

export function Heading({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{children}</h2>
      {action}
    </div>
  );
}
