"use client";

import { LogOut, Menu, Shield, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { cn } from "@/lib/utils";

export interface NavUser {
  displayName: string;
  email: string;
  isAdmin: boolean;
}

/** The main sections: Matches, Clubs, and the dashboard when signed in. */
export function sections(user: NavUser | null) {
  return [
    { href: "/matches", label: "Matches", match: (p: string) => p === "/matches" || p.startsWith("/matches/") || p.startsWith("/m/") },
    { href: "/clubs", label: "Clubs", match: (p: string) => p.startsWith("/clubs") },
    ...(user ? [{ href: "/dashboard", label: "Dashboard", match: (p: string) => p.startsWith("/dashboard") }] : []),
  ];
}

/** The section links, with the current one marked. Hidden on phones, where the menu has them. */
export function MainNav({ user }: { user: NavUser | null }) {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {sections(user).map((s) => {
        const active = s.match(path);
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium no-underline transition-colors hover:bg-muted hover:no-underline",
              active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The account menu: signed in, the user's name; otherwise Sign in and Register. */
export function AccountMenu({ user }: { user: NavUser | null }) {
  if (!user) {
    return (
      <div className="hidden items-center gap-1 md:flex">
        <Button variant="ghost" asChild>
          <Link href="/login">Sign in</Link>
        </Button>
        <Button asChild>
          <Link href="/register">Register</Link>
        </Button>
      </div>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="hidden md:inline-flex">
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
      {user.isAdmin && (
        <DropdownMenuItem asChild>
          <Link href="/admin">
            <Shield /> Admin
          </Link>
        </DropdownMenuItem>
      )}
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

/** Everything in one menu on phones, where the header has no room for the links. */
export function MobileMenu({ user, docsUrl, githubUrl }: { user: NavUser | null; docsUrl: string; githubUrl: string }) {
  const path = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Menu">
          <Menu />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {sections(user).map((s) => (
          <DropdownMenuItem key={s.href} asChild className={cn(s.match(path) && "bg-muted font-medium")}>
            <Link href={s.href}>{s.label}</Link>
          </DropdownMenuItem>
        ))}
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
            {user.isAdmin && (
              <DropdownMenuItem asChild>
                <Link href="/admin">Admin</Link>
              </DropdownMenuItem>
            )}
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
