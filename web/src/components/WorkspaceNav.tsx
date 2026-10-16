"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface NavGroup {
  title: string;
  items: { href: string; label: string }[];
}

/**
 * How well a link matches where you are: its path's length, or -1 for no match. The longest
 * match wins, so a club admin's own club (under /admin/clubs) marks Teams rather than Admin.
 * The dashboard's links pick a view, and the first is the one with no view given.
 */
function score(href: string, path: string, view: string | null, defaultView: string | undefined): number {
  const [base = href, query] = href.split("?");
  if (query) {
    const wanted = new URLSearchParams(query).get("view");
    return path === base && (view ?? defaultView) === wanted ? base.length + 1 : -1;
  }
  return path === base || path.startsWith(`${base}/`) ? base.length : -1;
}

/**
 * Everything a signed-in user manages, by role: one list beside every such page, on phones a
 * row above it. It replaces the links each page used to carry to its neighbours.
 */
export function WorkspaceNav({ groups, defaultView }: { groups: NavGroup[]; defaultView?: string }) {
  const path = usePathname();
  const view = useSearchParams().get("view");
  const all = groups.flatMap((g) => g.items);
  const scores = all.map((i) => score(i.href, path, view, defaultView));
  const best = Math.max(...scores);
  const active = best >= 0 ? all[scores.indexOf(best)]!.href : null;
  const row = useRef<HTMLDivElement>(null);

  // On phones, the current page's link may be off the end of the row: bring it into view.
  useEffect(() => {
    const current = row.current?.querySelector<HTMLElement>("[aria-current=page]");
    if (current && row.current) row.current.scrollLeft = current.offsetLeft - row.current.offsetLeft - 16;
  }, [active]);

  const link = (item: { href: string; label: string }, className: string, activeClass: string) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.href === active ? "page" : undefined}
      className={cn(
        "text-sm font-medium no-underline transition-colors hover:no-underline",
        className,
        item.href === active ? activeClass : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {item.label}
    </Link>
  );

  return (
    <nav aria-label="Dashboard" className="min-w-0">
      {/* Phones and tablets: one row that scrolls sideways. */}
      <div ref={row} className="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 lg:hidden">
        {all.map((item) => link(item, "shrink-0 whitespace-nowrap rounded-md px-3 py-1.5", "bg-card text-foreground shadow-sm ring-1 ring-border"))}
      </div>
      {/* Wider screens: a list down the side, by role. */}
      <div className="sticky top-20 hidden space-y-5 lg:block">
        {groups.map((g) => (
          <div key={g.title} className="space-y-1">
            <h2 className="px-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">{g.title}</h2>
            <div className="flex flex-col">{g.items.map((item) => link(item, "rounded-md px-3 py-1.5", "bg-muted text-foreground"))}</div>
          </div>
        ))}
      </div>
    </nav>
  );
}
