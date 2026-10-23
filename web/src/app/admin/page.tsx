import { Building2, ClipboardList, FileUp, History, Inbox, MapPin, Trophy, UserPlus, Users, Webhook } from "lucide-react";
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
        <Tile href="/admin/webhooks" icon={<Webhook />} title="Webhooks">
          Results sent to leagues&apos; and clubs&apos; own systems
        </Tile>
        <Tile href="/admin/audit" icon={<History />} title="Audit log">
          Who changed what, and when
        </Tile>
      </div>
    </div>
  );
}

function Tile({ href, icon, title, count, children }: { href: string; icon: ReactNode; title: string; count?: number; children: ReactNode }) {
  return (
    <Link href={href} className="text-foreground no-underline hover:no-underline">
      <Card className="h-full transition-[border-color,box-shadow] hover:border-foreground/15 hover:shadow-md hover:shadow-black/5">
        <CardHeader className="gap-3">
          <span className="flex items-center justify-between">
            <span className="inline-flex size-10 items-center justify-center rounded-full bg-primary/12 text-primary [&_svg]:size-5">{icon}</span>
            {!!count && <Badge>{count}</Badge>}
          </span>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{children}</CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
