"use client";

import { CircleAlert, CircleCheck, FileUp, Upload } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { type FixtureImportState, importFixtures } from "@/app/actions/umpiring";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const EXAMPLE = "date,time,home,away,venue,competition,umpires\n26/09/2026,14:00,M1,Reading M1,Banbury Road,South Men's Division 2,2\n27/09/2026,11:00,Ladies 1,Bath Ladies 1,,,1";

/** A club's fixtures from a spreadsheet: preview what it would add, then import it. */
export function FixtureImportForm({ clubId }: { clubId: string }) {
  const [state, action, pending] = useActionState<FixtureImportState, FormData>(importFixtures, undefined);
  const preview = state && "result" in state ? state : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>From a spreadsheet</CardTitle>
          <CardDescription>
            Save it as CSV, with the columns date, time, home, away, venue, competition and umpires (1 or 2; 2 if left blank). Only the date and
            teams are needed. Dates can be 26/09/2026 or 2026-09-26, and times 14:00 or 2pm. A heading row is optional. Fixtures already there (the
            same day and teams) are left alone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid max-w-xl gap-5">
            <input type="hidden" name="clubId" value={clubId} />
            <div className="grid gap-2">
              <Label htmlFor="fixtures-file">CSV file</Label>
              <Input id="fixtures-file" name="file" type="file" accept=".csv,text/csv,text/plain" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="fixtures-csv">Or paste the rows</Label>
              <Textarea id="fixtures-csv" name="csv" rows={6} placeholder={EXAMPLE} className="font-mono text-sm" />
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

      {preview && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {preview.saved && <CircleCheck className="size-5 text-primary" />}
              {preview.saved ? "Imported" : "Preview"}
            </CardTitle>
            <CardDescription>
              {preview.result.added.length === 0
                ? "Nothing new to add."
                : `${preview.saved ? "Added" : "Will add"} ${preview.result.added.length} ${preview.result.added.length === 1 ? "fixture" : "fixtures"}.`}{" "}
              {preview.result.existing > 0 && `${preview.result.existing} already there.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {preview.result.added.length > 0 && (
              <ul className="max-h-72 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
                {preview.result.added.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
            {preview.result.errors.length > 0 && (
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle>
                  {preview.result.errors.length} {preview.result.errors.length === 1 ? "row" : "rows"} can&apos;t be imported
                  {preview.saved ? "" : ", and will be skipped"}
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-5">
                    {preview.result.errors.slice(0, 20).map((e) => (
                      <li key={e.row}>
                        Line {e.row + preview.firstLine}: {e.message}
                      </li>
                    ))}
                    {preview.result.errors.length > 20 && <li>…and {preview.result.errors.length - 20} more.</li>}
                  </ul>
                </AlertDescription>
              </Alert>
            )}
            {!preview.saved && preview.result.added.length > 0 && (
              <form action={action}>
                <input type="hidden" name="clubId" value={clubId} />
                <input type="hidden" name="csv" value={preview.csv} />
                <Button type="submit" name="save" value="1" disabled={pending}>
                  <Upload /> {pending ? "Importing…" : `Import ${preview.result.added.length}`}
                </Button>
              </form>
            )}
            {preview.saved && (
              <Button variant="outline" asChild>
                <Link href="/dashboard/fixtures?show=needs">Appoint umpires</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
