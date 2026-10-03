import { TriangleAlert } from "lucide-react";
import { Banner, Board } from "@/components/Board";
import { IncidentItem } from "@/components/IncidentItem";
import { Container, Heading, Panel } from "@/components/ui";
import { componentLevel, overall } from "@/lib/board";
import { COMPONENTS } from "@/lib/components";
import { loadBoard } from "@/lib/incidents";
import { probeAll } from "@/lib/probe";
import { showDate } from "@/lib/site";

/** Checked on every request, give or take: a cached status page is no use. */
export const dynamic = "force-dynamic";

export default async function StatusPage() {
  const [checks, board] = await Promise.all([probeAll(), loadBoard()]);
  const levels = COMPONENTS.map(
    (c) => componentLevel(c, checks.find((k) => k.id === c.id), board.notes, board.open).level,
  );
  const recent = board.history.filter((i) => i.resolvedAt).slice(0, 5);

  return (
    <Container className="space-y-10 py-8">
      <Banner level={overall(levels)} checkedAt={new Date()} />

      {!board.ok && (
        <Panel className="flex items-start gap-3 border-warn/30 bg-warn/10 p-4 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <p>
            The checks above are live, but this page can&apos;t reach its own records, so incidents and uptime are missing. That&apos;s a problem with
            this page, not with the apps.
          </p>
        </Panel>
      )}

      {board.open.length > 0 && (
        <section className="space-y-3">
          <Heading>Going on now</Heading>
          {board.open.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} />
          ))}
        </section>
      )}

      {board.upcoming.length > 0 && (
        <section className="space-y-3">
          <Heading>Planned maintenance</Heading>
          {board.upcoming.map((incident) => (
            <IncidentItem key={incident.id} incident={incident} />
          ))}
        </section>
      )}

      <Board checks={checks} notes={board.notes} open={board.open} history={board.history} />

      <section className="space-y-3">
        <Heading
          action={
            <a href="/history" className="text-sm font-medium text-primary no-underline hover:underline">
              All history
            </a>
          }
        >
          Lately
        </Heading>
        {recent.length === 0 ? (
          <Panel className="p-5 text-sm text-muted-foreground">
            Nothing to report in the last 90 days{board.history.length > board.history.filter((i) => i.resolvedAt).length ? " that's finished" : ""}.
          </Panel>
        ) : (
          <div className="space-y-3">
            {recent.map((incident) => (
              <div key={incident.id}>
                <p className="mb-1 text-xs text-muted-foreground">{showDate(incident.startedAt)}</p>
                <IncidentItem incident={incident} />
              </div>
            ))}
          </div>
        )}
      </section>
    </Container>
  );
}
