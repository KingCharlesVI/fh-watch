import { hasRole } from "@fh/shared";
import { Button } from "@/components/ui/button";
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
