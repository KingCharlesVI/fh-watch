import { Check, FileText, Flag, Globe, Hand, Smartphone, Timer, Vibrate, Watch, WifiOff } from "lucide-react";
import { ApkInstructions, Button, Container, GitHubIcon, Logo, PhoneFrame, RequestAccess, Section, StoreButton, WatchFrame } from "@/components/parts";
import { CURRENT_STAGE, DOWNLOADS, GITHUB_URL, ROADMAP, SITE, type RoadmapStep } from "@/content";

const FEATURES = [
  { icon: Timer, title: "A match clock you can trust", text: "Quarters or halves, any length, with breaks. Counts up or down, and keeps perfect time through stoppages, a flat screen or a restart." },
  { icon: Hand, title: "Start and stop with a button", text: "Press the watch's side button to stop and restart the clock, without looking. Works on Galaxy Watch 4 and later." },
  { icon: Flag, title: "Cards and suspensions", text: "Green, yellow and red cards with the player's number. Suspension timers pause when the clock does, and buzz when time's served." },
  { icon: Vibrate, title: "Feel what's happening", text: "Distinct vibrations for one minute left, time up, a suspension ending and the end of a break." },
  { icon: WifiOff, title: "No signal needed", text: "Everything works offline at the ground. The match moves to your phone by itself when the watch is next in reach." },
  { icon: FileText, title: "The paperwork, done", text: "Goals, corners, strokes and shootouts become a one-page match report, a spreadsheet or a backup, straight from your phone." },
];

export default function Home() {
  const current = DOWNLOADS.find((d) => d.stage === CURRENT_STAGE)!;
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <Container className="flex h-14 items-center justify-between">
          <a href="#" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={28} /> {SITE.name}
          </a>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <a href="#features" className="hidden hover:text-foreground sm:inline">
              Features
            </a>
            <a href="#roadmap" className="hidden hover:text-foreground sm:inline">
              Roadmap
            </a>
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
            </a>
            <a href={GITHUB_URL} className="hover:text-foreground" aria-label="GitHub repository" title="GitHub">
              <GitHubIcon />
            </a>
            <a href="#download" className="font-medium text-foreground hover:text-primary">
              Download
            </a>
          </nav>
        </Container>
      </header>

      <main>
        {/* Hero */}
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" /> {current.title} testing now on Android and Wear OS
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Umpire from your wrist. The match writes itself.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              {SITE.name} runs the clock, cards and suspensions on your watch, then turns every match into a ready-made record on your phone.
              Next, published results for clubs.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="#download">Join the {current.title.toLowerCase()}</Button>
              <Button href="#roadmap" variant="outline">
                See the roadmap
              </Button>
            </div>
          </div>
          <div className="flex items-end justify-center gap-6">
            <WatchFrame src="/screens/watch-match.png" alt="The timing page on a Wear OS watch: period, clock, score and a Stop button" />
            <div className="hidden sm:block">
              <PhoneFrame src="/screens/phone-match.png" alt="A match on the phone app" />
            </div>
          </div>
        </Container>

        <Section id="features" eyebrow="On the pitch" title="Built for the umpire, not the scorer" intro="Everything you need during a match, on the watch you already wear. Nothing you don't.">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border bg-card p-5">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section eyebrow="How it works" title="Watch, phone, website">
          <ol className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Watch, title: "Umpire on the watch", text: "Start the match, record goals, cards and corners in a couple of taps. The clock never stops being accurate." },
              { icon: Smartphone, title: "Check it on your phone", text: "The finished match arrives on your phone. Fix any mistakes, add the umpires, and export the report." },
              { icon: Globe, title: "Publish it", text: "Coming in the beta: publish the result for players and clubs, and share it by link or QR code." },
            ].map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative rounded-xl border bg-card p-5">
                <span className="absolute top-5 right-5 text-sm text-muted-foreground tabular-nums">0{i + 1}</span>
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-medium">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section id="roadmap" eyebrow="Roadmap" title="Where it's going" intro="Tested with umpires at every step, from a small alpha to a public release.">
          <ol className="grid gap-6 md:grid-cols-4">
            {ROADMAP.map((step) => (
              <RoadmapCard key={step.title} step={step} />
            ))}
          </ol>
        </Section>

        <Section id="download" eyebrow="Download" title="Get the app" intro="Each stage opens to more people. Join now, or check back as the next one opens.">
          <div className="grid gap-6 md:grid-cols-3">
            {DOWNLOADS.map((d) => {
              const isCurrent = d.stage === CURRENT_STAGE;
              return (
                <div key={d.stage} className={`flex flex-col rounded-xl border bg-card p-5 ${isCurrent ? "ring-2 ring-primary" : ""}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{d.title}</h3>
                    {isCurrent && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">Open now</span>}
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{d.summary}</p>
                  <p className="mt-3 text-sm">
                    <span className="font-medium">Who: </span>
                    <span className="text-muted-foreground">{d.audience}</span>
                  </p>
                  <div className="mt-auto flex flex-col gap-2 pt-5">
                    {d.links.map((link) => (
                      <StoreButton key={link.label} link={link} />
                    ))}
                    {d.links.some((l) => l.store === "apk" && (l.href || l.latest)) && <ApkInstructions />}
                    {isCurrent && <RequestAccess stage={d.title.toLowerCase()} />}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Needs a Wear OS 3 watch or later (Samsung Galaxy Watch 4 and newer, Google Pixel Watch) with an Android phone. Apple Watch arrives in the beta.
          </p>
        </Section>
      </main>

      <footer className="border-t py-10">
        <Container className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Logo size={20} /> {SITE.name}
          </span>
          <nav className="flex flex-wrap gap-5">
            {SITE.appUrl && (
              <a href={SITE.appUrl} className="hover:text-foreground">
                Website
              </a>
            )}
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
            </a>
            <a href={GITHUB_URL} className="flex items-center gap-1.5 hover:text-foreground">
              <GitHubIcon size={15} /> GitHub
            </a>
            <a href="/privacy" className="hover:text-foreground">
              Privacy
            </a>
            {SITE.contactEmail && (
              <a href={`mailto:${SITE.contactEmail}`} className="hover:text-foreground">
                Contact
              </a>
            )}
          </nav>
        </Container>
      </footer>
    </>
  );
}

const STATUS = {
  done: { label: "Done", className: "bg-muted text-foreground" },
  now: { label: "Now", className: "bg-primary text-primary-foreground" },
  next: { label: "Next", className: "border text-foreground" },
  later: { label: "Later", className: "border text-muted-foreground" },
};

function RoadmapCard({ step }: { step: RoadmapStep }) {
  const status = STATUS[step.status];
  return (
    <li className={`rounded-xl border bg-card p-5 ${step.status === "now" ? "ring-2 ring-primary" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{step.title}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {step.items.map((item) => (
          <li key={item} className="flex gap-2 text-sm text-muted-foreground">
            <Check className={`mt-0.5 size-4 shrink-0 ${step.status === "done" ? "text-primary" : "text-muted-foreground/40"}`} />
            {item}
          </li>
        ))}
      </ul>
    </li>
  );
}
