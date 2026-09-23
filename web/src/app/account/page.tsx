import { TriangleAlert } from "lucide-react";
import { changePassword, requestClub, requestDeletion, updateProfile } from "@/app/actions/account";
import { ActionForm } from "@/components/ActionForm";
import { ClubRequestFields } from "@/components/ClubRequestFields";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { requireUser } from "@/lib/session";
import type { Club, ClubRequest, Items } from "@/lib/types";

export const metadata = { title: "Your account" };

const ROLE_NAMES = { admin: "Admin", umpire: "Umpire", club_admin: "Club admin" } as const;

export default async function AccountPage() {
  const user = await requireUser("/account");
  const [clubs, requests] = await Promise.all([api<Items<Club>>("/v1/clubs"), api<Items<ClubRequest>>("/v1/club-requests")]);
  const clubName = (id: string | null) => clubs.items.find((c) => c.id === id)?.name;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Your account"
        description={
          <span className="flex flex-wrap items-center gap-1.5">
            {user.email}
            {user.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {ROLE_NAMES[r]}
                {r === "club_admin" && user.clubId && ` · ${clubName(user.clubId)}`}
              </Badge>
            ))}
          </span>
        }
      />

      <div className="grid items-start gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Name</CardTitle>
            <CardDescription>Shown on matches you umpire.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={updateProfile} submitLabel="Save" className="max-w-none">
              <TextField label="Display name" name="displayName" defaultValue={user.displayName} required maxLength={80} />
            </ActionForm>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Changing it signs out your other devices.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm action={changePassword} submitLabel="Change password" className="max-w-none">
              <TextField label="Current password" name="currentPassword" type="password" autoComplete="current-password" required />
              <TextField label="New password" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
              <TextField label="New password again" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
            </ActionForm>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clubs</CardTitle>
          <CardDescription>Ask to administer your club, or for a missing club to be added.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {requests.items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asked</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{formatDate(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-normal">
                      {r.clubName ? `Add ${r.clubName}${r.wantsAdmin ? " and make me its admin" : ""}` : `Club admin for ${clubName(r.clubId) ?? "a club"}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                        {r.status[0]!.toUpperCase() + r.status.slice(1)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <ActionForm action={requestClub} submitLabel="Send request">
            <ClubRequestFields clubs={clubs.items} />
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle>Delete account</CardTitle>
          <CardDescription>An admin deletes it for you. Matches you&apos;ve published stay online, credited to a deleted user.</CardDescription>
        </CardHeader>
        <CardContent>
          {user.deletionRequested ? (
            <Alert>
              <TriangleAlert />
              <AlertTitle>You&apos;ve asked for your account to be deleted. An admin will do it shortly.</AlertTitle>
            </Alert>
          ) : (
            <ActionForm
              action={requestDeletion}
              submitLabel="Ask to delete my account"
              variant="destructive"
              confirm={{ title: "Delete your account?", description: "An admin will delete it. You can't undo this once they have.", action: "Ask to delete it" }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
