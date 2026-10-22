import { ArrowRight, ChevronRight, CloudUpload, Search, Share2, Watch } from "lucide-react";
import Link from "next/link";
import { ClubBadge } from "@/components/ClubBadge";
import { MatchList } from "@/components/MatchList";
import { Button } from "@/components/ui/button";
import { api, cachedPublic } from "@/lib/api";
import { getCurrentUser } from "@/lib/session";
import { LANDING_URL, SITE_NAME } from "@/lib/site";
import type { Club, Items, Match, Page } from "@/lib/types";

export const metadata = { title: { absolute: `${SITE_NAME}: field hockey results` } };

const STEPS = [
  {
    icon: Watch,
    title: "Recorded on the pitch",
    text: "The umpire runs the match on their watch: the clock, goals, cards and suspensions, with no signal needed.",
  },
  {
    icon: CloudUpload,
    title: "Checked and published",
    text: "Afterwards the match moves to their phone, where they check it and upload it. It's published when they're happy with it.",
  },
  {
    icon: Share2,
    title: "Followed by clubs",
    text: "Results, cards and timelines for every club and team, to share with a link or a QR code, or download as a report.",
  },
];

/** The front page: a search, the latest results and the clubs, then how it works. */
export default async function Home() {
  const [user, latest, clubs] = await Promise.all([
    getCurrentUser(),
    api<Page<Match>>("/v1/matches", { query: { status: "published", limit: 6 } }),
    cachedPublic<Items<Club>>("/v1/clubs"),
  ]);
  return (
    <div className="space-y-16 pb-4">
      <section className="mx-auto max-w-3xl pt-4 text-center sm:pt-8">
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance sm:text-6xl">Every result, straight from the umpire&apos;s watch</h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
          Scores, cards and goals as they happened on the pitch, for players, clubs and supporters.
        </p>
        <form
          role="search"
          action="/matches"
          className="mx-auto mt-8 flex h-14 max-w-xl items-center gap-2 rounded-full border bg-card pr-2 pl-5 shadow-lg shadow-black/5 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30"
        >
          <Search aria-hidden className="size-5 shrink-0 text-muted-foreground" />
          <label htmlFor="home-q" className="sr-only">
            Find your club or team
          </label>
          <input
            id="home-q"
            name="q"
            type="search"
            placeholder="Find your club or team, e.g. Hawks M1"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
          />
          <Button type="submit" className="h-10 px-5">
            Search
          </Button>
        </form>
      </section>

      <div className="grid items-start gap-8 lg:grid-cols-[1fr_20rem]">
        <section aria-labelledby="latest" className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 id="latest" className="text-2xl font-bold tracking-tight">
              Latest results
            </h2>
            <Link href="/matches" className="inline-flex items-center gap-1 text-sm font-semibold">
              All results <ArrowRight className="size-4" />
            </Link>
          </div>
          <MatchList matches={latest.items} empty="No results have been published yet." />
        </section>

        <aside className="space-y-4">
          {clubs && clubs.items.length > 0 && (
            <section aria-labelledby="clubs" className="rounded-2xl border bg-card p-5">
              <div className="mb-2 flex items-center justify-between">
                <h2 id="clubs" className="text-lg font-bold tracking-tight">
                  Clubs
                </h2>
                <Link href="/clubs" className="text-sm font-semibold">
                  See all
                </Link>
              </div>
              <ul>
                {clubs.items.slice(0, 6).map((c) => (
                  <li key={c.id}>
                    <Link href={`/clubs/${c.slug}`} className="group -mx-2 flex items-center gap-3 rounded-xl px-2 py-2 text-foreground no-underline hover:bg-muted hover:no-underline">
                      <ClubBadge name={c.name} logoUrl={c.logoUrl} size="sm" className="rounded-full" />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                      <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section aria-labelledby="umpires" className="rounded-2xl bg-primary p-5 text-primary-foreground">
            <h2 id="umpires" className="text-xl font-bold tracking-tight">
              {user ? `Welcome back, ${user.displayName}` : "Umpiring this weekend?"}
            </h2>
            <p className="mt-2 text-sm opacity-90">
              {user
                ? "Your matches, drafts waiting to be published and downloads are on your dashboard."
                : "Run the match on your Wear OS watch or Apple Watch, check it on your phone, and publish it here. Free, no approval needed."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
                <Link href={user ? "/dashboard" : "/register"}>{user ? "Your dashboard" : "Register as an umpire"}</Link>
              </Button>
              <Button asChild variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground">
                <a href={LANDING_URL}>Get the apps</a>
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <section aria-labelledby="how" className="space-y-5">
        <h2 id="how" className="text-2xl font-bold tracking-tight">
          How it works
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-2xl border bg-card p-5">
              <span className="flex items-center gap-3">
                <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary">
                  <Icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-muted-foreground">Step {i + 1}</span>
              </span>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
