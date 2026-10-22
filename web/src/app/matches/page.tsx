import { Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { MatchFilterFields, type MatchFilterParams, loadMatchFilters } from "@/components/MatchFilters";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Club, Items, Match, Page, TeamWithClub } from "@/lib/types";

export const metadata = { title: "Results" };

/** Every published result, newest first, with a search for clubs and teams, and filters. */
export default async function Matches({ searchParams }: { searchParams: Promise<MatchFilterParams & { q?: string; cursor?: string }> }) {
  const sp = await searchParams;
  const { cursor } = sp;
  const query = sp.q?.trim();
  const filters = await loadMatchFilters(sp);
  const filtered = Object.values(filters.query).some(Boolean);
  const [matches, teams, clubs] = await Promise.all([
    api<Page<Match>>("/v1/matches", { query: { status: "published", limit: 25, cursor, ...filters.query } }),
    query ? api<Items<TeamWithClub>>("/v1/teams", { query: { q: query } }) : null,
    query ? api<Items<Club>>("/v1/clubs", { query: { q: query } }) : null,
  ]);

  // What's filtered on, each with a link that drops just that filter.
  const { clubId, teamId, competition, venue } = filters.query;
  const without = (key: keyof MatchFilterParams) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(filters.query)) if (v && k !== key && !(key === "clubId" && k === "teamId")) q.set(k, v);
    return `/matches${q.size ? `?${q}` : ""}`;
  };
  const chips = [
    clubId && { key: "clubId" as const, label: filters.clubs?.find((c) => c.id === clubId)?.name ?? "Club" },
    teamId && { key: "teamId" as const, label: filters.teams.find((t) => t.id === teamId)?.name ?? "Team" },
    competition && { key: "competition" as const, label: competition },
    venue && { key: "venue" as const, label: venue },
  ].filter((c) => !!c);

  return (
    <div className="space-y-6">
      <PageHeader title="Results" description="Every published match, newest first." />

      <div className="flex flex-wrap items-center gap-3">
        <form
          role="search"
          action="/matches"
          className="flex h-11 w-full max-w-md items-center gap-2 rounded-full border bg-card pr-1.5 pl-4 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
        >
          <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <label htmlFor="q" className="sr-only">
            Find a club or team
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder="Find a club or team, e.g. Hawks M1"
            defaultValue={query}
            className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" size="sm">
            Search
          </Button>
        </form>
        {chips.map((c) => (
          <Link
            key={c.key}
            href={without(c.key)}
            aria-label={`Remove filter: ${c.label}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-foreground pr-2.5 pl-4 text-sm font-medium text-background no-underline hover:bg-foreground/85 hover:no-underline"
          >
            {c.label} <X className="size-3.5" />
          </Link>
        ))}
      </div>

      {query && (
        <section aria-label="Search results" className="rounded-2xl border bg-card p-5">
          {clubs!.items.length + teams!.items.length === 0 ? (
            <p className="text-muted-foreground">Nothing matches “{query}”.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {clubs!.items.map((c) => (
                <li key={c.id}>
                  <Link href={`/clubs/${c.slug}`} className="inline-flex h-9 items-center gap-2 rounded-full border px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline">
                    {c.name} <span className="text-xs text-muted-foreground">Club</span>
                  </Link>
                </li>
              ))}
              {teams!.items.map((t) => (
                <li key={t.id}>
                  <Link href={`/clubs/${t.club.slug}/${t.slug}`} className="inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline">
                    {t.club.name} {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <details className="group rounded-2xl border bg-card open:pb-5" open={filtered || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold select-none hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
          <SlidersHorizontal className="size-4 text-muted-foreground" />
          Filter by club, competition or venue
          <span className="ml-auto text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
          <span className="ml-auto hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
        </summary>
        <form aria-label="Filter results" action="/matches" className="flex flex-wrap items-end gap-3 px-5 pt-2">
          <MatchFilterFields filters={filters} />
          <div className="flex gap-2">
            <Button type="submit">Apply</Button>
            {filtered && (
              <Button variant="outline" asChild>
                <Link href="/matches">Clear</Link>
              </Button>
            )}
          </div>
        </form>
      </details>

      <MatchList matches={matches.items} empty={filtered ? "No results match these filters." : "No results have been published yet."} />
      <Pager cursor={matches.nextCursor} params={{ q: query, ...filters.query }} />
    </div>
  );
}
