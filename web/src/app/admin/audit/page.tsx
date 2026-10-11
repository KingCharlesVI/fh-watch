import { Filter, X } from "lucide-react";
import Link from "next/link";
import { FilterSelect } from "@/components/FilterSelect";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import type { AuditEntry, Page } from "@/lib/types";

export const metadata = { title: "Audit log" };

type Search = { entity?: string; entityId?: string; actorId?: string; action?: string; cursor?: string };

const ENTITIES: Record<string, string> = {
  match: "Matches",
  club: "Clubs",
  team: "Teams",
  venue: "Venues",
  competition: "Competitions",
  user: "Users",
  club_request: "Club requests",
  access_request: "Testing requests",
  club_umpire: "Club umpires",
  fixture: "Fixtures",
  appointment: "Appointments",
  webhook: "Webhooks",
};

/** Where a record can be looked at, if anywhere. */
function recordHref(e: AuditEntry): string | null {
  switch (e.entity) {
    case "match":
      return `/matches/${e.entityId}`;
    case "user":
      return `/admin/users/${e.entityId}`;
    case "club":
      return `/admin/clubs/${e.entityId}`;
    default:
      return null;
  }
}

/** Who changed what, newest first: every write the API makes is recorded. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin("/admin/audit");
  const sp = await searchParams;
  const entity = sp.entity && sp.entity in ENTITIES ? sp.entity : undefined;
  const filters = { entity, entityId: sp.entityId, actorId: sp.actorId, action: sp.action };
  const log = await api<Page<AuditEntry>>("/v1/audit", { query: { ...filters, cursor: sp.cursor, limit: 50 } });
  const query = (extra: Record<string, string | undefined>) =>
    `?${new URLSearchParams(Object.entries({ ...filters, ...extra }).filter((e): e is [string, string] => !!e[1])).toString()}`;
  const narrowed = sp.entityId || sp.actorId;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit log" back={{ href: "/admin", label: "Admin" }} description="Every change made through the apps and the website, and who made it." />
      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <Field className="w-48">
              <FieldLabel>Records</FieldLabel>
              <FilterSelect
                name="entity"
                defaultValue={entity ?? "any"}
                options={[{ value: "any", label: "All" }, ...Object.entries(ENTITIES).map(([value, label]) => ({ value, label }))]}
              />
            </Field>
            <Field className="w-48">
              <FieldLabel htmlFor="action">Action</FieldLabel>
              <Input id="action" name="action" defaultValue={sp.action} placeholder="e.g. delete" />
            </Field>
            {sp.entityId && <input type="hidden" name="entityId" value={sp.entityId} />}
            {sp.actorId && <input type="hidden" name="actorId" value={sp.actorId} />}
            <Button type="submit" variant="secondary">
              <Filter /> Filter
            </Button>
            {narrowed && (
              <Button variant="ghost" asChild>
                <Link href={query({ entityId: undefined, actorId: undefined })}>
                  <X /> {sp.actorId ? "All people" : "All records"}
                </Link>
              </Button>
            )}
          </form>
        </CardContent>
      </Card>
      {log.items.length === 0 ? (
        <p className="text-muted-foreground">Nothing recorded{entity || sp.action || narrowed ? " that matches" : ""}.</p>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">When</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>What</TableHead>
                <TableHead>Record</TableHead>
                <TableHead className="pr-4">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {log.items.map((e) => {
                const href = recordHref(e);
                return (
                  <TableRow key={e.id} className="align-top">
                    <TableCell className="pl-4 whitespace-nowrap">{formatDateTime(e.at)}</TableCell>
                    <TableCell>
                      {e.actor ? <Link href={query({ actorId: e.actor.id, cursor: undefined })}>{e.actor.displayName}</Link> : <span className="text-muted-foreground">System</span>}
                    </TableCell>
                    <TableCell>
                      {e.action.replaceAll("_", " ")} {e.entity.replaceAll("_", " ")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      <Link href={query({ entity: e.entity, entityId: e.entityId })} title="Everything that happened to it">
                        {e.entityId.length > 13 ? `${e.entityId.slice(0, 8)}…` : e.entityId}
                      </Link>
                      {href && (
                        <>
                          {" · "}
                          <Link href={href} className="font-sans">
                            Open
                          </Link>
                        </>
                      )}
                    </TableCell>
                    <TableCell className="pr-4">
                      {e.diff !== null && (
                        <details>
                          <summary className="cursor-pointer text-sm text-muted-foreground">Show</summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{JSON.stringify(e.diff, null, 2)}</pre>
                        </details>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      {log.nextCursor && (
        <Button variant="outline" asChild>
          <Link href={query({ cursor: log.nextCursor })}>More</Link>
        </Button>
      )}
    </div>
  );
}
