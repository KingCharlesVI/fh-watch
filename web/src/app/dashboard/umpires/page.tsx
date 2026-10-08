import { UMPIRE_LEVELS, hasRole } from "@fh/shared";
import { removeClubUmpire, updateClubUmpire } from "@/app/actions/umpiring";
import { ActionForm } from "@/components/ActionForm";
import { AddClubUmpire } from "@/components/AddClubUmpire";
import { FilterSelect } from "@/components/FilterSelect";
import { PageHeader } from "@/components/PageHeader";
import { UmpiringNav } from "@/components/UmpiringNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { requireClubAdmin } from "@/lib/session";
import type { ClubUmpire, ClubWithTeams, Items } from "@/lib/types";

export const metadata = { title: "Club umpires" };

const LEVEL_OPTIONS = [{ value: "none", label: "Not recorded" }, ...UMPIRE_LEVELS.map((l, i) => ({ value: String(i), label: l }))];

/** The club's umpire list: who can be appointed to its fixtures, their level, and the team they play for. */
export default async function ClubUmpiresPage() {
  const user = await requireClubAdmin("/dashboard/umpires");
  const [club, umpires] = await Promise.all([
    api<ClubWithTeams>(`/v1/clubs/${user.clubId}`),
    api<Items<ClubUmpire>>(`/v1/clubs/${user.clubId}/umpires`),
  ]);
  const teamOptions = [{ value: "none", label: "None" }, ...club.teams.map((t) => ({ value: t.id, label: t.name }))];

  return (
    <div className="space-y-6">
      <PageHeader title="Club umpires" description={`Who ${club.name} can appoint to its fixtures.`} back={{ href: "/dashboard", label: "Dashboard" }} />
      <UmpiringNav umpire={hasRole(user, "umpire")} clubAdmin />

      <Card>
        <CardContent>
          <AddClubUmpire clubId={club.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>The list</CardTitle>
          <CardDescription>
            A level is checked against what a competition asks for. The team they play for keeps them from being suggested for its matches, or at
            the same time. This season counts the appointments they&apos;ve accepted for {club.name}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {umpires.items.length === 0 ? (
            <p className="text-muted-foreground">No umpires yet. Add them above.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Umpire</TableHead>
                  <TableHead>Level and team</TableHead>
                  <TableHead className="text-right">This season</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {umpires.items.map((u) => (
                  <TableRow key={u.userId}>
                    <TableCell>
                      <div className="font-medium">{u.displayName}</div>
                      <div className="text-sm text-muted-foreground">{u.email}</div>
                    </TableCell>
                    <TableCell>
                      <ActionForm action={updateClubUmpire} submitLabel="Save" variant="outline" inline>
                        <input type="hidden" name="clubId" value={club.id} />
                        <input type="hidden" name="userId" value={u.userId} />
                        <div className="w-36">
                          <FilterSelect name="level" defaultValue={u.level === null ? "none" : String(u.level)} options={LEVEL_OPTIONS} />
                        </div>
                        <div className="w-36">
                          <FilterSelect name="playsForTeamId" defaultValue={u.playsForTeamId ?? "none"} options={teamOptions} />
                        </div>
                      </ActionForm>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{u.seasonAppointments}</TableCell>
                    <TableCell className="text-right">
                      <ActionForm
                        action={removeClubUmpire}
                        submitLabel="Remove"
                        variant="outline"
                        inline
                        confirm={{
                          title: `Take ${u.displayName} off the list?`,
                          description: "Their appointments stay as they are. They can be added again later.",
                          action: "Remove",
                        }}
                      >
                        <input type="hidden" name="clubId" value={club.id} />
                        <input type="hidden" name="userId" value={u.userId} />
                      </ActionForm>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
