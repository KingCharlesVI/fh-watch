import { Filter } from "lucide-react";
import Link from "next/link";
import { FilterSelect } from "@/components/FilterSelect";
import { PageHeader } from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import type { Page, User } from "@/lib/types";

export const metadata = { title: "Users" };

type Search = { q?: string; role?: string; deletion?: string; cursor?: string; deleted?: string };
const ROLE_NAMES = { admin: "Admin", umpire: "Umpire", club_admin: "Club admin" } as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requireAdmin("/admin/users");
  const sp = await searchParams;
  const role = sp.role && sp.role in ROLE_NAMES ? sp.role : undefined;
  const users = await api<Page<User>>("/v1/users", {
    query: { q: sp.q, role, deletionRequested: sp.deletion ? true : undefined, cursor: sp.cursor, limit: 50 },
  });
  const next = new URLSearchParams(Object.entries({ q: sp.q, role, deletion: sp.deletion }).filter((e): e is [string, string] => !!e[1]));
  if (users.nextCursor) next.set("cursor", users.nextCursor);

  return (
    <div className="space-y-6">
      <PageHeader title="Users" back={{ href: "/admin", label: "Admin" }} description={sp.deleted ? "User deleted." : undefined} />
      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <Field className="w-64">
              <FieldLabel htmlFor="q">Search</FieldLabel>
              <Input id="q" name="q" type="search" defaultValue={sp.q} placeholder="Name or email" />
            </Field>
            <Field className="w-40">
              <FieldLabel>Role</FieldLabel>
              <FilterSelect
                name="role"
                defaultValue={role ?? "any"}
                options={[{ value: "any", label: "Any" }, ...Object.entries(ROLE_NAMES).map(([value, label]) => ({ value, label }))]}
              />
            </Field>
            <Field orientation="horizontal" className="w-auto pb-2">
              <Checkbox id="deletion" name="deletion" value="1" defaultChecked={!!sp.deletion} />
              <FieldLabel htmlFor="deletion" className="font-normal">
                Asked to be deleted
              </FieldLabel>
            </Field>
            <Button type="submit" variant="secondary">
              <Filter /> Filter
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.items.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="pl-4">
                  <Link href={`/admin/users/${u.id}`}>{u.displayName}</Link>{" "}
                  {u.deletionRequested && <Badge variant="destructive">Wants deleting</Badge>}{" "}
                  {!u.emailVerified && <Badge variant="outline">Unconfirmed</Badge>}
                </TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell>{u.roles.map((r) => ROLE_NAMES[r]).join(", ")}</TableCell>
                <TableCell>{formatDate(u.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {users.nextCursor && (
        <Button variant="outline" asChild>
          <Link href={`?${next.toString()}`}>More</Link>
        </Button>
      )}
    </div>
  );
}
