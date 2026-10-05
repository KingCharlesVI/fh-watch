import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { createClub } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ClubBadge } from "@/components/ClubBadge";
import { LogoField } from "@/components/LogoField";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import type { Club, Items } from "@/lib/types";

export const metadata = { title: "Clubs" };

export default async function AdminClubsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requireAdmin("/admin/clubs");
  const { deleted } = await searchParams;
  const clubs = await api<Items<Club>>("/v1/clubs");
  return (
    <div className="space-y-6">
      <PageHeader title="Clubs" back={{ href: "/admin", label: "Admin" }} description={deleted ? "Club deleted." : undefined} />
      <div className="grid items-start gap-6 md:grid-cols-[3fr_2fr]">
        <Card className="gap-0 overflow-hidden py-0">
          {clubs.items.length === 0 ? (
            <p className="p-4 text-muted-foreground">No clubs yet.</p>
          ) : (
            <ul className="divide-y">
              {clubs.items.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/admin/clubs/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 text-foreground no-underline hover:bg-muted/60 hover:no-underline"
                  >
                    <ClubBadge name={c.name} logoUrl={c.logoUrl} size="sm" />
                    <span className="min-w-0 flex-1 truncate">{c.name}</span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add a club</CardTitle>
          </CardHeader>
          <CardContent>
            <ActionForm action={createClub} submitLabel="Add club" className="max-w-none">
              <TextField label="Name" name="name" required minLength={2} maxLength={100} />
              <LogoField />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
