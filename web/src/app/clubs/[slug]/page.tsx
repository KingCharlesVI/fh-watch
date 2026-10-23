import { canEditTeams } from "@fh/shared";
import { ChevronLeft, Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClubBadge } from "@/components/ClubBadge";
import { MatchList, Pager } from "@/components/MatchList";
import { PitchPanel } from "@/components/PitchPanel";
import { Button } from "@/components/ui/button";
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
        <PitchPanel className="flex flex-wrap items-center gap-5 p-6 sm:p-9 [&>div]:flex [&>div]:w-full [&>div]:flex-wrap [&>div]:items-center [&>div]:gap-5">
          <ClubBadge name={club.name} logoUrl={club.logoUrl} size="lg" className="rounded-lg ring-2 ring-white/80 sm:size-20 sm:text-3xl" />
          <div className="min-w-0 flex-1">
            <p className="section-title text-sm text-hivis">Club</p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-5xl">{club.name}</h1>
            <p className="mt-1 text-pitch-foreground/75">
              {teams.length === 1 ? "1 team" : `${teams.length} teams`}
            </p>
          </div>
          {user && canEditTeams(user, club.id) && (
            <Button variant="chalk" asChild>
              <Link href={`/admin/clubs/${club.id}`}>
                <Settings /> Manage club
              </Link>
            </Button>
          )}
        </PitchPanel>
      </div>

      <section aria-labelledby="teams" className="space-y-3">
        <h2 id="teams" className="section-title text-2xl">
          Teams
        </h2>
        {teams.length === 0 ? (
          <p className="text-muted-foreground">No teams yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {teams.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/clubs/${club.slug}/${t.slug}`}
                  className="inline-flex h-10 items-center rounded-md border bg-card px-5 font-semibold text-foreground no-underline transition-colors hover:border-foreground/20 hover:bg-muted hover:no-underline"
                >
                  {t.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="results" className="space-y-3">
        <h2 id="results" className="section-title text-2xl">
          Results
        </h2>
        <MatchList matches={matches.items} empty="No matches involving this club yet." />
        <Pager cursor={matches.nextCursor} params={{}} />
      </section>
    </div>
  );
}
