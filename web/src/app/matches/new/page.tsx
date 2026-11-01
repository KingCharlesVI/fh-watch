import { recordMatch } from "@/app/actions/matches";
import { PageHeader } from "@/components/PageHeader";
import { PlannedMatchForm } from "@/components/PlannedMatchForm";
import { Card, CardContent } from "@/components/ui/card";
import { requireUmpire } from "@/lib/session";

export const metadata = { title: "Record a match" };

/** A match umpired without the watch, on paper or in another app, added afterwards. */
export default async function RecordMatchPage() {
  await requireUmpire("/matches/new");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Record a match"
        description="For a match you umpired without the watch. Fill in how it was set up; next you'll add the goals and cards."
        back={{ href: "/dashboard", label: "Dashboard" }}
      />
      <Card>
        <CardContent>
          <PlannedMatchForm action={recordMatch} submitLabel="Next: goals and cards" played />
        </CardContent>
      </Card>
    </div>
  );
}
