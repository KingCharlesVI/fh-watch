import { NamedListAdmin } from "@/components/NamedListAdmin";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Competitions" };

/** Leagues and cups: one list, offered to umpires editing a match. */
export default async function AdminCompetitionsPage() {
  await requireAdmin("/admin/competitions");
  return (
    <NamedListAdmin
      list="competitions"
      title="Competitions"
      noun="competition"
      description="Offered when an umpire edits a match, where umpires can add one that's missing. A match keeps its competition as text, so changing this list never changes a match."
      example="South League Premier, or Hampshire Cup"
    />
  );
}
