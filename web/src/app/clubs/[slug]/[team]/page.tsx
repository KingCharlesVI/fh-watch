import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { api, apiOrNull } from "@/lib/api";
import type { ClubWithTeams, Match, Page } from "@/lib/types";

type Params = Promise<{ slug: string; team: string }>;

const loadTeam = cache(async (slug: string, teamSlug: string) => {
  const club = await apiOrNull<ClubWithTeams>(`/v1/clubs/${encodeURIComponent(slug)}`);
  const team = club?.teams.find((t) => t.slug === teamSlug);
  return club && team ? { club, team } : null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, team } = await params;
  const found = await loadTeam(slug, team);
  return { title: found ? `${found.club.name} ${found.team.name}` : "Team not found" };
}

export default async function TeamPage({ params, searchParams }: { params: Params; searchParams: Promise<{ cursor?: string }> }) {
  const { slug, team: teamSlug } = await params;
  const found = await loadTeam(slug, teamSlug);
  if (!found) notFound();
  const { club, team } = found;
  const { cursor } = await searchParams;
  const matches = await api<Page<Match>>("/v1/matches", { query: { teamId: team.id, limit: 25, cursor } });

  return (
    <div className="space-y-6">
      <PageHeader title={`${club.name} ${team.name}`} back={{ href: `/clubs/${club.slug}`, label: club.name }} />
      <MatchList matches={matches.items} empty="No matches for this team yet." />
      <Pager cursor={matches.nextCursor} params={{}} />
    </div>
  );
}
