"use client";

import { Check, ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { NavGroup, NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

export interface NavUser {
  displayName: string;
  email: string;
}

/** The pages anyone can see, before the signed-in user's menus. */
const SECTIONS = [
  { href: "/matches", label: "Results", match: (p: string) => p === "/matches" || p.startsWith("/matches/") || p.startsWith("/m/") },
  { href: "/clubs", label: "Clubs", match: (p: string) => p.startsWith("/clubs") },
];

/**
 * How well a menu link matches where you are: its path's length, or -1 for no match. The
 * longest match wins, so a club admin's own club (under /admin/clubs) marks Teams rather than
 * Clubs and teams. The dashboard's links pick a view; with none given, it shows `defaultView`.
 */
function score(href: string, path: string, view: string | null, defaultView: string | undefined): number {
  const [base = href, query] = href.split("?");
  if (query) {
    const wanted = new URLSearchParams(query).get("view");
    return path === base && (view ?? defaultView) === wanted ? base.length + 1 : -1;
  }
  return path === base || path.startsWith(`${base}/`) ? base.length : -1;
}

/** The menu link for the page you're on, if one is. */
function useActiveHref(groups: NavGroup[], defaultView: string | undefined): string | null {
  const path = usePathname();
  const view = useSearchParams().get("view");
  const all = groups.flatMap((g) => g.items);
  const scores = all.map((i) => score(i.href, path, view, defaultView));
  const best = Math.max(-1, ...scores);
  return best >= 0 ? all[scores.indexOf(best)]!.href : null;
}

const linkClass = (active: boolean) =>
  cn(
    "rounded-full px-4 py-1.5 text-sm font-medium no-underline transition-colors hover:no-underline",
    active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
  );

/** A menu's links, with the page you're on ticked. */
function MenuItems({ items, active }: { items: NavItem[]; active: string | null }) {
  return items.map((item) => (
    <DropdownMenuItem key={item.href} asChild className={cn(item.href === active && "font-medium")}>
      <Link href={item.href} aria-current={item.href === active ? "page" : undefined}>
        {item.label}
        {item.href === active && <Check className="ml-auto" />}
      </Link>
    </DropdownMenuItem>
  ));
}

/** Matches and Clubs, then a menu for each of the signed-in user's roles. Hidden on smaller screens, where the menu button has them. */
export function MainNav({ groups, defaultView }: { groups: NavGroup[]; defaultView?: string }) {
  const path = usePathname();
  const active = useActiveHref(groups, defaultView);
  return (
    <nav aria-label="Main" className="hidden items-center gap-0.5 rounded-full bg-muted p-1 lg:flex">
      {SECTIONS.map((s) => (
        <Link key={s.href} href={s.href} aria-current={s.match(path) ? "page" : undefined} className={linkClass(s.match(path))}>
          {s.label}
        </Link>
      ))}
      {groups.map((g) => {
        const here = g.items.some((i) => i.href === active);
        return (
          <DropdownMenu key={g.title}>
            <DropdownMenuTrigger className={cn(linkClass(here), "inline-flex items-center gap-1 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}>
              {g.title}
              <ChevronDown className="size-3.5 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <MenuItems items={g.items} active={active} />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </nav>
  );
}

/** The account menu: signed in, the user's name; otherwise Sign in and Register. */
export function AccountMenu({ user }: { user: NavUser | null }) {
  if (!user) {
    return (
      <div className="hidden items-center gap-1 lg:flex">
        <Button variant="ghost" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild className="bg-foreground text-background hover:bg-foreground/90">
          <Link href="/register">Register</Link>
        </Button>
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="hidden lg:inline-flex">
          <UserRound />
          <span className="max-w-40 truncate">{user.displayName}</span>
        </Button>
      </DropdownMenuTrigger>
      <AccountItems user={user} />
    </DropdownMenu>
  );
}

function AccountItems({ user }: { user: NavUser }) {
  return (
    <DropdownMenuContent align="end" className="w-56">
      <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/account">
          <UserRound /> Your account
        </Link>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <form action={logout}>
        <DropdownMenuItem asChild>
          <button type="submit" className="w-full">
            <LogOut /> Sign out
          </button>
        </DropdownMenuItem>
      </form>
    </DropdownMenuContent>
  );
}

/** Everything in one menu on smaller screens, where the header has no room for the links and menus. */
export function MobileMenu({
  user,
  groups,
  defaultView,
  docsUrl,
  githubUrl,
}: {
  user: NavUser | null;
  groups: NavGroup[];
  defaultView?: string;
  docsUrl: string;
  githubUrl: string;
}) {
  const path = usePathname();
  const active = useActiveHref(groups, defaultView);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menu">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        {SECTIONS.map((s) => (
          <DropdownMenuItem key={s.href} asChild className={cn(s.match(path) && "font-medium")}>
            <Link href={s.href}>
              {s.label}
              {s.match(path) && <Check className="ml-auto" />}
            </Link>
          </DropdownMenuItem>
        ))}
        {groups.map((g) => (
          <Fragment key={g.title}>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</DropdownMenuLabel>
              <MenuItems items={g.items} active={active} />
            </DropdownMenuGroup>
          </Fragment>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/support">Support</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={docsUrl}>Docs</a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={githubUrl}>GitHub</a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user ? (
          <>
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">{user.email}</DropdownMenuLabel>
            <DropdownMenuItem asChild>
              <Link href="/account">Your account</Link>
            </DropdownMenuItem>
            <form action={logout}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link href="/login">Sign in</Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/register">Register</Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
