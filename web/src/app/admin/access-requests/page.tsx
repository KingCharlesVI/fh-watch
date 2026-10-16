import { Apple, Smartphone } from "lucide-react";
import { reviewAccessRequest } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import type { AccessRequest, Items } from "@/lib/types";

export const metadata = { title: "Testing requests" };

const TESTS = {
  "google-play": { label: "Google Play", icon: Smartphone },
  testflight: { label: "TestFlight", icon: Apple },
} as const;

/** Umpires asking for a place in a test, from the landing page's forms. */
export default async function AccessRequestsPage() {
  await requireAdmin("/admin/access-requests");
  const all = await api<Items<AccessRequest>>("/v1/access-requests");
  const waiting = all.items.filter((r) => r.status === "pending");
  const decided = all.items.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Testing requests"
        description="Approving sends them the invitation and how to install both apps. Denying says so, with your reason. Either way the email goes straight away."
        back={{ href: "/admin", label: "Admin" }}
      />

      {waiting.length === 0 ? (
        <p className="text-muted-foreground">Nobody waiting.</p>
      ) : (
        <div className="space-y-4">
          {waiting.map((r) => (
            <Card key={r.id}>
              <RequestHeader request={r} />
              {r.notes && (
                <CardContent>
                  <p className="text-sm whitespace-pre-line">{r.notes}</p>
                </CardContent>
              )}
              <CardFooter className="flex-col items-stretch gap-3">
                <ActionForm action={reviewAccessRequest} submitLabel="Approve" inline>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="approve" />
                  <Input
                    name="note"
                    maxLength={1000}
                    className="sm:w-96"
                    aria-label="Anything to add to their email"
                    placeholder="Anything to add to their email (optional)"
                  />
                </ActionForm>
                <ActionForm
                  action={reviewAccessRequest}
                  submitLabel="Deny"
                  variant="outline"
                  inline
                  confirm={{
                    title: `Turn down ${r.name}?`,
                    description: "They'll be emailed to say there's no place for them at the moment, with your reason if you gave one.",
                    action: "Deny and email",
                  }}
                >
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="decision" value="deny" />
                  <Input name="note" maxLength={1000} className="sm:w-96" aria-label="Why, in their email" placeholder="Why, in their email (optional)" />
                </ActionForm>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {decided.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-heading text-xl font-semibold tracking-tight">Already answered</h2>
          {decided.map((r) => (
            <Card key={r.id} className="bg-muted/40">
              <RequestHeader request={r} />
              {r.decisionNote && (
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-line">{r.decisionNote}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function RequestHeader({ request: r }: { request: AccessRequest }) {
  const test = TESTS[r.kind];
  return (
    <CardHeader>
      <CardTitle className="flex flex-wrap items-center gap-2">
        <test.icon className="size-4 text-muted-foreground" />
        {r.name}
        <Badge variant="outline">{test.label}</Badge>
        {r.status !== "pending" && (
          <Badge variant={r.status === "approved" ? "default" : "secondary"}>{r.status === "approved" ? "Approved" : "Denied"}</Badge>
        )}
      </CardTitle>
      <CardDescription>
        <a href={`mailto:${r.email}`}>{r.email}</a> · {r.devices} · asked {formatDate(r.createdAt)}
        {r.reviewedAt && ` · answered ${formatDateTime(r.reviewedAt)}`}
      </CardDescription>
    </CardHeader>
  );
}
