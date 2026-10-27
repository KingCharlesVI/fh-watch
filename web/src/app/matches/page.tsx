import { X } from "lucide-react";
import Link from "next/link";
import { FilterPanel } from "@/components/FilterPanel";
import { MatchFilterFields, type MatchFilterParams, loadMatchFilters } from "@/components/MatchFilters";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { SearchBox } from "@/components/SearchBox";
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
        <SearchBox action="/matches" label="Find a club or team" placeholder="Find a club or team, e.g. Hawks M1" defaultValue={query} />
        {chips.map((c) => (
          <Link
            key={c.key}
            href={without(c.key)}
            aria-label={`Remove filter: ${c.label}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-foreground pr-2.5 pl-4 text-sm font-medium text-background no-underline hover:bg-foreground/85 hover:no-underline"
          >
            {c.label} <X className="size-3.5" />
          </Link>
        ))}
      </div>

      {query && (
        <section aria-label="Search results" className="rounded-lg border bg-card p-5">
          {clubs!.items.length + teams!.items.length === 0 ? (
            <p className="text-muted-foreground">Nothing matches “{query}”.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {clubs!.items.map((c) => (
                <li key={c.id}>
                  <Link href={`/clubs/${c.slug}`} className="inline-flex h-9 items-center gap-2 rounded-md border px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline">
                    {c.name} <span className="text-xs text-muted-foreground">Club</span>
                  </Link>
                </li>
              ))}
              {teams!.items.map((t) => (
                <li key={t.id}>
                  <Link href={`/clubs/${t.club.slug}/${t.slug}`} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium text-foreground no-underline hover:bg-muted hover:no-underline">
                    {t.club.name} {t.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <FilterPanel summary="Filter by club, competition or venue" label="Filter results" action="/matches" active={filtered} clearHref="/matches">
        <MatchFilterFields filters={filters} />
      </FilterPanel>

      <MatchList matches={matches.items} empty={filtered ? "No results match these filters." : "No results have been published yet."} />
      <Pager cursor={matches.nextCursor} params={{ q: query, ...filters.query }} />
    </div>
  );
}
