import type { Metadata } from "next";
import { IncidentItem } from "@/components/IncidentItem";
import { Container, Panel } from "@/components/ui";
import { recentIncidents } from "@/lib/incidents";
import { showDate } from "@/lib/site";

export const metadata: Metadata = { title: "History" };
export const dynamic = "force-dynamic";

/** Everything that's happened in the last year, newest first, grouped by month. */
export default async function HistoryPage() {
  const { data: incidents, ok } = await recentIncidents(365);
  const months = new Map<string, typeof incidents>();
  for (const incident of incidents) {
    const key = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "Europe/London" }).format(incident.startedAt);
    months.set(key, [...(months.get(key) ?? []), incident]);
  }

  return (
    <Container className="space-y-8 py-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="mt-2 text-muted-foreground">Every incident and maintenance window from the last year.</p>
      </div>

      {!ok && <Panel className="border-warn/30 bg-warn/10 p-4 text-sm">The history couldn&apos;t be read just now. Try again in a minute.</Panel>}

      {ok && incidents.length === 0 && <Panel className="p-5 text-sm text-muted-foreground">Nothing has been recorded yet.</Panel>}

      {[...months].map(([month, items]) => (
        <section key={month} className="space-y-3">
          <h2 className="text-lg font-semibold tracking-tight">{month}</h2>
          {items.map((incident) => (
            <div key={incident.id}>
              <p className="mb-1 text-xs text-muted-foreground">{showDate(incident.startedAt)}</p>
              <IncidentItem incident={incident} />
            </div>
          ))}
        </section>
      ))}
    </Container>
  );
}
