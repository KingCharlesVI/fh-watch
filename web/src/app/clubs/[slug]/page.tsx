import { canEditTeams } from "@fh/shared";
import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MatchList, Pager } from "@/components/MatchList";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { api, apiOrNull } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import type { ClubWithTeams, Match, Page } from "@/lib/types";

type Params = Promise<{ slug: string }>;
const loadClub = cache((slug: string) => apiOrNull<ClubWithTeams>(`/v1/clubs/${encodeURIComponent(slug)}`));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const club = await loadClub((await params).slug);
  return { title: club?.name ?? "Club not found" };
}

export default async function ClubPage({ params, searchParams }: { params: Params; searchParams: Promise<{ cursor?: string }> }) {
  const club = await loadClub((await params).slug);
  if (!club) notFound();
  const { cursor } = await searchParams;
  const [matches, user] = await Promise.all([
    api<Page<Match>>("/v1/matches", { query: { clubId: club.id, limit: 25, cursor } }),
    getCurrentUser(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={club.name}
        back={{ href: "/clubs", label: "Clubs" }}
        actions={
          user &&
          canEditTeams(user, club.id) && (
            <Button variant="outline" asChild>
              <Link href={`/admin/clubs/${club.id}`}>
                <Settings /> Manage club
              </Link>
            </Button>
          )
        }
      />
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Teams</h2>
        {club.teams.length === 0 ? (
          <p className="text-muted-foreground">No teams yet.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {club.teams.map((t) => (
              <Button key={t.id} variant="outline" asChild>
                <Link href={`/clubs/${club.slug}/${t.slug}`}>{t.name}</Link>
              </Button>
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold">Matches</h2>
        <MatchList matches={matches.items} empty="No matches involving this club yet." />
        <Pager cursor={matches.nextCursor} params={{}} />
      </section>
    </div>
  );
}
