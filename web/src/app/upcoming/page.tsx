import { fixtureWhen, formatPreset } from "@fh/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
import { DateTile } from "@/components/DateTile";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireUmpire } from "@/lib/session";
import type { Items, PlannedMatch } from "@/lib/types";

export const metadata = { title: "Upcoming" };

/** Matches you've set up ahead of time, from today. Your phone picks them up into its Upcoming list. */
export default async function UpcomingPage() {
  await requireUmpire("/upcoming");
  const planned = await api<Items<PlannedMatch>>("/v1/me/planned-matches");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Upcoming"
        description="Matches you've set up ahead of time. They appear in Upcoming on your phone, ready to send to the watch."
        actions={
          <Button asChild>
            <Link href="/upcoming/new">
              <Plus /> Plan a match
            </Link>
          </Button>
        }
      />

      {planned.items.length === 0 ? (
        <Card className="py-10 text-center text-muted-foreground">
          <p>No upcoming matches. Plan one, and it&apos;ll be on your phone next time you open the app.</p>
        </Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {planned.items.map((p) => (
            <li key={p.id} className="min-w-0">
              <Link
                href={`/upcoming/${p.id}`}
                className="flex h-full items-center gap-4 rounded-lg border bg-card p-4 text-foreground no-underline transition-[border-color,box-shadow] hover:border-foreground/15 hover:no-underline hover:shadow-md hover:shadow-black/5"
              >
                <DateTile date={p.date} />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex items-center gap-2 font-semibold">
                    <Swatch color={p.home.color} /> <span className="truncate">{p.home.name}</span>
                  </span>
                  <span className="flex items-center gap-2 font-semibold">
                    <Swatch color={p.away.color} /> <span className="truncate">{p.away.name}</span>
                  </span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {[fixtureWhen(p.date, p.time), p.venue, p.competition, p.format ? (formatPreset(p.format)?.label ?? formatLabel(p.format)) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** "3 × 20 min", for a format that isn't one of the presets. */
const formatLabel = (f: NonNullable<PlannedMatch["format"]>) => `${f.periods} × ${f.periodMinutes} min`;

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="inline-block size-3 shrink-0 rounded-full border border-foreground/20" style={{ backgroundColor: color }} />;
}
