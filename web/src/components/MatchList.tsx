import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dayKey, formatDay, formatTime } from "@/lib/format";
import type { Match } from "@/lib/types";
import { cn } from "@/lib/utils";

export function matchHref(m: Match, manage = false): string {
  return !manage && m.status === "published" && m.shareCode ? `/m/${m.shareCode}` : `/matches/${m.id}`;
}

interface Props {
  matches: Match[];
  /** Link to the management page and show status badges, for umpires and admins. */
  manage?: boolean;
  empty?: string;
}

/** Which side won, counting a shootout; null for a draw. */
function winner(m: Match): "home" | "away" | null {
  if (m.home.score !== m.away.score) return m.home.score > m.away.score ? "home" : "away";
  if (m.home.shootout !== null && m.away.shootout !== null && m.home.shootout !== m.away.shootout) {
    return m.home.shootout > m.away.shootout ? "home" : "away";
  }
  return null;
}

/** Matches grouped by day (UK time), newest first, as they come from the API. */
function byDay(matches: Match[]): { day: string; label: string; matches: Match[] }[] {
  const groups: { day: string; label: string; matches: Match[] }[] = [];
  for (const m of matches) {
    const day = dayKey(m.playedAt);
    const last = groups.at(-1);
    if (last?.day === day) last.matches.push(m);
    else groups.push({ day, label: formatDay(m.playedAt), matches: [m] });
  }
  return groups;
}

/** Results as cards, a heading per day: each team on its own line with its score, the winner in bold. */
export function MatchList({ matches, manage = false, empty = "No matches yet." }: Props) {
  if (matches.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground">
        <p>{empty}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-8">
      {byDay(matches).map((group) => (
        <section key={group.day} aria-label={group.label} className="space-y-3">
          <h2 className="px-1 font-sans text-sm font-semibold text-muted-foreground">{group.label}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {group.matches.map((m) => (
              <li key={m.id} className="min-w-0">
                <MatchCard match={m} manage={manage} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MatchCard({ match: m, manage }: { match: Match; manage: boolean }) {
  const won = winner(m);
  const shootout = m.home.shootout !== null && m.away.shootout !== null;
  const details = [m.competition, m.venue].filter(Boolean).join(" · ");
  const team = (s: "home" | "away") => {
    const t = m[s];
    const tone = won === s ? "font-semibold text-foreground" : won ? "text-muted-foreground" : "font-medium text-foreground";
    return (
      <span className="flex items-center gap-3">
        <span className={cn("min-w-0 flex-1 text-[1.05rem] leading-snug break-words", tone)}>{t.name}</span>
        {shootout && <span className="text-xs text-muted-foreground tabular-nums">({t.shootout})</span>}
        <span className={cn("w-8 text-right font-heading text-2xl font-extrabold tabular-nums", won && won !== s && "text-muted-foreground")}>{t.score}</span>
      </span>
    );
  };
  return (
    <Link
      href={matchHref(m, manage)}
      className="flex h-full flex-col gap-3 rounded-2xl border bg-card p-5 text-foreground no-underline transition-[border-color,box-shadow] hover:border-foreground/15 hover:no-underline hover:shadow-md hover:shadow-black/5"
    >
      <span className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span className="tabular-nums">{formatTime(m.playedAt)}</span>
        {manage ? (
          <span className="flex flex-wrap gap-1.5">
            <StatusBadges match={m} />
          </span>
        ) : (
          <span className="font-medium text-foreground">{shootout ? `FT · Shootout ${m.home.shootout}–${m.away.shootout}` : "FT"}</span>
        )}
      </span>
      <span className="flex flex-col gap-2">
        {team("home")}
        {team("away")}
      </span>
      {details && <span className="mt-auto truncate border-t pt-3 text-sm text-muted-foreground" title={details}>{details}</span>}
    </Link>
  );
}

export function StatusBadges({ match: m }: { match: Match }) {
  const unlinked = m.home.teamId === null || m.away.teamId === null;
  return (
    <>
      {m.status === "draft" ? (
        <Badge variant="secondary">Draft</Badge>
      ) : (
        <Badge>Published</Badge>
      )}
      {unlinked && <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200">Link teams</Badge>}
    </>
  );
}

/** "Older matches" link keeping the current filters. */
export function Pager({ cursor, params, label = "Older matches" }: { cursor: string | null; params: Record<string, string | undefined>; label?: string }) {
  if (!cursor) return null;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  q.set("cursor", cursor);
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" asChild>
        <Link href={`?${q.toString()}`}>{label}</Link>
      </Button>
    </div>
  );
}
