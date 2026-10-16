import { createPlannedMatch } from "@/app/actions/planned";
import { PageHeader } from "@/components/PageHeader";
import { PlannedMatchForm } from "@/components/PlannedMatchForm";
import { Card, CardContent } from "@/components/ui/card";
import { requireUmpire } from "@/lib/session";

export const metadata = { title: "Plan a match" };

export default async function NewPlannedMatchPage() {
  await requireUmpire("/upcoming/new");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Plan a match"
        description="Set it up as you would on your phone. Fill in what you know; you can change it on the phone later."
        back={{ href: "/upcoming", label: "Upcoming" }}
      />
      <Card>
        <CardContent>
          <PlannedMatchForm action={createPlannedMatch} submitLabel="Save" />
        </CardContent>
      </Card>
    </div>
  );
}
