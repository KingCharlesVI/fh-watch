import { createVenue, deleteVenue, renameVenue } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import type { Items, Venue } from "@/lib/types";

export const metadata = { title: "Venues" };

/** Where matches are played: one list, not tied to clubs, offered to umpires setting up a match. */
export default async function AdminVenuesPage() {
  await requireAdmin("/admin/venues");
  const venues = await api<Items<Venue>>("/v1/venues");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Venues"
        back={{ href: "/admin", label: "Admin" }}
        description="The phone app offers these when an umpire sets up a match. A match keeps its venue as text, so changing this list never changes a match."
      />
      <div className="grid items-start gap-6 md:grid-cols-[3fr_2fr]">
        <Card>
          <CardContent className="space-y-3">
            {venues.items.length === 0 && <p className="text-muted-foreground">No venues yet.</p>}
            {venues.items.map((v) => (
              <div key={v.id} className="flex flex-wrap items-end gap-2">
                <ActionForm action={renameVenue} submitLabel="Rename" variant="outline" inline>
                  <input type="hidden" name="id" value={v.id} />
                  <Input name="name" defaultValue={v.name} required minLength={2} maxLength={120} aria-label={`Name of ${v.name}`} className="w-72" />
                </ActionForm>
                <ActionForm
                  action={deleteVenue}
                  submitLabel="Delete"
                  variant="destructive"
                  inline
                  confirm={{ title: `Delete ${v.name}?`, description: "Matches played there keep the venue's name." }}
                >
                  <input type="hidden" name="id" value={v.id} />
                </ActionForm>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Add a venue</CardTitle>
            <CardDescription>The ground, as umpires would know it, e.g. Banbury Road, Oxford.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={createVenue} submitLabel="Add venue" className="max-w-none">
              <TextField label="Name" name="name" required minLength={2} maxLength={120} />
            </ActionForm>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
