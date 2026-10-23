import { SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A GET filter form folded away behind one line, open while any of its filters is set. A
 * native details element, so it opens and closes without JavaScript.
 */
export function FilterPanel({
  summary,
  active,
  clearHref,
  action,
  label,
  children,
}: {
  summary: string;
  /** Whether a filter is set: the panel starts open, with a Clear link. */
  active: boolean;
  clearHref: string;
  action?: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-lg border bg-card open:pb-5" open={active || undefined}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-5 py-3.5 text-sm font-semibold select-none hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
        <SlidersHorizontal className="size-4 text-muted-foreground" />
        {summary}
        <span className="ml-auto text-xs font-medium text-muted-foreground group-open:hidden">Show</span>
        <span className="ml-auto hidden text-xs font-medium text-muted-foreground group-open:inline">Hide</span>
      </summary>
      <form aria-label={label} action={action} className="flex flex-wrap items-end gap-3 px-5 pt-2">
        {children}
        <div className="flex gap-2">
          <Button type="submit">Apply</Button>
          {active && (
            <Button variant="outline" asChild>
              <Link href={clearHref}>Clear</Link>
            </Button>
          )}
        </div>
      </form>
    </details>
  );
}

/** A row of pill links where one is picked, like a segmented control. */
export function PillLinks({ items, label, className }: { items: { href: string; label: string; active: boolean }[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("inline-flex flex-wrap gap-0.5 rounded-md bg-muted p-1", className)}>
      {items.map((i) => (
        <Link
          key={i.href}
          href={i.href}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "rounded-sm px-4 py-1.5 text-sm font-semibold no-underline transition-colors hover:no-underline",
            i.active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
