import { createFixture } from "@/app/actions/umpiring";
import { FixtureForm } from "@/components/FixtureForm";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireClubAdmin } from "@/lib/session";
import type { ClubWithTeams } from "@/lib/types";

export const metadata = { title: "Add a fixture" };

export default async function NewFixturePage() {
  const user = await requireClubAdmin("/dashboard/fixtures/new");
  const club = await api<ClubWithTeams>(`/v1/clubs/${user.clubId}`);
  return (
    <div className="space-y-6">
      <PageHeader title="Add a fixture" back={{ href: "/dashboard/fixtures", label: "Club fixtures" }} />
      <Card>
        <CardContent>
          <FixtureForm club={club} action={createFixture} submitLabel="Add fixture" />
        </CardContent>
      </Card>
    </div>
  );
}
