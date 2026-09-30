import { cn } from "@/lib/utils";

/**
 * Clubs have no crest or colour on the site yet, so each gets a badge: its initials on
 * a colour picked from its name, the same every time.
 */
const COLOURS = ["#1d4ed8", "#b91c1c", "#047857", "#7c3aed", "#c2410c", "#0e7490", "#be185d", "#4d7c0f", "#1e3a8a", "#92400e"];

/** Words that don't say which club it is. */
const FILLER = new Set(["hockey", "club", "hc", "fc", "the", "of", "and", "&"]);

export function clubInitials(name: string): string {
  const words = name.split(/\s+/).filter((w) => w && !FILLER.has(w.toLowerCase()));
  const letters = (words.length ? words : name.split(/\s+/)).slice(0, 2).map((w) => w[0]!.toUpperCase());
  return letters.join("") || "?";
}

export function clubColour(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLOURS[hash % COLOURS.length]!;
}

export function ClubBadge({ name, size = "md", className }: { name: string; size?: "sm" | "md" | "lg"; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-heading font-bold text-white shadow-sm",
        size === "sm" && "size-9 text-sm",
        size === "md" && "size-11 text-base",
        size === "lg" && "size-16 rounded-2xl text-2xl",
        className,
      )}
      style={{ background: clubColour(name) }}
    >
      {clubInitials(name)}
    </span>
  );
}
