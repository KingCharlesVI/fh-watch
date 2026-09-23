import { hasRole } from "@fh/shared";
import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { apiOrNull } from "@/lib/api";
import { requireUser } from "@/lib/session";
import type { FullMatch } from "@/lib/types";
import { MatchEditor } from "./MatchEditor";

export const metadata = { title: "Edit match" };

export default async function EditMatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/matches/${id}/edit`);
  const data = await apiOrNull<FullMatch>(`/v1/matches/${id}`);
  if (!data) notFound();
  const canEdit = hasRole(user, "admin") || (hasRole(user, "umpire") && data.match.umpires.some((u) => u.userId === user.id));
  if (!canEdit) redirect(`/matches/${id}`);

  return (
    <>
      <PageHeader title={`Edit ${data.match.home.name} v ${data.match.away.name}`} back={{ href: `/matches/${id}`, label: "Back to the match" }} />
      <MatchEditor initial={data} />
    </>
  );
}
