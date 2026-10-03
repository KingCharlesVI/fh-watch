import { ArrowUpRight, Check, FileText, Flag, Globe, Hand, LifeBuoy, Smartphone, Timer, Vibrate, Watch, WifiOff } from "lucide-react";
import { AccessRequestForm } from "@/components/AccessRequestForm";
import {
  ApkInstructions,
  Button,
  Container,
  CtaBand,
  FaqList,
  GitHubIcon,
  Logo,
  PhoneFrame,
  RequestAccess,
  Section,
  StoreButton,
  Stepper,
  Testimonials,
  WatchFrame,
} from "@/components/parts";
import {
  CURRENT_STAGE,
  DOWNLOADS,
  FAQS,
  GITHUB_URL,
  BUG_REPORT_URL,
  FEATURE_REQUEST_URL,
  PROJECT_BOARD_URL,
  SITE,
  stageStatus,
} from "@/content";

const FEATURES = [
  { icon: Timer, title: "A match clock you can trust", text: "Quarters or halves, any length, with breaks. Counts up or down, and keeps perfect time through stoppages, a flat screen or a restart." },
  { icon: Hand, title: "Start and stop with a button", text: "Press the watch's side button to stop and restart the clock, without looking. Works on Galaxy Watch 4 and later." },
  { icon: Flag, title: "Cards and suspensions", text: "Green, yellow and red cards with the player's number. Suspension timers pause when the clock does, and buzz when time's served." },
  { icon: Vibrate, title: "Feel what's happening", text: "Distinct vibrations for one minute left, time up, a suspension ending and the end of a break." },
  { icon: WifiOff, title: "No signal needed", text: "Everything works offline at the ground. The match moves to your phone by itself when the watch is next in reach." },
  { icon: FileText, title: "The paperwork, done", text: "Goals, corners, strokes and shootouts become a one-page match report, a spreadsheet or a backup, straight from your phone." },
];

/** The questions and answers again, so search engines can show them. */
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export default function Home() {
  const current = DOWNLOADS.find((d) => d.stage === CURRENT_STAGE)!;
  // Finished stages are history: the stepper tells that story, so the cards don't.
  const open = DOWNLOADS.filter((d) => stageStatus(d.stage) !== "done");
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
            <a href="#progress" className="hidden hover:text-foreground sm:inline">
              Progress
            </a>
            <a href="#faq" className="hidden hover:text-foreground sm:inline">
              FAQ
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
        {/* Hero: the headline, what it does, the way in, and the real thing on a wrist. */}
        <Container className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border bg-primary-soft px-3 py-1 text-xs font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" /> {current.title} testing now
            </span>
            <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">Umpire from your wrist. The match writes itself.</h1>
            <p className="mt-5 max-w-xl text-lg text-muted-foreground">
              {SITE.name} runs the clock, cards and suspensions on your watch, then turns every match into a ready-made record on your phone — and a
              published result for the clubs who played.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="#download">Get the {current.title.toLowerCase()}</Button>
              <Button href="#progress" variant="outline">
                See where it&apos;s up to
              </Button>
            </div>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
              {["Works with no signal", "No ads, no tracking", "Free while in testing"].map((claim) => (
                <li key={claim} className="flex items-center gap-1.5">
                  <Check className="size-4 text-primary" /> {claim}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-end justify-center gap-6">
            <WatchFrame src="/screens/watch-match.png" alt="The timing page on a Wear OS watch: period, clock, score and a Stop button" />
            <div className="hidden sm:block">
              <PhoneFrame src="/screens/phone-match.png" alt="A match on the phone app" />
            </div>
          </div>
        </Container>

        <Section
          id="progress"
          eyebrow="Progress"
          title="Where it's up to"
          intro="Three stages, each opening to more people. Tested with umpires on real matches at every one."
        >
          <Stepper steps={DOWNLOADS.map((d) => ({ title: d.title, detail: d.step, status: stageStatus(d.stage) }))} />
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card p-5 text-sm">
            <p className="text-muted-foreground">Follow the work as it happens: every task, in progress and next.</p>
            <a href={PROJECT_BOARD_URL} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <GitHubIcon size={15} /> Project board <ArrowUpRight className="size-3.5" />
            </a>
            <a href="/changelog" className="font-medium text-primary hover:underline">
              What's shipped so far
            </a>
          </div>
        </Section>

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
              { icon: Globe, title: "Publish it", text: "Upload the match, publish the result for players and clubs, and share it by link or QR code." },
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

        <Section eyebrow="From umpires" title="What the testers say">
          <Testimonials askHref="/support" />
        </Section>

        <Section id="download" eyebrow="Download" title="Get the app" intro="Join the stage that's open now, or check back as the next one opens.">
          <div className={`grid gap-6 ${open.length > 2 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
            {open.map((d) => {
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
            Needs a Wear OS 3 watch or later (Samsung Galaxy Watch 4 and newer, Google Pixel Watch) with an Android phone. Apple Watch and iPhone are in
            testing through TestFlight, and arrive for everyone in 1.0.
          </p>
        </Section>

        <Section
          id="request"
          eyebrow="Join the testing"
          title="Ask for a place in the beta"
          intro="Tell us what you umpire with and the invitation follows by email. Places are limited while it's in testing."
        >
          <div className="grid gap-6 md:grid-cols-2">
            <AccessRequestForm kind="google-play" />
            <AccessRequestForm kind="testflight" />
          </div>
        </Section>

        <Section id="faq" eyebrow="Questions" title="Before you start">
          <FaqList faqs={FAQS} />
          <p className="mt-6 text-sm text-muted-foreground">
            Something else?{" "}
            <a href="/support" className="font-medium text-primary hover:underline">
              Support
            </a>{" "}
            has the ways to get help.
          </p>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
        </Section>

        <CtaBand title="Try it on your next match" intro={`The ${current.title.toLowerCase()} is open to umpires now. It takes a watch, a phone and about five minutes to set up.`}>
          <Button href="#download">Get the {current.title.toLowerCase()}</Button>
          <Button href={SITE.docsUrl} variant="outline">
            Read the guide
          </Button>
        </CtaBand>
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
            <a href="/changelog" className="hover:text-foreground">
              Changelog
            </a>
            <a href={SITE.statusUrl} className="hover:text-foreground">
              Status
            </a>
            <a href="/support" className="flex items-center gap-1.5 hover:text-foreground">
              <LifeBuoy size={15} /> Support
            </a>
            <a href={PROJECT_BOARD_URL} className="hover:text-foreground">
              Project board
            </a>
            <a href={BUG_REPORT_URL} className="hover:text-foreground">
              Report a bug
            </a>
            <a href={FEATURE_REQUEST_URL} className="hover:text-foreground">
              Ask for a feature
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
