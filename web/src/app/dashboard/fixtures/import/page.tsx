import { FixtureImportForm } from "@/components/FixtureImportForm";
import { PageHeader } from "@/components/PageHeader";
import { requireClubAdmin } from "@/lib/session";

export const metadata = { title: "Import fixtures" };

export default async function ImportFixturesPage() {
  const user = await requireClubAdmin("/dashboard/fixtures/import");
  return (
    <div className="space-y-6">
      <PageHeader title="Import fixtures" description="Add a season's fixtures at once." back={{ href: "/dashboard/fixtures", label: "Club fixtures" }} />
      <FixtureImportForm clubId={user.clubId} />
    </div>
  );
}
