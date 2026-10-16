import { notFound } from "next/navigation";
import { deletePlannedMatch, updatePlannedMatch } from "@/app/actions/planned";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { PlannedMatchForm } from "@/components/PlannedMatchForm";
import { Card, CardContent } from "@/components/ui/card";
import { apiOrNull } from "@/lib/api";
import { requireUmpire } from "@/lib/session";
import type { PlannedMatch } from "@/lib/types";

export const metadata = { title: "Upcoming match" };

export default async function PlannedMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUmpire(`/upcoming/${id}`);
  const planned = await apiOrNull<PlannedMatch>(`/v1/me/planned-matches/${id}`);
  if (!planned) notFound();

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${planned.home.name} v ${planned.away.name}`}
        description="Changes reach your phone next time you open the app, unless it's been sent to the watch already."
        back={{ href: "/upcoming", label: "Upcoming" }}
      />
      <Card>
        <CardContent>
          <PlannedMatchForm planned={planned} action={updatePlannedMatch} submitLabel="Save" />
        </CardContent>
      </Card>
      <ActionForm
        action={deletePlannedMatch}
        submitLabel="Delete this match"
        variant="destructive"
        inline
        confirm={{ title: "Delete this match?", description: "It goes from your phone too, unless it's been sent to the watch.", action: "Delete" }}
      >
        <input type="hidden" name="id" value={planned.id} />
      </ActionForm>
    </div>
  );
}
