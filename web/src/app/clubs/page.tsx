import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";
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
      <PageHeader title="Clubs" />
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
        <p className="text-muted-foreground">No clubs found.</p>
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <ul className="divide-y">
            {clubs.items.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/clubs/${c.slug}`}
                  className="flex items-center justify-between px-4 py-3 text-foreground no-underline hover:bg-muted/60 hover:no-underline"
                >
                  {c.name}
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
