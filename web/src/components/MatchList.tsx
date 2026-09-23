import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatDateTime, scoreline } from "@/lib/format";
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

export function MatchList({ matches, manage = false, empty = "No matches yet." }: Props) {
  if (matches.length === 0) {
    return (
      <Card className="py-10 text-center text-muted-foreground">
        <p>{empty}</p>
      </Card>
    );
  }
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <ul className="divide-y">
        {matches.map((m) => (
          <li key={m.id}>
            <Link
              href={matchHref(m, manage)}
              className="grid gap-x-4 gap-y-1 px-4 py-3 text-foreground no-underline transition-colors hover:bg-muted/60 hover:no-underline sm:grid-cols-[8.5rem_1fr_auto] sm:items-center"
            >
              <span className="text-sm text-muted-foreground">{formatDate(m.playedAt)}</span>
              <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <span className={cn("text-right", m.home.score > m.away.score && "font-semibold")}>{m.home.name}</span>
                <span className="font-bold whitespace-nowrap tabular-nums">{scoreline(m.home, m.away)}</span>
                <span className={cn(m.away.score > m.home.score && "font-semibold")}>{m.away.name}</span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground sm:justify-end">
                {m.competition && <span>{m.competition}</span>}
                {manage && <StatusBadges match={m} />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
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
    <div className="mt-4">
      <Button variant="outline" asChild>
        <Link href={`?${q.toString()}`}>{label}</Link>
      </Button>
    </div>
  );
}
