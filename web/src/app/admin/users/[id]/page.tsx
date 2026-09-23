import { ROLES } from "@fh/shared";
import { TriangleAlert } from "lucide-react";
import { notFound } from "next/navigation";
import { deleteUser, updateUser } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { FilterSelect } from "@/components/FilterSelect";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { api, apiOrNull } from "@/lib/api";
import { requireAdmin } from "@/lib/session";
import type { Club, Items, User } from "@/lib/types";

export const metadata = { title: "Edit user" };

const ROLE_INFO = {
  admin: ["Admin", "Can do everything."],
  umpire: ["Umpire", "Uploads and edits their own matches."],
  club_admin: ["Club admin", "Sees every match their club's teams played."],
} as const;

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAdmin(`/admin/users/${id}`);
  const [user, clubs] = await Promise.all([apiOrNull<User>(`/v1/users/${id}`), api<Items<Club>>("/v1/clubs")]);
  if (!user) notFound();
  const isMe = user.id === me.id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.displayName}
        back={{ href: "/admin/users", label: "Users" }}
        description={`${user.email} · ${user.emailVerified ? "email confirmed" : "email not confirmed"}`}
      />
      {user.deletionRequested && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>This user has asked for their account to be deleted.</AlertTitle>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details and roles</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={updateUser} submitLabel="Save">
            <input type="hidden" name="id" value={user.id} />
            <TextField label="Display name" name="displayName" defaultValue={user.displayName} required maxLength={80} />
            <FieldSet>
              <FieldLegend variant="label">Roles</FieldLegend>
              {ROLES.map((r) => (
                <Field key={r} orientation="horizontal">
                  <Checkbox id={`role_${r}`} name={`role_${r}`} defaultChecked={user.roles.includes(r)} disabled={isMe && r === "admin"} />
                  <FieldContent>
                    <FieldLabel htmlFor={`role_${r}`}>{ROLE_INFO[r][0]}</FieldLabel>
                    <FieldDescription>{ROLE_INFO[r][1]}</FieldDescription>
                  </FieldContent>
                </Field>
              ))}
              {/* A disabled checkbox isn't submitted; you keep your own admin role. */}
              {isMe && <input type="hidden" name="role_admin" value="on" />}
            </FieldSet>
            <Field>
              <FieldLabel>Club</FieldLabel>
              <FilterSelect
                name="clubId"
                defaultValue={user.clubId ?? "none"}
                options={[{ value: "none", label: "None" }, ...clubs.items.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <FieldDescription>Needed for club admins; ignored otherwise.</FieldDescription>
            </Field>
          </ActionForm>
        </CardContent>
      </Card>

      {!isMe && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>Delete user</CardTitle>
            <CardDescription>Their matches stay, credited to a deleted user.</CardDescription>
          </CardHeader>
          <CardContent>
            <ActionForm
              action={deleteUser}
              submitLabel="Delete user"
              variant="destructive"
              confirm={{ title: `Delete ${user.displayName}?`, description: "This deletes their account for good. Their matches stay." }}
            >
              <input type="hidden" name="id" value={user.id} />
            </ActionForm>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
