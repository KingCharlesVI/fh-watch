import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import { ClubBadge } from "@/components/ClubBadge";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Club, Items } from "@/lib/types";

export const metadata = { title: "Clubs" };

export default async function ClubsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const clubs = await api<Items<Club>>("/v1/clubs", { query: { q: q?.trim() } });
  return (
    <div className="space-y-6">
      <PageHeader title="Clubs" description="Every club with teams on FH Match Centre, and their results." />
      <form role="search" className="flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">
          Find a club
        </label>
        <Input id="q" name="q" type="search" placeholder="Find a club" defaultValue={q} />
        <Button type="submit">
          <Search /> Search
        </Button>
      </form>
      {clubs.items.length === 0 ? (
        <Card className="py-10 text-center text-muted-foreground">
          <p>{q ? `No clubs match “${q}”.` : "No clubs yet."}</p>
        </Card>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clubs.items.map((c) => (
            <li key={c.id}>
              <Link href={`/clubs/${c.slug}`} className="group block no-underline hover:no-underline">
                <Card className="flex-row items-center gap-3 px-4 py-4 transition-colors group-hover:bg-muted/60">
                  <ClubBadge name={c.name} />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.name}</span>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
