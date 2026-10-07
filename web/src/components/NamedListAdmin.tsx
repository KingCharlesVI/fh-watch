import { type ListName, createListItem, deleteListItem, mergeListItem, renameListItem } from "@/app/actions/admin";
import { ActionForm } from "@/components/ActionForm";
import { MergeCard } from "@/components/MergeCard";
import { PageHeader } from "@/components/PageHeader";
import { TextField } from "@/components/TextField";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import type { Items } from "@/lib/types";

/**
 * An admin page for one of the lists umpires pick from (venues, competitions): every item,
 * renamed or deleted in place, and forms to add one and to merge duplicates. A match keeps
 * the name as text: renaming or deleting doesn't change matches, merging does.
 */
export async function NamedListAdmin({
  list,
  title,
  noun,
  description,
  example,
}: {
  list: ListName;
  title: string;
  /** Lower case, e.g. "venue". */
  noun: string;
  description: string;
  example: string;
}) {
  const items = await api<Items<{ id: string; name: string }>>(`/v1/${list}`);
  return (
    <div className="space-y-6">
      <PageHeader title={title} back={{ href: "/admin", label: "Admin" }} description={description} />
      <div className="grid items-start gap-6 md:grid-cols-[3fr_2fr]">
        <Card>
          <CardContent className="space-y-3">
            {items.items.length === 0 && <p className="text-muted-foreground">No {noun}s yet.</p>}
            {items.items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-end gap-2">
                <ActionForm action={renameListItem} submitLabel="Rename" variant="outline" inline>
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="id" value={item.id} />
                  <Input name="name" defaultValue={item.name} required minLength={2} maxLength={120} aria-label={`Name of ${item.name}`} className="w-72" />
                </ActionForm>
                <ActionForm
                  action={deleteListItem}
                  submitLabel="Delete"
                  variant="destructive"
                  inline
                  confirm={{ title: `Delete ${item.name}?`, description: `Matches keep the ${noun}'s name.` }}
                >
                  <input type="hidden" name="list" value={list} />
                  <input type="hidden" name="id" value={item.id} />
                </ActionForm>
              </div>
            ))}
          </CardContent>
        </Card>
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Add a {noun}</CardTitle>
              <CardDescription>For example, {example}.</CardDescription>
            </CardHeader>
            <CardContent>
              <ActionForm action={createListItem} submitLabel={`Add ${noun}`} className="max-w-none">
                <input type="hidden" name="list" value={list} />
                <TextField label="Name" name="name" required minLength={2} maxLength={120} />
              </ActionForm>
            </CardContent>
          </Card>
          <MergeCard
            action={mergeListItem}
            hidden={{ list }}
            items={items.items}
            noun={noun}
            description={`Matches played at the duplicate (in any capitals) take the other ${noun}'s name.`}
          />
        </div>
      </div>
    </div>
  );
}
