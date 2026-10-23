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

/**
 * Results like a newspaper's results table: a heading per day, then one row per match with the
 * score in a small scoreboard, the winner's number in hi-vis.
 */
export function MatchList({ matches, manage = false, empty = "No matches yet." }: Props) {
  if (matches.length === 0) {
    return (
      <Card className="py-12 text-center text-muted-foreground">
        <p>{empty}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-7">
      {byDay(matches).map((group) => (
        <section key={group.day} aria-label={group.label} className="space-y-2.5">
          <h2 className="section-title flex items-center gap-3 text-base text-muted-foreground after:h-px after:flex-1 after:bg-border">{group.label}</h2>
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {group.matches.map((m) => (
              <li key={m.id}>
                <MatchRow match={m} manage={manage} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** The two scores as a scoreboard shows them, with the shootout under it when there was one. */
function ScoreBox({ match: m, won }: { match: Match; won: "home" | "away" | null }) {
  const digit = (s: "home" | "away") => cn(won === s ? "text-hivis" : won ? "text-pitch-foreground/60" : "text-pitch-foreground");
  const shootout = m.home.shootout !== null && m.away.shootout !== null;
  return (
    <span className="flex flex-col items-center gap-1">
      <span className="font-score inline-flex items-center gap-1.5 rounded-sm bg-pitch px-2.5 py-1.5 text-2xl">
        <span className={digit("home")}>{m.home.score}</span>
        <span className="text-base text-pitch-foreground/40">–</span>
        <span className={digit("away")}>{m.away.score}</span>
      </span>
      {shootout && (
        <span className="font-mono text-[0.68rem] font-semibold text-muted-foreground">
          SO {m.home.shootout}–{m.away.shootout}
        </span>
      )}
    </span>
  );
}

function MatchRow({ match: m, manage }: { match: Match; manage: boolean }) {
  const won = winner(m);
  const side = (s: "home" | "away") =>
    cn("min-w-0 leading-snug break-words font-stretch-94%", won === s ? "font-bold text-foreground" : won ? "text-muted-foreground" : "font-semibold text-foreground");
  const details = [m.competition, m.venue].filter(Boolean).join(" · ");
  return (
    <Link
      href={matchHref(m, manage)}
      className="group grid gap-x-4 gap-y-2 px-4 py-3.5 text-foreground no-underline transition-colors hover:bg-muted/50 hover:no-underline md:grid-cols-[3.5rem_1fr_minmax(0,13rem)] md:items-center"
    >
      <span className="flex items-center justify-between gap-2 md:contents">
        <span className="font-mono text-xs font-semibold text-muted-foreground md:order-1">{formatTime(m.playedAt)}</span>
        <span className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 text-xs text-muted-foreground md:order-3">
          {details && (
            <span className="max-w-full truncate" title={details}>
              {details}
            </span>
          )}
          {manage && <StatusBadges match={m} />}
        </span>
      </span>
      <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4 md:order-2">
        <span className={cn(side("home"), "text-right text-[1.05rem]")}>{m.home.name}</span>
        <ScoreBox match={m} won={won} />
        <span className={cn(side("away"), "text-[1.05rem]")}>{m.away.name}</span>
      </span>
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
