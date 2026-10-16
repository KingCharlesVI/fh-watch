import { fixtureWhen, formatPreset } from "@fh/shared";
import { Plus } from "lucide-react";
import Link from "next/link";
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
        <ul className="space-y-2">
          {planned.items.map((p) => (
            <li key={p.id}>
              <Link href={`/upcoming/${p.id}`} className="block text-foreground no-underline hover:no-underline">
                <Card className="gap-1 px-4 py-3 transition-colors hover:bg-muted/50">
                  <div className="flex items-center gap-2 font-medium">
                    <Swatch color={p.home.color} /> {p.home.name} v <Swatch color={p.away.color} /> {p.away.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {[fixtureWhen(p.date, p.time), p.venue, p.competition, p.format ? (formatPreset(p.format)?.label ?? formatLabel(p.format)) : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </Card>
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
