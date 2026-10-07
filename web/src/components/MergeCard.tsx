import { ActionForm } from "@/components/ActionForm";
import { FilterSelect } from "@/components/FilterSelect";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/forms";

/**
 * Merge duplicates: pick the duplicate and the one to keep. The action gets them as `from`
 * and `into`, with `hidden` alongside. Shown only when there are two or more to merge.
 */
export function MergeCard({
  action,
  hidden,
  items,
  noun,
  description,
}: {
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  hidden?: Record<string, string>;
  items: { id: string; name: string }[];
  /** Lower case, e.g. "venue". */
  noun: string;
  /** What happens to the duplicate's matches and anything else of it. */
  description: string;
}) {
  if (items.length < 2) return null;
  const options = items.map((i) => ({ value: i.id, label: i.name }));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Merge duplicates</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <ActionForm
          action={action}
          submitLabel="Merge"
          variant="destructive"
          className="max-w-none"
          confirm={{ title: `Merge these ${noun}s?`, description: `The duplicate ${noun} is deleted. This can't be undone.` }}
        >
          {Object.entries(hidden ?? {}).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div className="grid gap-2">
            <Label htmlFor={`merge-from-${noun}`}>Duplicate</Label>
            <FilterSelect id={`merge-from-${noun}`} name="from" options={options} placeholder={`The ${noun} to remove`} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`merge-into-${noun}`}>Merge into</Label>
            <FilterSelect id={`merge-into-${noun}`} name="into" options={options} placeholder={`The ${noun} to keep`} />
          </div>
        </ActionForm>
      </CardContent>
    </Card>
  );
}
