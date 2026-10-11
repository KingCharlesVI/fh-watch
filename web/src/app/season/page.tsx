import { fixtureWhen, hasRole, localDay, seasonStart } from "@fh/shared";
import { roleLabel } from "@/components/AppointmentBadge";
import { MatchList } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { UmpiringNav } from "@/components/UmpiringNav";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { dayStartIso } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Items, Match, MyAppointment, Page } from "@/lib/types";

export const metadata = { title: "My season" };

/** This season so far (from 1 August): the matches you've umpired, and the appointments you've taken. */
export default async function SeasonPage() {
  const user = await requireUser("/season");
  const today = localDay(new Date());
  const start = seasonStart(today);
  const [matches, appointments] = await Promise.all([
    api<Page<Match>>("/v1/matches", { query: { umpireId: user.id, from: dayStartIso(start), limit: 100 } }),
    api<Items<MyAppointment>>("/v1/me/appointments", { query: { from: start } }),
  ]);
  const accepted = appointments.items.filter((a) => a.status === "accepted");
  const done = accepted.filter((a) => a.fixture.date < today);
  const toCome = accepted.filter((a) => a.fixture.date >= today);
  const startYear = Number(start.slice(0, 4));

  return (
    <div className="space-y-6">
      <PageHeader title="My season" description={`${startYear}–${String(startYear + 1).slice(2)}, from 1 August.`} />
      <UmpiringNav umpire clubAdmin={hasRole(user, "club_admin") && !!user.clubId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Matches umpired" value={matches.items.length + (matches.nextCursor ? "+" : "")} />
        <Stat label="Appointments done" value={String(done.length)} />
        <Stat label="Appointments to come" value={String(toCome.length)} />
      </div>

      {accepted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Appointments</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {accepted.map((a) => (
                <li key={a.id} className="flex flex-wrap justify-between gap-x-4 text-sm">
                  <span>
                    <span className="font-medium">
                      {a.fixture.home.name} v {a.fixture.away.name}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {roleLabel(a.role)} for {a.club.name}
                    </span>
                  </span>
                  <span className="text-muted-foreground">{fixtureWhen(a.fixture.date, a.fixture.time)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Matches you&apos;ve umpired</h2>
        <MatchList matches={matches.items} manage empty="None yet this season." />
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="gap-1 px-4 py-3">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
    </Card>
  );
}
