import { fixtureWhen, umpireLevelName } from "@fh/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { appoint, deleteFixture, unappoint, updateFixture } from "@/app/actions/umpiring";
import { ActionForm } from "@/components/ActionForm";
import { AppointmentBadge, roleLabel } from "@/components/AppointmentBadge";
import { FilterSelect } from "@/components/FilterSelect";
import { FixtureForm } from "@/components/FixtureForm";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, apiOrNull } from "@/lib/api";
import { requireClubAdmin } from "@/lib/session";
import type { ClubWithTeams, Fixture, Items, UmpireSuggestion } from "@/lib/types";
import { openRoles, shortOf } from "@/lib/umpiring";

export const metadata = { title: "Fixture" };

const AVAILABILITY = {
  available: { label: "Free", variant: "default" },
  unknown: { label: "Not said", variant: "secondary" },
  unavailable: { label: "Not free", variant: "outline" },
} as const;

/** One fixture: who's umpiring it, who to ask (best first), and its details. */
export default async function FixturePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireClubAdmin(`/dashboard/fixtures/${id}`);
  const fixture = await apiOrNull<Fixture>(`/v1/clubs/${user.clubId}/fixtures/${id}`);
  if (!fixture) notFound();
  const roles = openRoles(fixture);
  const [club, suggestions] = await Promise.all([
    api<ClubWithTeams>(`/v1/clubs/${user.clubId}`),
    roles.length ? api<Items<UmpireSuggestion>>(`/v1/clubs/${user.clubId}/fixtures/${id}/suggestions`) : null,
  ]);
  const short = shortOf(fixture);
  const roleOptions = roles.map((r) => ({ value: r, label: roleLabel(r) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${fixture.home.name} v ${fixture.away.name}`}
        description={[fixtureWhen(fixture.date, fixture.time), fixture.venue, fixture.competition].filter(Boolean).join(" · ")}
        back={{ href: "/dashboard/fixtures", label: "Club fixtures" }}
        actions={short > 0 ? <Badge variant="destructive">Needs {short}</Badge> : <Badge>Umpires in place</Badge>}
      />

      <Card>
        <CardHeader>
          <CardTitle>Umpires</CardTitle>
          <CardDescription>
            The watch umpire runs the watch app, and gets the match set up on their phone. The second umpire is named on the match.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {fixture.appointments.length === 0 && <p className="text-muted-foreground">Nobody asked yet.</p>}
          {fixture.appointments.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.displayName}</span>
                <span className="text-sm text-muted-foreground">
                  {roleLabel(a.role)}
                  {a.mentoring && ", mentoring"}
                </span>
                <AppointmentBadge appointment={a} />
              </div>
              <ActionForm
                action={unappoint}
                submitLabel="Take off"
                variant="outline"
                inline
                confirm={{
                  title: `Take ${a.displayName} off?`,
                  description: a.status === "declined" ? "Their answer is forgotten." : "They're emailed to say they're no longer needed.",
                  action: "Take off",
                }}
              >
                <input type="hidden" name="clubId" value={club.id} />
                <input type="hidden" name="fixtureId" value={fixture.id} />
                <input type="hidden" name="appointmentId" value={a.id} />
              </ActionForm>
            </div>
          ))}
        </CardContent>
      </Card>

      {suggestions && (
        <Card>
          <CardHeader>
            <CardTitle>Who to ask</CardTitle>
            <CardDescription>
              The club&apos;s umpires, best first: free before not said before not free, then those with nothing against them, then whoever has
              done fewest this season. They&apos;re emailed when asked.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {suggestions.items.length === 0 ? (
              <p className="text-muted-foreground">
                The club has no umpires on its list yet. <Link href="/dashboard/umpires">Add them</Link>.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Umpire</TableHead>
                    <TableHead>Free?</TableHead>
                    <TableHead className="text-right">This season</TableHead>
                    <TableHead>Ask as</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.items.map((s) => (
                    <TableRow key={s.userId}>
                      <TableCell className="align-top">
                        <div className="font-medium">{s.displayName}</div>
                        {umpireLevelName(s.level) && <div className="text-sm text-muted-foreground">{umpireLevelName(s.level)}</div>}
                        {s.clashes.length > 0 && (
                          <ul className="mt-1 list-disc pl-4 text-sm text-destructive">
                            {s.clashes.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        )}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={AVAILABILITY[s.availability].variant}>{AVAILABILITY[s.availability].label}</Badge>
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">{s.seasonAppointments}</TableCell>
                      <TableCell className="align-top">
                        <ActionForm action={appoint} submitLabel="Ask" variant="outline" inline>
                          <input type="hidden" name="clubId" value={club.id} />
                          <input type="hidden" name="fixtureId" value={fixture.id} />
                          <input type="hidden" name="userId" value={s.userId} />
                          <div className="w-40">
                            <FilterSelect name="role" defaultValue={roles[0]} options={roleOptions} />
                          </div>
                          <label className="flex items-center gap-1.5 text-sm">
                            <input type="checkbox" name="mentoring" className="size-4" /> Mentoring
                          </label>
                        </ActionForm>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>If the day, kick-off or venue changes, the umpires asked are emailed.</CardDescription>
        </CardHeader>
        <CardContent>
          <FixtureForm club={club} fixture={fixture} action={updateFixture} submitLabel="Save" />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete fixture</CardTitle>
          <CardDescription>For a match that&apos;s off. Anyone asked to umpire it is emailed.</CardDescription>
        </CardHeader>
        <CardContent>
          <ActionForm
            action={deleteFixture}
            submitLabel="Delete fixture"
            variant="destructive"
            confirm={{ title: "Delete this fixture?", description: "It can't be undone." }}
          >
            <input type="hidden" name="clubId" value={club.id} />
            <input type="hidden" name="fixtureId" value={fixture.id} />
          </ActionForm>
        </CardContent>
      </Card>
    </div>
  );
}
