import { fixtureWhen, hasRole } from "@fh/shared";
import { FileUp, Plus } from "lucide-react";
import Link from "next/link";
import { AppointmentBadge } from "@/components/AppointmentBadge";
import { PageHeader } from "@/components/PageHeader";
import { UmpiringNav } from "@/components/UmpiringNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireClubAdmin } from "@/lib/session";
import { shortOf } from "@/lib/umpiring";
import type { ClubWithTeams, Fixture, Items } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: "Club fixtures" };

/** The club's fixtures from today, and who's umpiring them; or only those still short of umpires. */
export default async function ClubFixturesPage({ searchParams }: { searchParams: Promise<{ show?: string; deleted?: string }> }) {
  const user = await requireClubAdmin("/dashboard/fixtures");
  const { show, deleted } = await searchParams;
  const needs = show === "needs";
  const [club, fixtures] = await Promise.all([
    api<ClubWithTeams>(`/v1/clubs/${user.clubId}`),
    api<Items<Fixture>>(`/v1/clubs/${user.clubId}/fixtures`, { query: needs ? { needsUmpires: true } : {} }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Club fixtures"
        description={`${club.name}'s matches from today, and who's umpiring them.`}
        back={{ href: "/dashboard", label: "Dashboard" }}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/dashboard/fixtures/import">
                <FileUp /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/fixtures/new">
                <Plus /> Add a fixture
              </Link>
            </Button>
          </>
        }
      />
      <UmpiringNav umpire={hasRole(user, "umpire")} clubAdmin />
      {deleted && <p className="text-muted-foreground">The fixture was deleted, and anyone appointed to it was emailed.</p>}

      <nav aria-label="Which fixtures" className="inline-flex rounded-lg bg-muted p-1">
        {[
          { key: undefined, label: "All" },
          { key: "needs", label: "Short of umpires" },
        ].map((v) => (
          <Button key={v.label} size="sm" variant={needs === (v.key === "needs") ? "outline" : "ghost"} className={cn(needs === (v.key === "needs") && "bg-background shadow-sm")} asChild>
            <Link href={v.key ? `/dashboard/fixtures?show=${v.key}` : "/dashboard/fixtures"}>{v.label}</Link>
          </Button>
        ))}
      </nav>

      {fixtures.items.length === 0 ? (
        <Card className="py-10 text-center text-muted-foreground">
          <p>{needs ? "Every fixture has its umpires." : "No fixtures from today. Add one, or import a list."}</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {fixtures.items.map((f) => {
            const short = shortOf(f);
            const active = f.appointments.filter((a) => a.status !== "declined");
            return (
              <li key={f.id}>
                <Link href={`/dashboard/fixtures/${f.id}`} className="block text-foreground no-underline hover:no-underline">
                  <Card className="gap-2 px-4 py-3 transition-colors hover:bg-muted/50">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div>
                        <div className="font-medium">
                          {f.home.name} v {f.away.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {[fixtureWhen(f.date, f.time), f.venue, f.competition].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                      {short > 0 ? <Badge variant="destructive">Needs {short}</Badge> : <Badge>Umpires in place</Badge>}
                    </div>
                    {active.length > 0 && (
                      <div className="flex flex-wrap gap-3 text-sm">
                        {active.map((a) => (
                          <span key={a.id} className="inline-flex items-center gap-1.5">
                            {a.displayName}
                            <span className="text-muted-foreground">({a.role === "watch" ? "watch" : "second"})</span>
                            <AppointmentBadge appointment={a} />
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
