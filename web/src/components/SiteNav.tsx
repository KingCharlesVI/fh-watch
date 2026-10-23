"use client";

import { ArrowRight, Check, ChevronDown, ChevronRight, LogOut, Menu, Search, UserRound, X } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Dialog } from "radix-ui";
import { useEffect, useState } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { NavGroup, NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { ThemeSwitch } from "./ThemeToggle";

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
    // The page you're on is underlined in green along the header's bottom edge.
    "relative flex h-16 items-center px-3 text-sm font-semibold no-underline transition-colors hover:no-underline after:absolute after:inset-x-3 after:bottom-[-1px] after:h-[3px] after:rounded-t-sm",
    active ? "text-foreground after:bg-primary" : "text-muted-foreground hover:text-foreground hover:after:bg-border",
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
    <nav aria-label="Main" className="hidden items-stretch self-stretch lg:flex">
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

/** A row of the full-screen menu: the page you're on gets a green bar down its left edge. */
const sheetLinkClass = (active: boolean) =>
  cn(
    "relative flex items-center justify-between gap-3 py-3.5 text-foreground no-underline hover:no-underline active:bg-muted/60",
    "before:absolute before:inset-y-2.5 before:-left-4 before:w-[3px] before:rounded-r-sm sm:before:-left-6",
    active ? "before:bg-primary" : "text-foreground/85",
  );

/**
 * Everything in one full-screen menu on smaller screens, where the header has no room for the
 * links and menus: a search, the sections as big programme-style titles, the signed-in user's
 * pages by role, then their account and the colour theme.
 */
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
  const [open, setOpen] = useState(false);
  // Navigating closes it: the search, and the back button.
  const query = useSearchParams().toString();
  useEffect(() => setOpen(false), [path, query]);
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon-lg" className="-mr-2 lg:hidden [&_svg:not([class*='size-'])]:size-6" aria-label="Menu">
          <Menu />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content
          aria-describedby={undefined}
          // A link to the page you're already on doesn't navigate, so any link closes it.
          onClick={(e) => (e.target as Element).closest("a") && setOpen(false)}
          className={cn(
            "fixed inset-0 z-50 flex flex-col overflow-y-auto overscroll-contain bg-background outline-none lg:hidden",
            "duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-4",
          )}
        >
          <Dialog.Title className="sr-only">Menu</Dialog.Title>
          {/* The header again, with the close button where the menu button was. */}
          <div className="sticky top-0 z-10 border-t-[3px] border-b border-t-pitch bg-card/95 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
              <Logo className="shrink-0 text-base whitespace-nowrap sm:text-lg" />
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon-lg" className="-mr-2 ml-auto [&_svg:not([class*='size-'])]:size-6" aria-label="Close menu">
                  <X />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 pt-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:px-6">
            <form role="search" action="/search" className="relative">
              <label htmlFor="menu-search" className="sr-only">
                Search clubs, teams, competitions, venues and matches
              </label>
              <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" />
              <Input id="menu-search" name="q" type="search" placeholder="Search clubs, teams and matches" className="h-12 bg-card pl-11 text-base" />
            </form>

            <nav aria-label="Main" className="space-y-8">
              <ul className="divide-y border-y">
                {SECTIONS.map((s) => (
                  <li key={s.href}>
                    <Link href={s.href} aria-current={s.match(path) ? "page" : undefined} className={cn(sheetLinkClass(s.match(path)), "py-4")}>
                      <span className="section-title text-4xl">{s.label}</span>
                      <ArrowRight className="size-5 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
              {groups.map((g) => (
                <section key={g.title} aria-label={g.title} className="space-y-1">
                  <h2 className="section-title text-sm text-muted-foreground">{g.title}</h2>
                  <ul className="divide-y border-b">
                    {g.items.map((item) => (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={item.href === active ? "page" : undefined}
                          className={cn(sheetLinkClass(item.href === active), "text-lg font-semibold")}
                        >
                          {item.label}
                          <ChevronRight className="size-4 text-muted-foreground" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </nav>

            <div className="mt-auto space-y-6">
              {user ? (
                <div className="overflow-hidden rounded-lg border bg-card">
                  <Link href="/account" className="flex items-center gap-3 p-4 text-foreground no-underline hover:no-underline active:bg-muted/60">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-pitch text-pitch-foreground">
                      <UserRound className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{user.displayName}</span>
                      <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                  <form action={logout} className="border-t">
                    <button type="submit" className="flex w-full items-center gap-2 px-4 py-3.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
                      <LogOut className="size-4" /> Sign out
                    </button>
                  </form>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="lg" asChild>
                    <Link href="/login">Sign in</Link>
                  </Button>
                  <Button size="lg" asChild className="bg-foreground text-background hover:bg-foreground/90">
                    <Link href="/register">Register</Link>
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-4 border-t pt-5">
                <ul className="flex gap-5 text-sm font-semibold">
                  <li>
                    <Link href="/support" className="text-muted-foreground no-underline hover:text-foreground">
                      Support
                    </Link>
                  </li>
                  <li>
                    <a href={docsUrl} className="text-muted-foreground no-underline hover:text-foreground">
                      Docs
                    </a>
                  </li>
                  <li>
                    <a href={githubUrl} className="text-muted-foreground no-underline hover:text-foreground">
                      GitHub
                    </a>
                  </li>
                </ul>
                <ThemeSwitch />
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
