import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { dayKey, formatDateTime, formatDay, formatTime } from "@/lib/format";
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

/** Results like a sports site's: a heading per day, and the scores lined up in one column. */
export function MatchList({ matches, manage = false, empty = "No matches yet." }: Props) {
  if (matches.length === 0) {
    return (
      <Card className="py-10 text-center text-muted-foreground">
        <p>{empty}</p>
      </Card>
    );
  }
  return (
    <div className="space-y-6">
      {byDay(matches).map((group) => (
        <section key={group.day} aria-label={group.label} className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-muted-foreground">{group.label}</h2>
          <Card className="gap-0 overflow-hidden py-0">
            <ul className="divide-y">
              {group.matches.map((m) => (
                <li key={m.id}>
                  <MatchRow match={m} manage={manage} />
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}

function MatchRow({ match: m, manage }: { match: Match; manage: boolean }) {
  const won = winner(m);
  const side = (s: "home" | "away") => cn("min-w-0 break-words", won === s ? "font-semibold text-foreground" : won ? "text-muted-foreground" : "text-foreground");
  const shootout = m.home.shootout !== null && m.away.shootout !== null;
  return (
    <Link
      href={matchHref(m, manage)}
      // A fixed width on the right, so the scores line up from row to row; wider for the status badges.
      className={cn(
        "grid gap-x-4 gap-y-1.5 px-4 py-3 no-underline transition-colors hover:bg-muted/60 hover:no-underline md:items-center",
        manage ? "md:grid-cols-[3.5rem_1fr_17rem]" : "md:grid-cols-[3.5rem_1fr_11rem]",
      )}
    >
      <span className="hidden text-sm text-muted-foreground tabular-nums md:block">{formatTime(m.playedAt)}</span>
      <span className="grid grid-cols-[1fr_4.5rem_1fr] items-center gap-3">
        <span className={cn(side("home"), "text-right")}>{m.home.name}</span>
        <span className="flex flex-col items-center leading-tight">
          <span className="rounded-md bg-muted px-2 py-0.5 font-heading font-bold text-foreground tabular-nums">
            {m.home.score}–{m.away.score}
          </span>
          {shootout && (
            <span className="mt-0.5 text-[0.7rem] text-muted-foreground tabular-nums">
              {m.home.shootout}–{m.away.shootout} SO
            </span>
          )}
        </span>
        <span className={side("away")}>{m.away.name}</span>
      </span>
      <span className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground md:justify-end">
        {m.competition && <span className="max-w-full truncate" title={m.competition}>{m.competition}</span>}
        {manage && <StatusBadges match={m} />}
      </span>
    </Link>
  );
}

export function StatusBadges({ match: m }: { match: Match }) {
  const unlinked = m.home.teamId === null || m.away.teamId === null;
  return (
    <>
      {m.status === "draft" ? (
        <Badge variant="secondary" title={m.autoPublishAt ? `Publishes itself ${formatDateTime(m.autoPublishAt)}` : undefined}>
          Draft{m.autoPublishAt ? ` · auto ${formatDateTime(m.autoPublishAt)}` : ""}
        </Badge>
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
