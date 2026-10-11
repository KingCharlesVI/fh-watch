import { NamedListAdmin } from "@/components/NamedListAdmin";
import { requireAdmin } from "@/lib/session";

export const metadata = { title: "Venues" };

/** Where matches are played: one list, not tied to clubs, offered to umpires setting up or editing a match. */
export default async function AdminVenuesPage() {
  await requireAdmin("/admin/venues");
  return (
    <NamedListAdmin
      list="venues"
      title="Venues"
      noun="venue"
      description="Offered when an umpire sets up or edits a match, where umpires can add one that's missing. A match keeps its venue as text, so changing this list never changes a match."
      example="Banbury Road, Oxford"
    />
  );
}
