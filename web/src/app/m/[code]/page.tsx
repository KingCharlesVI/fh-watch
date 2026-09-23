import { hasRole } from "@fh/shared";
import { Settings } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MatchView } from "@/components/MatchView";
import { Button } from "@/components/ui/button";
import { apiOrNull } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { getCurrentUser } from "@/lib/session";
import type { FullMatch } from "@/lib/types";

type Params = Promise<{ code: string }>;

const loadMatch = cache((code: string) => apiOrNull<FullMatch>(`/v1/m/${encodeURIComponent(code)}`));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const data = await loadMatch((await params).code);
  if (!data) return { title: "Match not found" };
  const { match: m } = data;
  const title = `${m.home.name} ${m.home.score}–${m.away.score} ${m.away.name}`;
  return {
    title,
    description: [formatDate(m.playedAt), m.competition, m.venue].filter(Boolean).join(" · "),
    openGraph: { title, type: "article" },
  };
}

/** The public page for a published match: what a shared link or QR code opens. */
export default async function PublicMatchPage({ params }: { params: Params }) {
  const data = await loadMatch((await params).code);
  if (!data) notFound();
  const user = await getCurrentUser();
  const canManage =
    user && (hasRole(user, "admin") || (hasRole(user, "umpire") && data.match.umpires.some((u) => u.userId === user.id)));

  return (
    <div className="space-y-4">
      {canManage && (
        <Button variant="outline" asChild>
          <Link href={`/matches/${data.match.id}`}>
            <Settings /> Manage this match
          </Link>
        </Button>
      )}
      <MatchView data={data} downloadBase={`/matches/${data.match.id}/export`} />
    </div>
  );
}
