import { Building2, ClipboardList, FileUp, Inbox, MapPin, Trophy, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import type { AccessRequest, ClubRequest, Items, Page, User } from "@/lib/types";

export const metadata = { title: "Admin" };

export default async function AdminPage() {
  await requireAdmin("/admin");
  const [requests, access, deletions] = await Promise.all([
    api<Items<ClubRequest>>("/v1/club-requests", { query: { status: "pending" } }),
    api<Items<AccessRequest>>("/v1/access-requests", { query: { status: "pending" } }),
    api<Page<User>>("/v1/users", { query: { deletionRequested: true, limit: 100 } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Admin" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Tile href="/admin/requests" icon={<Inbox />} title="Club requests" count={requests.items.length}>
          {requests.items.length ? "Waiting for review" : "Nothing waiting"}
        </Tile>
        <Tile href="/admin/access-requests" icon={<UserPlus />} title="Testing requests" count={access.items.length}>
          {access.items.length ? "Umpires asking to join" : "Nobody waiting"}
        </Tile>
        <Tile href="/admin/users" icon={<Users />} title="Users" count={deletions.items.length}>
          {deletions.items.length ? "Asked to be deleted" : "Roles, clubs and accounts"}
        </Tile>
        <Tile href="/admin/clubs" icon={<Building2 />} title="Clubs and teams">
          Add, rename and remove
        </Tile>
        <Tile href="/admin/venues" icon={<MapPin />} title="Venues">
          Grounds offered when setting up a match
        </Tile>
        <Tile href="/admin/competitions" icon={<Trophy />} title="Competitions">
          Leagues and cups offered when editing a match
        </Tile>
        <Tile href="/admin/import" icon={<FileUp />} title="Import">
          Many clubs and teams, venues or competitions at once
        </Tile>
        <Tile href="/dashboard?view=all" icon={<ClipboardList />} title="All matches">
          Drafts included
        </Tile>
      </div>
    </div>
  );
}

function Tile({ href, icon, title, count, children }: { href: string; icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return (
    <Link href={href} className="text-foreground no-underline hover:no-underline">
      <Card className="h-full transition-colors hover:bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 [&_svg]:size-4 [&_svg]:text-muted-foreground">
            {icon}
            {title}
            {!!count && <Badge className="ml-auto">{count}</Badge>}
          </CardTitle>
          <CardDescription>{children}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
