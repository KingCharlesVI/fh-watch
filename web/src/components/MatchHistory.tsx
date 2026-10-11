import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import type { MatchHistoryEntry } from "@/lib/types";

const SOURCES = { watch: "the watch", mobile: "the phone app", web: "the website" } as const;

const REASONS: Record<string, string> = {
  team_merge: "An admin merged duplicate teams",
  venue_merge: "An admin merged duplicate venues",
  competition_merge: "An admin merged duplicate competitions",
};

function headline(e: MatchHistoryEntry): string {
  const from = e.source ? ` from ${SOURCES[e.source]}` : "";
  switch (e.action) {
    case "create":
      return `Uploaded${from}`;
    case "update":
      return `Revision ${e.revision} saved${from}`;
    case "publish":
      return "Published";
    case "unpublish":
      return "Unpublished";
    case "set_umpire_2":
      return "Umpire 2 set";
    case "remove_umpire_2":
      return "Umpire 2 removed";
  }
}

/** Everything that happened to a match, newest first, with what each edit changed. */
export function MatchHistory({ items }: { items: MatchHistoryEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>History</CardTitle>
        <CardDescription>Every saved revision is kept, so the watch&apos;s original record is never lost.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-4">
          {items.map((e, i) => (
            <li key={i} className="border-l-2 pl-3">
              <div className="font-medium">{headline(e)}</div>
              <div className="text-sm text-muted-foreground">
                {e.reason ? (REASONS[e.reason] ?? e.reason) : (e.actor?.displayName ?? "Deleted user")} · {formatDateTime(e.at)}
              </div>
              {e.changes.length > 0 ? (
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {e.changes.map((c, j) => (
                    <li key={j}>{c}</li>
                  ))}
                </ul>
              ) : (
                e.action === "update" && <p className="mt-1 text-sm text-muted-foreground">Nothing shown on the match page changed.</p>
              )}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
