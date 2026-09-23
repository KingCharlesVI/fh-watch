import { hasRole } from "@fh/shared";
import { Download, Filter } from "lucide-react";
import Link from "next/link";
import { FilterSelect } from "@/components/FilterSelect";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { addDaysIso, dayStartIso } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { ClubWithTeams, Match, Page } from "@/lib/types";

export const metadata = { title: "Dashboard" };

type Search = { view?: string; status?: string; from?: string; to?: string; cursor?: string; deleted?: string };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser("/dashboard");
  const sp = await searchParams;
  const isClubAdmin = hasRole(user, "club_admin") && user.clubId !== null;

  // Umpires start on their own matches; club admins on their club's; admins on everything.
  const views = [
    ...(hasRole(user, "umpire") ? [{ key: "mine", label: "My matches" }] : []),
    ...(isClubAdmin ? [{ key: "club", label: "Club matches" }] : []),
    ...(hasRole(user, "admin") ? [{ key: "all", label: "All matches" }] : []),
  ];
  const view = views.find((v) => v.key === sp.view)?.key ?? views[0]?.key;
  const status = sp.status === "draft" || sp.status === "published" ? sp.status : undefined;
  const filters = {
    status,
    from: dayStartIso(sp.from),
    to: sp.to ? dayStartIso(addDaysIso(sp.to, 1)) : undefined,
    ...(view === "mine" ? { umpireId: user.id } : view === "club" ? { clubId: user.clubId ?? undefined } : {}),
  };

  const [matches, club] = await Promise.all([
    view ? api<Page<Match>>("/v1/matches", { query: { ...filters, limit: 25, cursor: sp.cursor } }) : null,
    isClubAdmin ? api<ClubWithTeams>(`/v1/clubs/${user.clubId}`) : null,
  ]);
  const exportQuery = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={
          club ? (
            <>
              Club admin for <Link href={`/clubs/${club.slug}`}>{club.name}</Link> · <Link href={`/admin/clubs/${club.id}`}>manage teams</Link>
            </>
          ) : (
            `Signed in as ${user.displayName}`
          )
        }
      />

      {!view && (
        <Card>
          <CardContent className="space-y-2">
            <p>Your account doesn&apos;t have a role with matches yet.</p>
            <p>
              <Link href="/account">Ask to become a club admin</Link> to see your club&apos;s matches.
            </p>
          </CardContent>
        </Card>
      )}

      {view && (
        <>
          {views.length > 1 && (
            <nav aria-label="Which matches" className="inline-flex rounded-lg bg-muted p-1">
              {views.map((v) => (
                <Button key={v.key} size="sm" variant={v.key === view ? "outline" : "ghost"} className={v.key === view ? "bg-background shadow-sm" : ""} asChild>
                  <Link href={`/dashboard?view=${v.key}`}>{v.label}</Link>
                </Button>
              ))}
            </nav>
          )}

          <Card>
            <CardContent>
              <form aria-label="Filter matches" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="view" value={view} />
                <Field className="w-40">
                  <FieldLabel>Status</FieldLabel>
                  <FilterSelect
                    name="status"
                    defaultValue={status ?? "any"}
                    options={[
                      { value: "any", label: "Any" },
                      { value: "draft", label: "Draft" },
                      { value: "published", label: "Published" },
                    ]}
                  />
                </Field>
                <Field className="w-44">
                  <FieldLabel htmlFor="from">From</FieldLabel>
                  <Input id="from" type="date" name="from" defaultValue={sp.from} />
                </Field>
                <Field className="w-44">
                  <FieldLabel htmlFor="to">To</FieldLabel>
                  <Input id="to" type="date" name="to" defaultValue={sp.to} />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" variant="secondary">
                    <Filter /> Filter
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={`/dashboard/export?${exportQuery.toString()}`}>
                      <Download /> CSV
                    </a>
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <MatchList matches={matches!.items} manage empty="No matches match these filters." />
          <Pager cursor={matches!.nextCursor} params={{ view, status, from: sp.from, to: sp.to }} />
        </>
      )}
    </div>
  );
}
