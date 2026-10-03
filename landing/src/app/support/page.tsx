import { ArrowUpRight, BookOpen, Bug, Mail, MessageSquarePlus, ShieldCheck, Wrench } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Container, GitHubIcon, Logo } from "@/components/parts";
import { CURRENT_STAGE, DOWNLOADS, GITHUB_URL, ISSUES_URL, PROJECT_BOARD_URL, SITE } from "@/content";

export const metadata: Metadata = {
  title: "Support",
  description: `How to get help with ${SITE.name}: the guide, troubleshooting, and how to report a problem or ask for something.`,
};

const NEW_ISSUE_URL = `${ISSUES_URL}/new`;

/** What to put in a report, so a problem can actually be found. */
const REPORT_DETAILS = [
  "What happened, and what you expected instead.",
  "Which app: the watch app or the phone app (or both).",
  "Your watch and phone, and which version of Wear OS, watchOS, Android or iOS they run.",
  "The app's version, from Settings at the bottom of the phone app.",
  "When it happened, roughly: if it was during a match, that helps match it to the log.",
];

export default function Support() {
  const current = DOWNLOADS.find((d) => d.stage === CURRENT_STAGE)!;
  return (
    <>
      <header className="border-b">
        <Container className="flex h-14 items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={28} /> {SITE.name}
          </a>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <a href="/#faq" className="hover:text-foreground">
              FAQ
            </a>
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
            </a>
            <a href="/#download" className="font-medium text-foreground hover:text-primary">
              Download
            </a>
          </nav>
        </Container>
      </header>

      <main>
        <Container className="max-w-3xl py-14">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Support</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            {SITE.name} is a small project in its {current.title.toLowerCase()}, built with the umpires using it. If something&apos;s wrong or missing,
            telling us is genuinely useful.
          </p>

          <div className="mt-10 space-y-4">
            <Panel
              icon={<Bug className="size-5 text-primary" />}
              title="Report a problem"
              action={{ href: NEW_ISSUE_URL, label: "Open an issue on GitHub" }}
            >
              <p>
                Problems are tracked in the open on GitHub, so you can see what&apos;s already known and follow a fix. You need a free GitHub account to
                post one.
              </p>
              <p className="mt-3 font-medium text-foreground">What to include</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {REPORT_DETAILS.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <p className="mt-3">
                Please don&apos;t put anything private in an issue: it&apos;s public. Leave out players&apos; names, and send a match file only if
                you&apos;re asked for one.
              </p>
            </Panel>

            <Panel
              icon={<Wrench className="size-5 text-primary" />}
              title="Something not working?"
              action={{ href: `${SITE.docsUrl}/#/guide/troubleshooting`, label: "Troubleshooting" }}
            >
              <p>
                The troubleshooting page covers the usual ones: the watch and phone not finding each other, a match that hasn&apos;t arrived on the
                phone, the side button doing nothing, and the clock or vibrations stopping while your wrist is down.
              </p>
            </Panel>

            <Panel
              icon={<BookOpen className="size-5 text-primary" />}
              title="How to use it"
              action={{ href: SITE.docsUrl, label: "Read the guide" }}
            >
              <p>
                There&apos;s a page for each app — Wear OS, Apple Watch, the phone app and the website — plus getting started, red cards and workouts.
              </p>
            </Panel>

            <Panel
              icon={<MessageSquarePlus className="size-5 text-primary" />}
              title="Ask for something, or join the test"
              action={
                SITE.contactEmail
                  ? { href: `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(`${SITE.name}: ${current.title}`)}`, label: `Email ${SITE.contactEmail}`, mail: true }
                  : { href: NEW_ISSUE_URL, label: "Ask on GitHub" }
              }
            >
              <p>
                Ideas from umpires are how most of this got built. If you want to join the {current.title.toLowerCase()}, say which watch and phone you
                have{SITE.contactEmail ? "" : " — a GitHub issue is fine for that too"}.
              </p>
              <p className="mt-3">
                What&apos;s being worked on now, and what&apos;s next, is on the{" "}
                <a href={PROJECT_BOARD_URL} className="font-medium text-primary hover:underline">
                  project board
                </a>
                .
              </p>
            </Panel>

            <Panel icon={<ShieldCheck className="size-5 text-primary" />} title="Your matches and your data" action={{ href: "/privacy", label: "Privacy policy" }}>
              <p>
                Matches stay on your watch and your phone until you upload one. You can delete any match from the phone app, and if you have an account,
                asking for it to be deleted is on your account page on the website.
              </p>
            </Panel>
          </div>

          <h2 className="mt-12 text-xl font-semibold">Where everything is</h2>
          <ul className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            {[
              { href: SITE.docsUrl, label: "Documentation", detail: "Guides for every app" },
              { href: PROJECT_BOARD_URL, label: "Project board", detail: "What's in progress" },
              { href: `${GITHUB_URL}/releases`, label: "Releases", detail: "Every version, with its notes" },
              { href: GITHUB_URL, label: "The code", detail: "All of it, open" },
              ...(SITE.appUrl ? [{ href: SITE.appUrl, label: "The website", detail: "Published results and your account" }] : []),
              { href: "/#download", label: "Downloads", detail: "The apps for this stage" },
            ].map((link) => (
              <li key={link.label}>
                <a href={link.href} className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted">
                  <span>
                    <span className="font-medium">{link.label}</span>
                    <span className="block text-muted-foreground">{link.detail}</span>
                  </span>
                  <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                </a>
              </li>
            ))}
          </ul>
        </Container>
      </main>

      <footer className="border-t py-10">
        <Container className="flex flex-col gap-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Logo size={20} /> {SITE.name}
          </span>
          <nav className="flex flex-wrap gap-5">
            <a href="/" className="hover:text-foreground">
              Home
            </a>
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
            </a>
            <a href={GITHUB_URL} className="flex items-center gap-1.5 hover:text-foreground">
              <GitHubIcon size={15} /> GitHub
            </a>
            <a href="/privacy" className="hover:text-foreground">
              Privacy
            </a>
          </nav>
        </Container>
      </footer>
    </>
  );
}

/** One way of getting help: what it's for, and the link that takes you there. */
function Panel({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action: { href: string; label: string; mail?: boolean };
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-start gap-3">
        {icon}
        <div className="flex-1">
          <h2 className="font-semibold">{title}</h2>
          <div className="mt-2 text-sm text-muted-foreground">{children}</div>
          <a href={action.href} className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            {action.mail ? <Mail className="size-4" /> : <ArrowUpRight className="size-4" />}
            {action.label}
          </a>
        </div>
      </div>
    </section>
  );
}
