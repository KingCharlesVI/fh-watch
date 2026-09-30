import { ArrowRight, BookOpen, CloudUpload, Search, Share2, Smartphone, Watch } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getCurrentUser } from "@/lib/session";
import { DOCS_URL, LANDING_URL } from "@/lib/site";

const STEPS = [
  {
    icon: Watch,
    title: "Recorded on the pitch",
    text: "The umpire runs the match on their watch: the clock, goals, cards and suspensions, with no signal needed.",
  },
  {
    icon: CloudUpload,
    title: "Checked and published",
    text: "Afterwards the match moves to their phone, where they check it and upload it. It's published once they're happy, or two hours after the final whistle.",
  },
  {
    icon: Share2,
    title: "Followed by clubs",
    text: "Results, cards and timelines for every club and team, to share with a link or a QR code, or download as a report.",
  },
];

/** The front page: what the site is and where to go. The results themselves are on /matches. */
export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="space-y-16 py-6 sm:py-10">
      <section className="max-w-2xl space-y-6">
        <p className="text-sm font-medium text-primary">Field hockey results</p>
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Results straight from the umpire&apos;s watch</h1>
        <p className="text-lg text-muted-foreground">
          Every score, card and goal as the umpire recorded it on the pitch, published for players, clubs and supporters.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/matches">
              Browse results <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/clubs">Find a club</Link>
          </Button>
        </div>
        <form role="search" action="/matches" className="flex max-w-lg gap-2 pt-2">
          <label htmlFor="home-q" className="sr-only">
            Find a club or team
          </label>
          <Input id="home-q" name="q" type="search" placeholder="Find a club or team, e.g. Hawks M1" />
          <Button type="submit" variant="secondary">
            <Search /> Search
          </Button>
        </form>
      </section>

      <section aria-labelledby="how" className="space-y-6">
        <h2 id="how" className="font-heading text-2xl font-semibold tracking-tight">
          How it works
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }) => (
            <Card key={title}>
              <CardContent className="space-y-3">
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted-foreground">{text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="umpires">
        <Card>
          <CardContent className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
            <div className="space-y-2">
              <h2 id="umpires" className="font-heading text-2xl font-semibold tracking-tight">
                {user ? `Welcome back, ${user.displayName}` : "Umpiring?"}
              </h2>
              <p className="max-w-xl text-muted-foreground">
                {user
                  ? "Your matches, drafts waiting to be published and downloads are on your dashboard."
                  : "Record your matches on a Wear OS watch or Apple Watch, and publish them here. Registration is free and needs no approval."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user ? (
                <Button asChild>
                  <Link href="/dashboard">Your dashboard</Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/register">Register as an umpire</Link>
                </Button>
              )}
              <Button variant="outline" asChild>
                <a href={LANDING_URL}>
                  <Smartphone /> Get the apps
                </a>
              </Button>
              <Button variant="ghost" asChild>
                <a href={DOCS_URL}>
                  <BookOpen /> Docs
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
