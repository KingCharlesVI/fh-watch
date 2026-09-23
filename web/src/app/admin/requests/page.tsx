import { TriangleAlert } from "lucide-react";
import { reviewRequest } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import type { Club, ClubRequest, Items } from "@/lib/types";

export const metadata = { title: "Club requests" };

export default async function RequestsPage() {
  await requireAdmin("/admin/requests");
  const [requests, clubs] = await Promise.all([
    api<Items<ClubRequest>>("/v1/club-requests", { query: { status: "pending" } }),
    api<Items<Club>>("/v1/clubs"),
  ]);
  const clubName = (id: string | null) => clubs.items.find((c) => c.id === id)?.name ?? "a club";

  return (
    <div className="space-y-6">
      <PageHeader title="Club requests" back={{ href: "/admin", label: "Admin" }} />
      {requests.items.length === 0 ? (
        <p className="text-muted-foreground">Nothing waiting for review.</p>
      ) : (
        requests.items.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>
                {r.clubName ? `Add “${r.clubName}”${r.wantsAdmin ? " and make them its club admin" : ""}` : `Club admin for ${clubName(r.clubId)}`}
              </CardTitle>
              <CardDescription>
                {r.user?.displayName} ({r.user?.email}) · asked {formatDate(r.createdAt)}
              </CardDescription>
            </CardHeader>
            {r.clubName && clubs.items.some((c) => c.name.toLowerCase() === r.clubName!.toLowerCase()) && (
              <CardContent>
                <Alert>
                  <TriangleAlert />
                  <AlertTitle>A club with this name already exists. Reject this, and they can ask to administer that club instead.</AlertTitle>
                </Alert>
              </CardContent>
            )}
            <CardFooter className="gap-2">
              <ActionForm action={reviewRequest} submitLabel="Approve" inline>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="approve" />
              </ActionForm>
              <ActionForm action={reviewRequest} submitLabel="Reject" variant="outline" inline>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="decision" value="reject" />
              </ActionForm>
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}
