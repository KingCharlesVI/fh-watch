import { Search } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultView, navGroups } from "@/lib/nav";
import { DOCS_URL, GITHUB_URL } from "@/lib/site";
import type { User } from "@/lib/types";
import { Logo } from "./Logo";
import { AccountMenu, MainNav, MobileMenu, type NavUser } from "./SiteNav";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader({ user }: { user: User | null }) {
  const navUser: NavUser | null = user ? { displayName: user.displayName, email: user.email } : null;
  const groups = navGroups(user);
  const view = defaultView(user);
  return (
    <header className="sticky top-0 z-40 border-t-[3px] border-b border-t-pitch bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6 lg:gap-6">
        <Logo className="shrink-0 text-base whitespace-nowrap sm:text-lg" />
        {/* The menus mark the page you're on from the address, which a page streams in. */}
        <Suspense>
          <MainNav groups={groups} defaultView={view} />
        </Suspense>
        <div className="ml-auto flex items-center gap-1">
          {/* Search everything: a box where there's room, otherwise a button to the search page. */}
          <form role="search" action="/search" className="relative mr-1 hidden xl:block">
            <label htmlFor="site-search" className="sr-only">
              Search clubs, teams, competitions, venues and matches
            </label>
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="site-search" name="q" type="search" placeholder="Search" className="h-9 w-52 bg-background pl-8" />
          </form>
          <Button variant="ghost" size="icon-lg" asChild className="lg:size-9 xl:hidden [&_svg:not([class*='size-'])]:size-5.5 lg:[&_svg:not([class*='size-'])]:size-4">
            <Link href="/search" aria-label="Search" title="Search">
              <Search />
            </Link>
          </Button>
          {/* On smaller screens it's in the menu. */}
          <ThemeToggle className="hidden lg:inline-flex" />
          <AccountMenu user={navUser} />
          <Suspense>
            <MobileMenu user={navUser} groups={groups} defaultView={view} docsUrl={DOCS_URL} githubUrl={GITHUB_URL} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
