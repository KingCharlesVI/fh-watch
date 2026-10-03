import { Search } from "lucide-react";
import Link from "next/link";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Club, Items, Match, Page, TeamWithClub } from "@/lib/types";

export const metadata = { title: "Results" };

/** Every published result, newest first, with a search for clubs and teams. */
export default async function Matches({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const { q, cursor } = await searchParams;
  const query = q?.trim();
  const [matches, teams, clubs] = await Promise.all([
    api<Page<Match>>("/v1/matches", { query: { status: "published", limit: 25, cursor } }),
    query ? api<Items<TeamWithClub>>("/v1/teams", { query: { q: query } }) : null,
    query ? api<Items<Club>>("/v1/clubs", { query: { q: query } }) : null,
  ]);

  return (
    <div className="space-y-6">
      <PageHeader title="Results" description="Every published match, newest first." />

      <form role="search" action="/matches" className="flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">
          Find a club or team
        </label>
        <Input id="q" name="q" type="search" placeholder="Find a club or team, e.g. Hawks M1" defaultValue={query} />
        <Button type="submit">
          <Search /> Search
        </Button>
      </form>

      {query && (
        <Card aria-label="Search results">
          <CardContent>
            {clubs!.items.length + teams!.items.length === 0 ? (
              <p className="text-muted-foreground">Nothing matches “{query}”.</p>
            ) : (
              <ul className="space-y-1">
                {clubs!.items.map((c) => (
                  <li key={c.id}>
                    <Link href={`/clubs/${c.slug}`}>{c.name}</Link> <span className="text-sm text-muted-foreground">club</span>
                  </li>
                ))}
                {teams!.items.map((t) => (
                  <li key={t.id}>
                    <Link href={`/clubs/${t.club.slug}/${t.slug}`}>
                      {t.club.name} {t.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <MatchList matches={matches.items} empty="No results have been published yet." />
      <Pager cursor={matches.nextCursor} params={{ q: query }} />
    </div>
  );
}
