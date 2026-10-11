"use client";

import { CircleAlert, CircleCheck, FileUp, Upload } from "lucide-react";
import { useActionState, useState } from "react";
import { type ImportKind, type ImportState, importRows } from "@/app/actions/admin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const KINDS: { value: ImportKind; label: string; columns: string; example: string }[] = [
  { value: "clubs", label: "Clubs and teams", columns: "club, team (one row per team; leave the team out for a club alone)", example: "club,team\nOxford Hawks,M1\nOxford Hawks,Ladies 1\nReading,M1" },
  { value: "venues", label: "Venues", columns: "name", example: "name\nBanbury Road, Oxford\nSonning Lane, Reading" },
  { value: "competitions", label: "Competitions", columns: "name", example: "name\nSouth Men's Division 2\nHampshire Cup" },
];

/** Bulk import: choose a CSV (or paste one), see what it would add, then import it. */
export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importRows, undefined);
  const [kind, setKind] = useState<ImportKind>("clubs");
  const spec = KINDS.find((k) => k.value === kind)!;
  const preview = state && "result" in state ? state : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>From a spreadsheet</CardTitle>
          <CardDescription>
            Save it as CSV. A heading row is optional. Anything already on the site, in any capitals, is left as it is, so the same file can be imported
            again safely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid max-w-xl gap-5">
            <div className="grid gap-2">
              <Label htmlFor="import-kind">What to import</Label>
              <KindSelect value={kind} onChange={setKind} />
              <p className="text-sm text-muted-foreground">Columns: {spec.columns}.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="import-file">CSV file</Label>
              <Input id="import-file" name="file" type="file" accept=".csv,text/csv,text/plain" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="import-csv">Or paste the rows</Label>
              <Textarea id="import-csv" name="csv" rows={6} placeholder={spec.example} className="font-mono text-sm" />
            </div>
            <div>
              <Button type="submit" variant="secondary" disabled={pending}>
                <FileUp /> {pending ? "Reading…" : "Preview"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {state && "error" in state && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{state.error}</AlertTitle>
        </Alert>
      )}

      {preview && <Outcome state={preview} pending={pending} action={action} />}
    </div>
  );
}

function KindSelect({ value, onChange }: { value: ImportKind; onChange: (k: ImportKind) => void }) {
  return (
    <select
      id="import-kind"
      name="kind"
      value={value}
      onChange={(e) => onChange(e.target.value as ImportKind)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs"
    >
      {KINDS.map((k) => (
        <option key={k.value} value={k.value}>
          {k.label}
        </option>
      ))}
    </select>
  );
}

/** The preview, with Import to save it; or, once saved, what was added. */
function Outcome({ state, pending, action }: { state: Extract<NonNullable<ImportState>, { result: unknown }>; pending: boolean; action: (fd: FormData) => void }) {
  const { result, saved, firstLine } = state;
  const what = KINDS.find((k) => k.value === state.kind)!.label.toLowerCase();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {saved && <CircleCheck className="size-5 text-primary" />}
          {saved ? `Imported ${what}` : `Preview: ${what}`}
        </CardTitle>
        <CardDescription>
          {result.added.length === 0
            ? "Nothing new to add."
            : `${saved ? "Added" : "Will add"} ${result.added.length}.`}{" "}
          {result.existing > 0 && `${result.existing} ${result.existing === 1 ? "row is" : "rows are"} already on the site.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {result.added.length > 0 && (
          <ul className="max-h-72 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
            {result.added.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        )}
        {result.errors.length > 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>
              {result.errors.length} {result.errors.length === 1 ? "row" : "rows"} can&apos;t be imported{saved ? "" : ", and will be skipped"}
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5">
                {result.errors.slice(0, 20).map((e) => (
                  <li key={e.row}>
                    Line {e.row + firstLine}: {e.message}
                  </li>
                ))}
                {result.errors.length > 20 && <li>…and {result.errors.length - 20} more.</li>}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        {!saved && result.added.length > 0 && (
          <form action={action}>
            <input type="hidden" name="kind" value={state.kind} />
            <input type="hidden" name="csv" value={state.csv} />
            <Button type="submit" name="save" value="1" disabled={pending}>
              <Upload /> {pending ? "Importing…" : `Import ${result.added.length}`}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
