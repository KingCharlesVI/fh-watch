import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import { ClubBadge } from "@/components/ClubBadge";
import { MatchList, matchHref } from "@/components/MatchList";
import { HeaderPanel } from "@/components/HeaderPanel";
import { SearchBox } from "@/components/SearchBox";
import { Button } from "@/components/ui/button";
import { api, cachedPublic } from "@/lib/api";
import { formatDay } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import { LANDING_URL, SITE_NAME } from "@/lib/site";
import type { Club, Items, Match, Page } from "@/lib/types";
import { cn } from "@/lib/utils";

export const metadata = { title: { absolute: `${SITE_NAME}: field hockey results` } };

const STEPS = [
  { where: "On the pitch", text: "The umpire runs the match on their watch: the clock, goals, cards and suspensions, with no signal needed." },
  { where: "On the phone", text: "Afterwards the match moves to their phone, where they check it and publish it when they're happy with it." },
  { where: "On here", text: "Results, cards and timelines for every club and team, to share with a link or a QR code, or download as a report." },
];

/** The front page: the latest result with a search, then the latest results and the clubs, then how it works. */
export default async function Home() {
  const [user, latest, clubs] = await Promise.all([
    getCurrentUser(),
    api<Page<Match>>("/v1/matches", { query: { status: "published", limit: 7 } }),
    cachedPublic<Items<Club>>("/v1/clubs"),
  ]);
  const [lead, ...rest] = latest.items;
  return (
    <div className="space-y-14 pb-4">
      <HeaderPanel label="Field hockey results" className="px-5 py-8 sm:px-10 sm:py-12">
        <div className="grid grid-cols-1 items-center gap-8 sm:gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="min-w-0">
            <p className="section-title text-sm text-primary">Field hockey results</p>
            <h1 className="mt-3 text-4xl leading-[1.02] font-extrabold text-balance sm:text-6xl">Straight from the umpire&apos;s watch.</h1>
            <p className="mt-4 max-w-md text-muted-foreground">Every score, card and goal as it was recorded on the pitch, for players, clubs and supporters.</p>
            <SearchBox action="/matches" size="lg" label="Find your club or team" placeholder="Find your club or team, e.g. Hawks M1" className="mt-7 bg-background" />
          </div>
          {lead && <LeadResult match={lead} />}
        </div>
      </HeaderPanel>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1fr_19rem]">
        <section aria-labelledby="latest" className="min-w-0 space-y-5">
          <div className="flex items-end justify-between gap-4">
            <h2 id="latest" className="section-title text-3xl">
              Latest results
            </h2>
            <Link href="/matches" className="inline-flex items-center gap-1 text-sm font-semibold">
              All results <ArrowRight className="size-4" />
            </Link>
          </div>
          <MatchList matches={lead ? rest : []} empty={lead ? "That's the only result so far." : "No results have been published yet."} />
        </section>

        <aside className="space-y-5">
          {clubs && clubs.items.length > 0 && (
            <section aria-labelledby="clubs" className="space-y-3">
              <div className="flex items-end justify-between">
                <h2 id="clubs" className="section-title text-2xl">
                  Clubs
                </h2>
                <Link href="/clubs" className="text-sm font-semibold">
                  See all
                </Link>
              </div>
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {clubs.items.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link href={`/clubs/${c.slug}`} className="group flex items-center gap-3 px-4 py-2.5 text-foreground no-underline hover:bg-muted/50 hover:no-underline">
                      <ClubBadge name={c.name} logoUrl={c.logoUrl} size="sm" className="rounded-md" />
                      <span className="min-w-0 flex-1 truncate font-semibold font-stretch-94%">{c.name}</span>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="umpires" className="rounded-lg border-2 border-foreground p-5">
            <h2 id="umpires" className="section-title text-2xl">
              {user ? `Welcome back, ${user.displayName}` : "Umpiring this weekend?"}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">
              {user
                ? "Your matches, drafts waiting to be published and downloads are on your dashboard."
                : "Run the match on your Wear OS watch or Apple Watch, check it on your phone, and publish it here. Free, no approval needed."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild>
                <Link href={user ? "/dashboard" : "/register"}>{user ? "Your dashboard" : "Register as an umpire"}</Link>
              </Button>
              <Button asChild variant="ghost">
                <a href={LANDING_URL}>Get the apps</a>
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <section aria-labelledby="how" className="space-y-5">
        <h2 id="how" className="section-title flex items-center gap-3 text-3xl after:h-px after:flex-1 after:bg-border">
          How it works
        </h2>
        <ol className="grid divide-y rounded-lg border bg-card md:grid-cols-3 md:divide-x md:divide-y-0">
          {STEPS.map(({ where, text }, i) => (
            <li key={where} className="flex gap-4 p-5 sm:p-6">
              <span aria-hidden className="font-score text-5xl text-primary">
                {i + 1}
              </span>
              <span>
                <span className="section-title block text-xl">{where}</span>
                <span className="mt-2 block text-sm text-muted-foreground">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

/** The newest result, as a scoreboard. */
function LeadResult({ match: m }: { match: Match }) {
  const shootout = m.home.shootout !== null && m.away.shootout !== null;
  const homeWon = m.home.score > m.away.score || (m.home.score === m.away.score && shootout && m.home.shootout! > m.away.shootout!);
  const awayWon = m.away.score > m.home.score || (m.home.score === m.away.score && shootout && m.away.shootout! > m.home.shootout!);
  const row = (t: Match["home"], won: boolean) => (
    <span className="flex items-center gap-4">
      <span className={cn("min-w-0 flex-1 text-lg leading-tight font-bold font-stretch-92% sm:text-xl", !won && "text-muted-foreground")}>{t.name}</span>
      {shootout && <span className="font-mono text-xs text-muted-foreground">({t.shootout})</span>}
      <span className={cn("font-score w-14 text-right text-6xl", won ? "text-primary" : "text-muted-foreground")}>{t.score}</span>
    </span>
  );
  return (
    <Link
      href={matchHref(m)}
      className="group block rounded-lg border bg-background p-5 text-foreground no-underline transition-colors hover:border-foreground/25 hover:no-underline sm:p-6"
    >
      <span className="flex items-center justify-between gap-3 text-xs">
        <span className="section-title text-sm text-muted-foreground">Latest result</span>
        <span className="section-title -rotate-2 rounded-sm bg-foreground px-2 py-0.5 text-xs text-background">Full time</span>
      </span>
      <span className="mt-4 flex flex-col gap-3">
        {row(m.home, homeWon)}
        {row(m.away, awayWon)}
      </span>
      <span className="mt-5 flex items-center justify-between gap-3 border-t pt-4 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">{[formatDay(m.playedAt), m.competition].filter(Boolean).join(" · ")}</span>
        <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-foreground group-hover:text-primary">
          Match <ArrowRight className="size-4" />
        </span>
      </span>
    </Link>
  );
}
