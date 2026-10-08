import { Search } from "lucide-react";
import Link from "next/link";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Club, Competition, Items, Match, Page, TeamWithClub, Venue } from "@/lib/types";

export const metadata = { title: "Search" };

/** One search for everything: clubs, teams, competitions, venues and matches. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const { q: raw, cursor } = await searchParams;
  const q = raw?.trim().slice(0, 120);
  const results = q
    ? await Promise.all([
        // A later page of matches only needs the matches.
        cursor ? null : api<Items<Club>>("/v1/clubs", { query: { q } }),
        cursor ? null : api<Items<TeamWithClub>>("/v1/teams", { query: { q } }),
        cursor ? null : api<Items<Competition>>("/v1/competitions", { query: { q } }),
        cursor ? null : api<Items<Venue>>("/v1/venues", { query: { q } }),
        api<Page<Match>>("/v1/matches", { query: { q, cursor, limit: 25 } }),
      ])
    : null;
  const [clubs, teams, competitions, venues, matches] = results ?? [];
  const found = results && [clubs, teams, competitions, venues, matches].some((r) => r && r.items.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Search" description="Clubs, teams, competitions, venues and matches." />

      <form role="search" action="/search" className="flex max-w-lg gap-2">
        <label htmlFor="search-page-q" className="sr-only">
          Search
        </label>
        <Input id="search-page-q" name="q" type="search" placeholder="e.g. Hawks M1, Division 2, Banbury Road" defaultValue={q} autoFocus={!q} />
        <Button type="submit">
          <Search /> Search
        </Button>
      </form>

      {q && !found && <p className="text-muted-foreground">Nothing matches “{q}”.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <ResultCard title="Clubs" items={clubs?.items.map((c) => ({ key: c.id, href: `/clubs/${c.slug}`, label: c.name }))} />
        <ResultCard
          title="Teams"
          items={teams?.items.map((t) => ({ key: t.id, href: `/clubs/${t.club.slug}/${t.slug}`, label: `${t.club.name} ${t.name}` }))}
        />
        <ResultCard
          title="Competitions"
          items={competitions?.items.map((c) => ({ key: c.id, href: `/matches?competition=${encodeURIComponent(c.name)}`, label: c.name }))}
        />
        <ResultCard
          title="Venues"
          items={venues?.items.map((v) => ({ key: v.id, href: `/matches?venue=${encodeURIComponent(v.name)}`, label: v.name }))}
        />
      </div>

      {matches && matches.items.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Matches</h2>
          <MatchList matches={matches.items} />
          <Pager cursor={matches.nextCursor} params={{ q }} />
        </section>
      )}
    </div>
  );
}

/** A card of links, left out when there's nothing in it. */
function ResultCard({ title, items }: { title: string; items?: { key: string; href: string; label: string }[] }) {
  if (!items?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1">
          {items.map((i) => (
            <li key={i.key}>
              <Link href={i.href}>{i.label}</Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
