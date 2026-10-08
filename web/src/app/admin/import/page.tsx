import { ImportForm } from "@/components/ImportForm";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Import" };

/** Bulk import of clubs and teams, venues or competitions, for starting a league or season. */
export default async function AdminImportPage() {
  await requireAdmin("/admin/import");
  return (
    <div className="space-y-6">
      <PageHeader title="Import" description="Add many clubs and teams, venues or competitions at once." />
      <ImportForm />
    </div>
  );
}
