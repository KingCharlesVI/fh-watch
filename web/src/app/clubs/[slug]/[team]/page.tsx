import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClubBadge } from "@/components/ClubBadge";
import { MatchList, Pager, matchHref } from "@/components/MatchList";
import { Card, CardContent } from "@/components/ui/card";
import { api, apiOrNull } from "@/lib/api";
import { formatDate, scoreline } from "@/lib/format";
import { type Outcome, teamRecord } from "@/lib/record";
import type { ClubWithTeams, Match, Page } from "@/lib/types";
import { cn } from "@/lib/utils";

type Params = Promise<{ slug: string; team: string }>;

const loadTeam = cache(async (slug: string, teamSlug: string) => {
  const club = await apiOrNull<ClubWithTeams>(`/v1/clubs/${encodeURIComponent(slug)}`);
  const team = club?.teams.find((t) => t.slug === teamSlug);
  return club && team ? { club, team } : null;
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug, team } = await params;
  const found = await loadTeam(slug, team);
  if (!found) return { title: "Team not found" };
  const name = `${found.club.name} ${found.team.name}`;
  return { title: name, description: `${name}: results and form.` };
}

const OUTCOME_STYLE: Record<Outcome, string> = {
  W: "bg-emerald-600 text-white",
  D: "bg-muted-foreground/70 text-white",
  L: "bg-red-600 text-white",
};
const OUTCOME_NAME: Record<Outcome, string> = { W: "Won", D: "Drew", L: "Lost" };

export default async function TeamPage({ params, searchParams }: { params: Params; searchParams: Promise<{ cursor?: string }> }) {
  const { slug, team: teamSlug } = await params;
  const found = await loadTeam(slug, teamSlug);
  if (!found) notFound();
  const { club, team } = found;
  const { cursor } = await searchParams;
  const matches = await api<Page<Match>>("/v1/matches", { query: { teamId: team.id, limit: 25, cursor } });
  // The record only on the first page: it counts the matches shown there.
  const record = cursor ? null : teamRecord(team.id, matches.items);

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <Link href={`/clubs/${club.slug}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground no-underline hover:text-foreground">
          <ChevronLeft className="size-4" /> {club.name}
        </Link>
        <Card className="flex-row flex-wrap items-center gap-4 px-5 py-5">
          <ClubBadge name={club.name} logoUrl={club.logoUrl} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
              {club.name} {team.name}
            </h1>
            <p className="text-muted-foreground">
              <Link href={`/clubs/${club.slug}`}>{club.name}</Link>
            </p>
          </div>
          {record && record.form.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Form</div>
              <ol className="flex gap-1.5" aria-label="Last results, newest first">
                {record.form.map(({ outcome, match: m }) => (
                  <li key={m.id}>
                    <Link
                      href={matchHref(m)}
                      title={`${OUTCOME_NAME[outcome]}: ${m.home.name} ${scoreline(m.home, m.away)} ${m.away.name}, ${formatDate(m.playedAt)}`}
                      className={cn("inline-flex size-7 items-center justify-center rounded-md text-xs font-bold no-underline hover:no-underline", OUTCOME_STYLE[outcome])}
                    >
                      {outcome}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Card>
      </div>

      {record && record.played > 0 && (
        <section aria-label="Record" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {[
            ["Played", record.played],
            ["Won", record.won],
            ["Drawn", record.drawn],
            ["Lost", record.lost],
            ["Goals for", record.goalsFor],
            ["Goals against", record.goalsAgainst],
          ].map(([label, value]) => (
            <Card key={label} className="py-0">
              <CardContent className="px-4 py-3">
                <div className="font-heading text-2xl font-bold tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </CardContent>
            </Card>
          ))}
          {matches.nextCursor && <p className="col-span-full text-xs text-muted-foreground">From the latest {record.played} matches.</p>}
        </section>
      )}

      <section aria-labelledby="results" className="space-y-3">
        <h2 id="results" className="font-heading text-lg font-semibold">
          Results
        </h2>
        <MatchList matches={matches.items} empty="No matches for this team yet." />
        <Pager cursor={matches.nextCursor} params={{}} />
      </section>
    </div>
  );
}
