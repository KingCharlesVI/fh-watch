import { hasRole } from "@fh/shared";
import { Search } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DOCS_URL, GITHUB_URL } from "@/lib/site";
import type { User } from "@/lib/types";
import { GitHubIcon } from "./GitHubIcon";
import { Logo } from "./Logo";
import { AccountMenu, MainNav, MobileMenu, type NavUser } from "./SiteNav";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader({ user }: { user: User | null }) {
  const navUser: NavUser | null = user ? { displayName: user.displayName, email: user.email, isAdmin: hasRole(user, "admin") } : null;
  return (
    <header className="sticky top-0 z-40 border-b bg-card/85 backdrop-blur supports-[backdrop-filter]:bg-card/70">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4">
        <Logo className="text-base sm:text-lg" />
        <MainNav user={navUser} />
        <div className="ml-auto flex items-center gap-1">
          {/* Search everything: a box where there's room, otherwise a button to the search page. */}
          <form role="search" action="/search" className="relative mr-1 hidden lg:block">
            <label htmlFor="site-search" className="sr-only">
              Search clubs, teams, competitions, venues and matches
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="site-search" name="q" type="search" placeholder="Search" className="h-9 w-48 pl-8" />
          </form>
          <Button variant="ghost" size="icon" asChild className="lg:hidden">
            <Link href="/search" aria-label="Search" title="Search">
              <Search />
            </Link>
          </Button>
          <Button variant="ghost" asChild className="hidden text-muted-foreground hover:text-foreground md:inline-flex">
            <a href={DOCS_URL}>Docs</a>
          </Button>
          <Button variant="ghost" size="icon" asChild className="hidden md:inline-flex">
            <a href={GITHUB_URL} aria-label="GitHub repository" title="GitHub">
              <GitHubIcon />
            </a>
          </Button>
          <ThemeToggle />
          <AccountMenu user={navUser} />
          <MobileMenu user={navUser} docsUrl={DOCS_URL} githubUrl={GITHUB_URL} />
        </div>
      </div>
    </header>
  );
}
