import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ClubBadge } from "@/components/ClubBadge";
import { MatchList, Pager, matchHref } from "@/components/MatchList";
import { HeaderPanel } from "@/components/HeaderPanel";
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
  D: "bg-muted-foreground text-background",
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
        <HeaderPanel className="flex flex-wrap items-center gap-5 p-6 sm:p-9">
          <ClubBadge name={club.name} logoUrl={club.logoUrl} size="lg" className="rounded-lg ring-1 ring-border sm:size-20 sm:text-3xl" />
          <div className="min-w-0 flex-1">
            <p className="section-title text-sm">
              <Link href={`/clubs/${club.slug}`} className="text-primary">
                {club.name}
              </Link>
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-5xl">
              {club.name} {team.name}
            </h1>
          </div>
          {record && record.form.length > 0 && (
            <div className="space-y-1.5">
              <div className="section-title text-sm text-muted-foreground">Form</div>
              <ol className="flex gap-1.5" aria-label="Last results, newest first">
                {record.form.map(({ outcome, match: m }) => (
                  <li key={m.id}>
                    <Link
                      href={matchHref(m)}
                      title={`${OUTCOME_NAME[outcome]}: ${m.home.name} ${scoreline(m.home, m.away)} ${m.away.name}, ${formatDate(m.playedAt)}`}
                      className={cn("inline-flex size-8 items-center justify-center rounded-sm text-xs font-bold no-underline hover:no-underline", OUTCOME_STYLE[outcome])}
                    >
                      {outcome}
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </HeaderPanel>
      </div>

      {record && record.played > 0 && (
        <section aria-label="Record" className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-6">
          {[
            ["Played", record.played],
            ["Won", record.won],
            ["Drawn", record.drawn],
            ["Lost", record.lost],
            ["Goals for", record.goalsFor],
            ["Goals against", record.goalsAgainst],
          ].map(([label, value]) => (
            <div key={label} className="bg-card px-4 py-4 text-center">
              <div className="font-score text-4xl">{value}</div>
              <div className="text-xs font-medium text-muted-foreground">{label}</div>
            </div>
          ))}
          {matches.nextCursor && <p className="col-span-full bg-card px-4 py-2 text-center text-xs text-muted-foreground">From the latest {record.played} matches.</p>}
        </section>
      )}

      <section aria-labelledby="results" className="space-y-3">
        <h2 id="results" className="section-title text-2xl">
          Results
        </h2>
        <MatchList matches={matches.items} empty="No matches for this team yet." />
        <Pager cursor={matches.nextCursor} params={{}} />
      </section>
    </div>
  );
}
