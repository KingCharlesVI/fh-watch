"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Between the umpiring pages: an umpire's own, and a club admin's for their club. */
export function UmpiringNav({ umpire, clubAdmin }: { umpire: boolean; clubAdmin: boolean }) {
  const path = usePathname();
  const links = [
    ...(umpire
      ? [
          { href: "/appointments", label: "Appointments" },
          { href: "/availability", label: "Availability" },
          { href: "/season", label: "My season" },
        ]
      : []),
    ...(clubAdmin
      ? [
          { href: "/dashboard/fixtures", label: "Club fixtures" },
          { href: "/dashboard/umpires", label: "Club umpires" },
        ]
      : []),
  ];
  if (links.length < 2) return null;
  return (
    <nav aria-label="Umpiring" className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium no-underline hover:no-underline",
              active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
