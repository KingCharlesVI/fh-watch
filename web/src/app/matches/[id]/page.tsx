import { hasRole } from "@fh/shared";
import { Clock, Link2, Pencil, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteMatch, publishMatch, unpublishMatch } from "@/app/actions/matches";
import { ActionForm } from "@/components/ActionForm";
import { CopyButton } from "@/components/CopyButton";
import { StatusBadges } from "@/components/MatchList";
import { MatchView } from "@/components/MatchView";
import { PageHeader } from "@/components/PageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, apiOrNull } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { FullMatch, Items, Revision } from "@/lib/types";

export const metadata = { title: "Manage match" };

const SOURCES = { watch: "Watch", mobile: "Phone app", web: "Website" } as const;

/** The signed-in view of a match, drafts included, with the umpire's controls. */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/matches/${id}`);
  const data = await apiOrNull<FullMatch>(`/v1/matches/${id}`);
  if (!data) notFound();
  const { match: m } = data;

  const isAdmin = hasRole(user, "admin");
  const canEdit = isAdmin || (hasRole(user, "umpire") && m.umpires.some((u) => u.userId === user.id));
  const revisions = await api<Items<Revision>>(`/v1/matches/${id}/revisions`).catch((err) => {
    if (err instanceof ApiError && err.status === 403) return null;
    throw err;
  });
  const unlinked = m.home.teamId === null || m.away.teamId === null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${m.home.name} v ${m.away.name}`}
        back={{ href: "/dashboard", label: "Dashboard" }}
        description={
          <span className="flex flex-wrap gap-1.5">
            <StatusBadges match={m} />
          </span>
        }
        actions={
          <>
            {canEdit && (
              <>
                <Button asChild>
                  <Link href={`/matches/${id}/edit`}>
                    <Pencil /> Edit match
                  </Link>
                </Button>
                {m.status === "draft" ? (
                  <ActionForm action={publishMatch} submitLabel="Publish" variant="outline" inline>
                    <input type="hidden" name="id" value={id} />
                  </ActionForm>
                ) : (
                  <ActionForm
                    action={unpublishMatch}
                    submitLabel="Unpublish"
                    variant="outline"
                    inline
                    confirm={{ title: "Unpublish this match?", description: "The share link will show nothing, and the match won't publish itself again." }}
                  >
                    <input type="hidden" name="id" value={id} />
                  </ActionForm>
                )}
              </>
            )}
            {isAdmin && (
              <ActionForm
                action={deleteMatch}
                submitLabel="Delete"
                variant="destructive"
                inline
                confirm={{ title: "Delete this match?", description: "It disappears straight away and is erased for good after 30 days." }}
              >
                <input type="hidden" name="id" value={id} />
              </ActionForm>
            )}
          </>
        }
      />

      {m.status === "draft" && m.autoPublishAt && (
        <Alert>
          <Clock />
          <AlertTitle>This match is a draft</AlertTitle>
          <AlertDescription>It publishes itself at {formatDateTime(m.autoPublishAt)} unless you publish or unpublish it first.</AlertDescription>
        </Alert>
      )}
      {canEdit && unlinked && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
          <TriangleAlert />
          <AlertTitle>{m.home.teamId === null && m.away.teamId === null ? "Neither team is linked" : "One team isn't linked"}</AlertTitle>
          <AlertDescription className="text-current/90">
            <p>
              Until both teams are linked to clubs, this match won&apos;t appear on club pages. <Link href={`/matches/${id}/edit`}>Link the teams</Link>.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {m.status === "published" && m.shareUrl && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <Link href={`/m/${m.shareCode}`} className="truncate">
                {m.shareUrl}
              </Link>
            </span>
            <CopyButton value={m.shareUrl} />
          </CardContent>
        </Card>
      )}

      <MatchView data={data} downloadBase={`/matches/${id}/export`} />

      {revisions && (
        <Card>
          <CardHeader>
            <CardTitle>Edit history</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Revision</TableHead>
                  <TableHead>Saved</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revisions.items.map((r) => (
                  <TableRow key={r.revision}>
                    <TableCell>{r.revision}</TableCell>
                    <TableCell>{formatDateTime(r.createdAt)}</TableCell>
                    <TableCell>{SOURCES[r.source]}</TableCell>
                    <TableCell>{r.createdBy?.displayName ?? "Deleted user"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
