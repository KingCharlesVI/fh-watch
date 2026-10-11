import Link from "next/link";
import { createWebhook, deleteWebhook, newWebhookSecret, pingWebhook, setWebhookEnabled } from "@/app/actions/webhooks";
import { ActionForm } from "@/components/ActionForm";
import { FilterSelect } from "@/components/FilterSelect";
import { TextField } from "@/components/TextField";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { Webhook, WebhookDelivery } from "@/lib/types";

/** Where the format, the events and how to check the signature are written up. */
export const WEBHOOK_DOCS = "https://docs.fhmatchcentre.com/#/technical/webhooks";

const EVENTS: Record<WebhookDelivery["event"], string> = {
  "match.published": "Published",
  "match.updated": "Changed",
  "match.unpublished": "Unpublished",
  "match.deleted": "Deleted",
  ping: "Test",
};

function DeliveryStatus({ d }: { d: WebhookDelivery }) {
  if (d.status === "delivered") return <Badge>Delivered</Badge>;
  if (d.status === "failed") return <Badge variant="destructive">Failed</Badge>;
  return <Badge variant="secondary">{d.attempts ? `Retrying (${d.attempts} tried)` : "Waiting"}</Badge>;
}

/** Adding a webhook. `owners` offers a choice of club or competition; with one, it's fixed. */
export function AddWebhook({ owners }: { owners: { value: string; label: string }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a webhook</CardTitle>
        <CardDescription>
          A web address told within half a minute whenever a match is published, changed after publishing, unpublished or deleted. It gets the match
          as its public page shows it, signed with a secret so the receiver can tell it came from here. <Link href={WEBHOOK_DOCS}>What it sends</Link>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm action={createWebhook} submitLabel="Add webhook" pendingLabel="Adding…">
          {owners.length === 1 ? (
            <input type="hidden" name="owner" value={owners[0]!.value} />
          ) : (
            <Field>
              <FieldLabel>For</FieldLabel>
              <FilterSelect name="owner" defaultValue={owners[0]?.value ?? ""} options={owners} />
            </Field>
          )}
          <TextField label="Address" name="url" type="url" required placeholder="https://example.com/hockey-results" hint="Must start with https://." />
          <TextField label="Description (optional)" name="description" maxLength={200} placeholder="e.g. the league's results table" />
        </ActionForm>
      </CardContent>
    </Card>
  );
}

/** A webhook with its controls and last deliveries. `owner` says whose it is, where that isn't obvious. */
export function WebhookCard({ webhook: w, deliveries, owner }: { webhook: Webhook; deliveries: WebhookDelivery[]; owner?: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 break-all">
          {w.url}
          {w.enabled ? (
            w.failures > 0 && <Badge variant="destructive">{w.failures} failed in a row</Badge>
          ) : (
            <Badge variant="outline">Off</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {[owner, w.description, `added ${formatDateTime(w.createdAt)}`].filter(Boolean).join(" · ")}
          {!w.enabled && w.failures >= 5 && " · turned off after 5 deliveries in a row failed"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queued</TableHead>
                <TableHead>Event</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last answer</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.slice(0, 10).map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="whitespace-nowrap">{formatDateTime(d.createdAt)}</TableCell>
                  <TableCell>
                    {EVENTS[d.event]}
                    {d.matchId && d.event !== "match.deleted" && (
                      <>
                        {" · "}
                        <Link href={`/matches/${d.matchId}`}>match</Link>
                      </>
                    )}
                  </TableCell>
                  <TableCell>
                    <DeliveryStatus d={d} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {d.error ?? (d.responseStatus ? `${d.responseStatus}` : "")}
                    {d.status === "pending" && d.nextAttemptAt && d.attempts > 0 && ` Next try ${formatDateTime(d.nextAttemptAt)}.`}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-start gap-2">
        {w.enabled && (
          <ActionForm action={pingWebhook} submitLabel="Send test" variant="outline" inline>
            <input type="hidden" name="id" value={w.id} />
          </ActionForm>
        )}
        <ActionForm action={setWebhookEnabled} submitLabel={w.enabled ? "Turn off" : "Turn on"} variant="outline" inline>
          <input type="hidden" name="id" value={w.id} />
          <input type="hidden" name="enabled" value={String(!w.enabled)} />
        </ActionForm>
        <ActionForm
          action={newWebhookSecret}
          submitLabel="New secret"
          variant="outline"
          className="max-w-none gap-2"
          confirm={{ title: "Replace the secret?", description: "The old one stops working straight away, so the receiver needs the new one before it can trust deliveries again.", action: "Replace" }}
        >
          <input type="hidden" name="id" value={w.id} />
        </ActionForm>
        <ActionForm
          action={deleteWebhook}
          submitLabel="Delete"
          variant="destructive"
          inline
          confirm={{ title: "Delete this webhook?", description: "Nothing more is sent to it, and its deliveries are forgotten." }}
        >
          <input type="hidden" name="id" value={w.id} />
        </ActionForm>
      </CardFooter>
    </Card>
  );
}
