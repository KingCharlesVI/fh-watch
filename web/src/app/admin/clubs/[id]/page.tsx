import { canEditTeams, hasRole } from "@fh/shared";
import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createTeam, deleteClub, deleteTeam, removeClubLogo, renameClub, renameTeam, setClubLogo } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { ClubBadge } from "@/components/ClubBadge";
import { LogoField } from "@/components/LogoField";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiOrNull } from "@/lib/api";
import { requireUser } from "@/lib/session";
import type { ClubWithTeams } from "@/lib/types";

export const metadata = { title: "Manage club" };

/** Admins manage any club here; a club admin manages their own club's teams. */
export default async function ManageClubPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/admin/clubs/${id}`);
  if (!canEditTeams(user, id)) redirect("/dashboard");
  const club = await apiOrNull<ClubWithTeams>(`/v1/clubs/${id}`);
  if (!club) notFound();
  const isAdmin = hasRole(user, "admin");

  return (
    <div className="space-y-6">
      <PageHeader
        title={club.name}
        back={isAdmin ? { href: "/admin/clubs", label: "Clubs" } : { href: "/dashboard", label: "Dashboard" }}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/clubs/${club.slug}`}>
              <ExternalLink /> Public page
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>Umpires link matches to these teams.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {club.teams.length === 0 && <p className="text-muted-foreground">No teams yet.</p>}
          {club.teams.map((t) => (
            <div key={t.id} className="flex flex-wrap items-end gap-2">
              <ActionForm action={renameTeam} submitLabel="Rename" variant="outline" inline>
                <input type="hidden" name="clubId" value={club.id} />
                <input type="hidden" name="teamId" value={t.id} />
                <Input name="name" defaultValue={t.name} required minLength={2} maxLength={100} aria-label={`Name of ${t.name}`} className="w-56" />
              </ActionForm>
              {isAdmin && (
                <ActionForm
                  action={deleteTeam}
                  submitLabel="Delete"
                  variant="destructive"
                  inline
                  confirm={{ title: `Delete ${t.name}?`, description: "Its matches keep the team name but lose the link to this club." }}
                >
                  <input type="hidden" name="clubId" value={club.id} />
                  <input type="hidden" name="teamId" value={t.id} />
                </ActionForm>
              )}
            </div>
          ))}
          <div className="border-t pt-4">
            <ActionForm action={createTeam} submitLabel="Add team" inline>
              <input type="hidden" name="clubId" value={club.id} />
              <Input name="name" placeholder="e.g. Men's 1s" required minLength={2} maxLength={100} aria-label="New team name" className="w-56" />
            </ActionForm>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Club details</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={renameClub} submitLabel="Save">
                <input type="hidden" name="id" value={club.id} />
                <TextField label="Name" name="name" defaultValue={club.name} required minLength={2} maxLength={100} />
                <TextField
                  label="Web address"
                  hint={`/clubs/${club.slug}. Changing it breaks old links.`}
                  name="slug"
                  defaultValue={club.slug}
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  maxLength={60}
                />
              </ActionForm>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Logo</CardTitle>
              <CardDescription>Shows on the club's pages in place of its initials.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-start gap-6">
              <ClubBadge name={club.name} logoUrl={club.logoUrl} size="lg" />
              <div className="grid flex-1 gap-4">
                <ActionForm action={setClubLogo} submitLabel={club.logoUrl ? "Replace logo" : "Add logo"}>
                  <input type="hidden" name="id" value={club.id} />
                  <LogoField label={club.logoUrl ? "New logo" : "Logo"} hint="PNG, JPEG or WebP, up to 512 KB." />
                </ActionForm>
                {club.logoUrl && (
                  <ActionForm
                    action={removeClubLogo}
                    submitLabel="Remove logo"
                    variant="outline"
                    inline
                    confirm={{ title: "Remove the logo?", description: "The club's initials show instead." }}
                  >
                    <input type="hidden" name="id" value={club.id} />
                  </ActionForm>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle>Delete club</CardTitle>
              <CardDescription>Deletes its teams too. Its club admins lose that role; matches keep their team names.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm
                action={deleteClub}
                submitLabel="Delete club"
                variant="destructive"
                confirm={{ title: `Delete ${club.name}?`, description: "This deletes the club and all its teams. It can't be undone." }}
              >
                <input type="hidden" name="id" value={club.id} />
              </ActionForm>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
