import Link from "next/link";
import { DOCS_URL, GITHUB_URL, LANDING_URL, SITE_DESCRIPTION, SITE_NAME, STATUS_URL } from "@/lib/site";
import { GitHubIcon } from "./GitHubIcon";
import { Logo } from "./Logo";
import { ThemeSwitch } from "./ThemeToggle";

interface FooterLink {
  href: string;
  label: string;
  /** Another site: a plain link rather than an in-app one. */
  external?: boolean;
  github?: boolean;
}

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: "Results",
    links: [
      { href: "/matches", label: "Results" },
      { href: "/clubs", label: "Clubs" },
    ],
  },
  {
    title: "Umpires",
    links: [
      { href: "/register", label: "Register" },
      { href: "/dashboard", label: "Dashboard" },
      { href: LANDING_URL, label: "Get the apps", external: true },
    ],
  },
  {
    title: "About",
    links: [
      { href: "/support", label: "Support" },
      { href: STATUS_URL, label: "Status", external: true },
      { href: DOCS_URL, label: "Documentation", external: true },
      { href: GITHUB_URL, label: "GitHub", external: true, github: true },
      { href: `${LANDING_URL}/privacy`, label: "Privacy", external: true },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto grid max-w-6xl grid-cols-3 gap-x-4 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div className="col-span-3 space-y-3 md:col-span-1">
          <Logo size={28} />
          <p className="max-w-xs text-sm text-muted-foreground">{SITE_DESCRIPTION}</p>
        </div>
        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title} className="space-y-3 text-sm">
            <h2 className="font-sans font-semibold">{col.title}</h2>
            <ul className="space-y-2">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} className="inline-flex items-center gap-1.5 text-muted-foreground no-underline hover:text-foreground">
                      {l.github && <GitHubIcon className="size-3.5" />}
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="inline-flex items-center text-muted-foreground no-underline hover:text-foreground">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <span>
            © {new Date().getFullYear()} {SITE_NAME} · Results recorded by umpires on the pitch.
          </span>
          <ThemeSwitch />
        </div>
      </div>
    </footer>
  );
}
