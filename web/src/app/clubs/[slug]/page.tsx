import { canEditTeams } from "@fh/shared";
import { ChevronLeft, ChevronRight, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClubBadge } from "@/components/ClubBadge";
import { MatchList, Pager } from "@/components/MatchList";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, apiOrNull } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import type { ClubWithTeams, Match, Page } from "@/lib/types";

type Params = Promise<{ slug: string }>;
const loadClub = cache((slug: string) => apiOrNull<ClubWithTeams>(`/v1/clubs/${encodeURIComponent(slug)}`));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const club = await loadClub((await params).slug);
  return club ? { title: club.name, description: `${club.name}: teams and results.` } : { title: "Club not found" };
}

export default async function ClubPage({ params, searchParams }: { params: Params; searchParams: Promise<{ cursor?: string }> }) {
  const club = await loadClub((await params).slug);
  if (!club) notFound();
  const { cursor } = await searchParams;
  const [matches, user] = await Promise.all([
    api<Page<Match>>("/v1/matches", { query: { clubId: club.id, limit: 25, cursor } }),
    getCurrentUser(),
  ]);
  const teams = [...club.teams].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }));

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href="/clubs" className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground">
          <ChevronLeft className="size-4" /> Clubs
        </Link>
        <Card className="flex-row flex-wrap items-center gap-4 px-5 py-5">
          <ClubBadge name={club.name} logoUrl={club.logoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">{club.name}</h1>
            <p className="text-muted-foreground">
              {teams.length === 1 ? "1 team" : `${teams.length} teams`}
            </p>
          </div>
          {user && canEditTeams(user, club.id) && (
            <Button variant="outline" asChild>
              <Link href={`/admin/clubs/${club.id}`}>
                <Settings /> Manage club
              </Link>
            </Button>
          )}
        </Card>
      </div>

      <section aria-labelledby="teams" className="space-y-3">
        <h2 id="teams" className="font-heading text-lg font-semibold">
          Teams
        </h2>
        {teams.length === 0 ? (
          <p className="text-muted-foreground">No teams yet.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {teams.map((t) => (
              <li key={t.id}>
                <Link href={`/clubs/${club.slug}/${t.slug}`} className="group block no-underline hover:no-underline">
                  <Card className="flex-row items-center justify-between px-4 py-3 transition-colors group-hover:bg-muted/60">
                    <span className="font-medium text-foreground">{t.name}</span>
                    <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="results" className="space-y-3">
        <h2 id="results" className="font-heading text-lg font-semibold">
          Results
        </h2>
        <MatchList matches={matches.items} empty="No matches involving this club yet." />
        <Pager cursor={matches.nextCursor} params={{}} />
      </section>
    </div>
  );
}
