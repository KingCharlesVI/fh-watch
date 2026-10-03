import { ArrowUpRight, Download } from "lucide-react";
import type { Metadata } from "next";
import { isPreRelease, readChangelog } from "@/changelog";
import { Container, GitHubIcon, Logo } from "@/components/parts";
import { GITHUB_URL, PROJECT_BOARD_URL, SITE } from "@/content";

export const metadata: Metadata = {
  title: "Changelog",
  description: `Every change to ${SITE.name}, newest first: the watch apps, the phone app, the website and the server.`,
};

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const showDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));

/** The repository's CHANGELOG.md, as it stood when this site was built. */
export default function Changelog() {
  const releases = readChangelog();
  return (
    <>
      <header className="border-b">
        <Container className="flex h-14 items-center justify-between">
          <a href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo size={28} /> {SITE.name}
          </a>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <a href="/#progress" className="hover:text-foreground">
              Progress
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
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Changelog</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Every change to the watch apps, the phone app, the website and the server, newest first. What&apos;s still to come is on the{" "}
            <a href={PROJECT_BOARD_URL} className="font-medium text-primary hover:underline">
              project board
            </a>
            .
          </p>
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <a href={`${GITHUB_URL}/releases`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <Download className="size-4" /> Releases, with the apps to install
            </a>
            <a href={`${GITHUB_URL}/commits`} className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <GitHubIcon size={15} /> Every commit
            </a>
          </div>

          {releases.length === 0 ? (
            <p className="mt-10 rounded-xl border border-dashed bg-card p-5 text-sm text-muted-foreground">
              The list couldn&apos;t be read when this page was built.{" "}
              <a href={`${GITHUB_URL}/releases`} className="font-medium text-primary underline">
                The releases on GitHub
              </a>{" "}
              have the same notes.
            </p>
          ) : (
            <ol className="mt-12 space-y-12">
              {releases.map((release) => (
                <li key={release.version}>
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-3">
                    <h2 className="text-xl font-semibold tabular-nums">{release.version}</h2>
                    {isPreRelease(release.version) && (
                      <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">Pre-release</span>
                    )}
                    {release.date && <span className="text-sm text-muted-foreground">{showDate(release.date)}</span>}
                    <a
                      href={`${GITHUB_URL}/releases/tag/v${release.version}`}
                      className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                    >
                      Release <ArrowUpRight className="size-3.5" />
                    </a>
                  </div>
                  {release.groups.map((group) => (
                    <section key={group.title} className="mt-5">
                      <h3 className="text-sm font-medium text-primary">{group.title}</h3>
                      <ul className="mt-2 space-y-2">
                        {group.changes.map((change) => (
                          <li key={change.text} className="flex flex-wrap items-baseline gap-2 text-sm">
                            {change.scope && (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">{change.scope}</span>
                            )}
                            {change.breaking && (
                              <span className="rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary">breaking</span>
                            )}
                            <span className="text-muted-foreground">{change.text}</span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </li>
              ))}
            </ol>
          )}
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
            <a href="/support" className="hover:text-foreground">
              Support
            </a>
            <a href={SITE.docsUrl} className="hover:text-foreground">
              Docs
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
