import { hasRole } from "@fh/shared";
import { CircleCheck, Download, FilePen, Hourglass, Link2Off } from "lucide-react";
import Link from "next/link";
import { FilterPanel, PillLinks } from "@/components/FilterPanel";
import { MatchFilterFields, type MatchFilterParams, loadMatchFilters } from "@/components/MatchFilters";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { addDaysIso, dayStartIso, formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { ClubWithTeams, Match, Page } from "@/lib/types";

export const metadata = { title: "Dashboard" };

type Search = MatchFilterParams & { view?: string; status?: string; from?: string; to?: string; cursor?: string; deleted?: string };

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
  // The summary counts this view's matches, whatever the filters below say.
  const scope = view === "mine" ? { umpireId: user.id } : view === "club" ? { clubId: user.clubId ?? undefined } : {};
  // A club admin's club view is fixed to their club; the other views can pick one.
  const picked = await loadMatchFilters(sp, view === "club" ? { clubId: user.clubId ?? undefined } : undefined);
  const filters = {
    status,
    from: dayStartIso(sp.from),
    to: sp.to ? dayStartIso(addDaysIso(sp.to, 1)) : undefined,
    ...scope,
    ...picked.query,
  };

  const [matches, club, drafts, published] = await Promise.all([
    view ? api<Page<Match>>("/v1/matches", { query: { ...filters, limit: 25, cursor: sp.cursor } }) : null,
    isClubAdmin ? api<ClubWithTeams>(`/v1/clubs/${user.clubId}`) : null,
    view ? api<Page<Match>>("/v1/matches", { query: { ...scope, status: "draft", limit: 100 } }) : null,
    view ? api<Page<Match>>("/v1/matches", { query: { ...scope, status: "published", limit: 100 } }) : null,
  ]);
  const exportQuery = new URLSearchParams(Object.entries(filters).filter((e): e is [string, string] => !!e[1]));
  // The page's own filters, as they appear in its address.
  const own = { view, status, from: sp.from, to: sp.to, ...(view === "club" ? { ...picked.query, clubId: undefined } : picked.query) };
  const href = (changes: Partial<typeof own>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...own, ...changes })) if (v) q.set(k, v);
    return `/dashboard?${q}`;
  };
  const narrowed = !!(sp.from || sp.to || Object.entries(picked.query).some(([k, v]) => v && !(view === "club" && k === "clubId")));

  return (
    <div className="space-y-6">
      <PageHeader
        title={views.find((v) => v.key === view)?.label ?? "Dashboard"}
        description={
          view === "club" && club
            ? `Matches with ${club.name}'s teams in them.`
            : view === "all"
              ? "Every match on the site, drafts included."
              : view === "mine"
                ? "Matches you've umpired, drafts included."
                : `Signed in as ${user.displayName}`
        }
        actions={
          view && (
            <Button variant="outline" asChild>
              <a href={`/dashboard/export?${exportQuery.toString()}`}>
                <Download /> Download CSV
              </a>
            </Button>
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
          {drafts && published && <Summary drafts={drafts} published={published} view={view} />}

          <PillLinks
            label="Status"
            items={[
              { href: href({ status: undefined }), label: "All", active: !status },
              { href: href({ status: "draft" }), label: "Drafts", active: status === "draft" },
              { href: href({ status: "published" }), label: "Published", active: status === "published" },
            ]}
          />

          <FilterPanel
            summary="Filter by date, club, competition or venue"
            label="Filter matches"
            active={narrowed}
            clearHref={href({ from: undefined, to: undefined, clubId: undefined, teamId: undefined, competition: undefined, venue: undefined })}
          >
            <input type="hidden" name="view" value={view} />
            {status && <input type="hidden" name="status" value={status} />}
            <Field className="w-44">
              <FieldLabel htmlFor="from">From</FieldLabel>
              <Input id="from" type="date" name="from" defaultValue={sp.from} />
            </Field>
            <Field className="w-44">
              <FieldLabel htmlFor="to">To</FieldLabel>
              <Input id="to" type="date" name="to" defaultValue={sp.to} />
            </Field>
            <MatchFilterFields filters={picked} />
          </FilterPanel>

          <MatchList matches={matches!.items} manage empty="No matches match these filters." />
          <Pager cursor={matches!.nextCursor} params={own} />
        </>
      )}
    </div>
  );
}

/** "12", or "100+" when there are more than one page holds. */
const count = (p: Page<Match>) => (p.nextCursor ? `${p.items.length}+` : String(p.items.length));

/** At a glance: drafts, published, matches whose teams aren't linked, and the draft that's waited longest. */
function Summary({ drafts, published, view }: { drafts: Page<Match>; published: Page<Match>; view: string }) {
  const unlinked = [...drafts.items, ...published.items].filter((m) => m.home.teamId === null || m.away.teamId === null).length;
  // Nothing publishes by itself, so the one that's waited longest is worth a nudge.
  const oldest = [...drafts.items].sort((a, b) => a.playedAt.localeCompare(b.playedAt))[0];
  const tiles = [
    { icon: FilePen, label: "Drafts", value: count(drafts), href: `/dashboard?view=${view}&status=draft`, note: "Not published yet" },
    { icon: CircleCheck, label: "Published", value: count(published), href: `/dashboard?view=${view}&status=published`, note: "On the website" },
    { icon: Link2Off, label: "Teams to link", value: String(unlinked), href: null, note: "Not on club pages until linked" },
    {
      icon: Hourglass,
      label: "Oldest draft",
      value: oldest ? formatDate(oldest.playedAt) : "None",
      href: oldest ? `/matches/${oldest.id}` : null,
      note: oldest ? `${oldest.home.name} v ${oldest.away.name}: publish it?` : "Nothing waiting to publish",
    },
  ];
  return (
    <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map(({ icon: Icon, label, value, href, note }) => {
        const body = (
          <Card className="h-full py-0 transition-colors group-hover:bg-muted/60">
            <CardContent className="space-y-1 px-4 py-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Icon className="size-4" /> {label}
              </div>
              <div className="font-heading text-2xl font-bold tabular-nums">{value}</div>
              <div className="truncate text-xs text-muted-foreground">{note}</div>
            </CardContent>
          </Card>
        );
        return href ? (
          <Link key={label} href={href} className="group block text-foreground no-underline hover:no-underline">
            {body}
          </Link>
        ) : (
          <div key={label}>{body}</div>
        );
      })}
    </section>
  );
}
