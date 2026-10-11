"use client";

import {
  CARD_REASONS,
  type CardReason,
  type EventInput,
  type MatchDocument,
  type MatchEvent,
  type NewEvent,
  type TeamSide,
  type ValidationIssue,
  addEvent,
  buildEvent,
  cancelEvent,
  describeEvent,
  eventTime,
  parseMatch,
  periodLabel,
  restoreEvent,
  setCardReason,
  sortChronologically,
  summarizeMatch,
  voidedSeqs,
} from "@fh/shared";
import { CircleAlert, Link2, Plus, RotateCcw, Save, TriangleAlert, Unlink, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type AddResult,
  type SaveResult,
  addCompetition,
  addVenue,
  saveMatch,
  searchCompetitions,
  searchTeams,
  searchUmpires,
  searchVenues,
  setSecondUmpire,
} from "@/app/actions/matches";
import { SearchPicker } from "@/components/SearchPicker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { FullMatch, TeamWithClub, Umpire } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Everything an umpire can correct after the match: teams, details, events and umpire 2. */
export function MatchEditor({ initial }: { initial: FullMatch }) {
  const router = useRouter();
  const [doc, setDoc] = useState<MatchDocument>(initial.document);
  const [saved, setSaved] = useState<MatchDocument>(initial.document);
  const [revision, setRevision] = useState(initial.match.currentRevision);
  const [result, setResult] = useState<SaveResult | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = useMemo(() => JSON.stringify(doc) !== JSON.stringify(saved), [doc, saved]);
  const check = useMemo(() => parseMatch(doc), [doc]);
  const errors: ValidationIssue[] = check.ok ? [] : check.errors;
  const summary = useMemo(() => summarizeMatch(doc), [doc]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const update = (change: (d: MatchDocument) => void) =>
    setDoc((d) => {
      const next = structuredClone(d);
      change(next);
      return next;
    });

  async function save() {
    setSaving(true);
    const res = await saveMatch(initial.match.id, revision, doc);
    setSaving(false);
    setResult(res);
    if (res.ok) {
      setSaved(doc);
      setRevision(res.revision);
      toast.success("Match saved.");
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <Card size="sm" className="bg-muted/50">
        <CardContent className="flex flex-wrap items-baseline gap-x-3 text-sm text-muted-foreground">
          Score now
          <span className="text-base font-semibold text-foreground">
            {doc.teams.home.name} {summary.score.home}–{summary.score.away} {doc.teams.away.name}
          </span>
          {summary.shootout && <span>shootout {summary.shootout.home}–{summary.shootout.away}</span>}
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 md:grid-cols-2">
        <TeamEditor side="home" doc={doc} update={update} />
        <TeamEditor side="away" doc={doc} update={update} />
      </div>

      <Section title="Details">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="competition">Competition</FieldLabel>
            <Suggest
              id="competition"
              value={doc.competition ?? ""}
              search={searchCompetitions}
              add={{ noun: "competition", run: addCompetition }}
              onChange={(v) => update((d) => void (d.competition = v || null))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="venue">Venue</FieldLabel>
            <Suggest
              id="venue"
              value={doc.venue ?? ""}
              search={searchVenues}
              add={{ noun: "venue", run: addVenue }}
              onChange={(v) => update((d) => void (d.venue = v || null))}
            />
          </Field>
        </FieldGroup>
        <FieldDescription className="mt-3">Type anything, or pick from the site&apos;s lists as you type. One that isn&apos;t there can be added.</FieldDescription>
      </Section>

      <UmpiresEditor matchId={initial.match.id} initialUmpires={initial.match.umpires} />

      <EventsEditor doc={doc} saved={saved} update={update} />

      <div className="sticky bottom-0 z-10 -mx-4 space-y-3 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={save} disabled={!dirty || saving || errors.length > 0}>
            <Save /> {saving ? "Saving…" : "Save changes"}
          </Button>
          <span className="text-sm text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>
        </div>
        {errors.length > 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>Fix these before saving</AlertTitle>
            <AlertDescription>
              <IssueList issues={errors.map((e) => e.message)} />
            </AlertDescription>
          </Alert>
        )}
        {result && !result.ok && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{result.error}</AlertTitle>
            <AlertDescription>
              {result.details && <IssueList issues={result.details} />}
              {result.conflict && (
                <Button variant="outline" size="sm" className="mt-2" onClick={() => window.location.reload()}>
                  <RotateCcw /> Reload the match
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        {result?.ok && result.warnings.length > 0 && (
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            <TriangleAlert />
            <AlertTitle>Saved. Worth checking:</AlertTitle>
            <AlertDescription className="text-current/90">
              <IssueList issues={result.warnings.map((w) => w.message)} />
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}

function IssueList({ issues }: { issues: string[] }) {
  return (
    <ul className="list-disc pl-4">
      {issues.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

type Update = (change: (d: MatchDocument) => void) => void;

function TeamEditor({ side, doc, update }: { side: TeamSide; doc: MatchDocument; update: Update }) {
  const team = doc.teams[side];
  const id = (f: string) => `${side}-${f}`;
  return (
    <Section title={side === "home" ? "Home team" : "Away team"}>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={id("name")}>Name shown</FieldLabel>
          <Input id={id("name")} value={team.name} maxLength={80} onChange={(e) => update((d) => void (d.teams[side].name = e.target.value))} />
        </Field>
        <div className="grid grid-cols-[auto_1fr] gap-4">
          <Field>
            <FieldLabel htmlFor={id("color")}>Colour</FieldLabel>
            <Input
              id={id("color")}
              type="color"
              className="h-9 w-14 p-1"
              value={team.color}
              onChange={(e) => update((d) => void (d.teams[side].color = e.target.value.toUpperCase()))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={id("captain")}>Captain&apos;s shirt number</FieldLabel>
            <Input
              id={id("captain")}
              type="number"
              min={0}
              max={999}
              value={team.captain ?? ""}
              onChange={(e) => update((d) => void (d.teams[side].captain = e.target.value === "" ? null : Number(e.target.value)))}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Club team</FieldLabel>
          {team.teamId ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
              <span className="flex items-center gap-2 text-sm">
                <Link2 className="size-4 text-primary" /> Linked to a club team
              </span>
              <Button variant="ghost" size="sm" onClick={() => update((d) => void (d.teams[side].teamId = null))}>
                <Unlink /> Unlink
              </Button>
            </div>
          ) : (
            <>
              <SearchPicker<TeamWithClub>
                id={id("team-search")}
                placeholder="Search, e.g. Hawks M1"
                search={searchTeams}
                label={(t) => `${t.club.name} ${t.name}`}
                onPick={(t) =>
                  update((d) => {
                    d.teams[side].teamId = t.id;
                    d.teams[side].name = `${t.club.name} ${t.name}`;
                  })
                }
              />
              <FieldDescription>Not linked. Linking puts the match on the club&apos;s pages.</FieldDescription>
            </>
          )}
        </Field>
      </FieldGroup>
    </Section>
  );
}

/** A search box that calls a server action as you type and lists what it finds. */
type Named = { id: string; name: string };

/**
 * A text field that offers names from one of the site's lists (venues, competitions) as
 * you type: pick one, or keep what you typed. A name the list doesn't have can be added
 * to it from here. The match keeps the text either way.
 */
function Suggest({
  id,
  value,
  search,
  add,
  onChange,
}: {
  id: string;
  value: string;
  search: (q: string) => Promise<Named[]>;
  /** Adds what's typed to the list; `noun` says what it is, e.g. "venue". */
  add: { noun: string; run: (name: string) => Promise<AddResult> };
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  // What was searched for, and what came back: the add option waits until the list has answered.
  const [found, setFound] = useState<{ q: string; items: Named[] } | null>(null);
  const [adding, setAdding] = useState(false);
  const latest = useRef(0);
  const q = value.trim().replace(/\s+/g, " ");

  useEffect(() => {
    const ticket = ++latest.current;
    if (!focused || q.length < 2) {
      setFound(null);
      return;
    }
    const timer = setTimeout(async () => {
      const items = await search(q).catch(() => null);
      if (ticket === latest.current) setFound(items && { q, items: items.slice(0, 8) });
    }, 250);
    return () => clearTimeout(timer);
  }, [q, focused, search]);

  const same = (s: string) => s.toLowerCase() === q.toLowerCase();
  const results = found?.q === q ? found.items : [];
  // Nothing to offer once what's typed is one of them.
  const shown = results.filter((r) => !same(r.name));
  // Once added, it's among the results, so this goes by itself.
  const canAdd = found?.q === q && !results.some((r) => same(r.name));
  const open = shown.length > 0 || canAdd;

  async function addTyped() {
    setAdding(true);
    const res = await add.run(q);
    setAdding(false);
    if (!res.ok) return void toast.error(`Couldn't add it: ${res.error}`);
    toast.success(`Added “${res.name}” to the ${add.noun}s.`);
    onChange(res.name);
    setFound({ q: res.name, items: [{ id: "added", name: res.name }, ...results] });
  }

  const option = "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground";
  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        maxLength={120}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-options`}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {open && (
        <ul id={`${id}-options`} role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover p-1 text-popover-foreground shadow-md">
          {shown.map((r) => (
            <li key={r.id} role="option" aria-selected={false}>
              <button
                type="button"
                className={option}
                // Before the field's blur, which would close the list first.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChange(r.name.slice(0, 120))}
              >
                {r.name}
              </button>
            </li>
          ))}
          {canAdd && (
            <li role="option" aria-selected={false} className={cn(shown.length > 0 && "mt-1 border-t pt-1")}>
              <button type="button" className={option} disabled={adding} onMouseDown={(e) => e.preventDefault()} onClick={() => void addTyped()}>
                <Plus className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  <span className="text-primary">{adding ? `Adding “${q}”…` : `Add “${q}” as a new ${add.noun}`}</span>
                  <span className="block text-xs text-muted-foreground">For everyone to pick from. Only add it if the list doesn&apos;t have it already.</span>
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function UmpiresEditor({ matchId, initialUmpires }: { matchId: string; initialUmpires: Umpire[] }) {
  const [umpires, setUmpires] = useState(initialUmpires);
  const [name, setName] = useState("");
  const second = umpires.find((u) => u.slot === 2);

  async function set(value: { userId: string } | { name: string } | null) {
    const res = await setSecondUmpire(matchId, value);
    if (res.ok) {
      setUmpires(res.umpires);
      setName("");
      toast.success(value ? "Umpire 2 saved." : "Umpire 2 removed.");
    } else {
      toast.error(res.error);
    }
  }

  return (
    <Section title="Umpires" description="Changes here save straight away.">
      <div className="space-y-4">
        <p>
          <span className="text-muted-foreground">Umpire 1:</span> {umpires.find((u) => u.slot === 1)?.name ?? "Deleted user"}
        </p>
        {second ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">Umpire 2:</span> {second.name}
            {!second.userId && <Badge variant="outline">Not registered</Badge>}
            <Button variant="ghost" size="sm" onClick={() => set(null)}>
              <X /> Remove
            </Button>
          </div>
        ) : (
          <FieldGroup className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="umpire-search">Add a registered umpire</FieldLabel>
              <SearchPicker<{ id: string; displayName: string }>
                id="umpire-search"
                placeholder="Search by name"
                search={searchUmpires}
                label={(u) => u.displayName}
                onPick={(u) => set({ userId: u.id })}
              />
              <FieldDescription>They&apos;ll be able to edit this match too.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="umpire-name">Or just a name</FieldLabel>
              <div className="flex gap-2">
                <Input id="umpire-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                <Button variant="outline" disabled={!name.trim()} onClick={() => set({ name: name.trim() })}>
                  Add
                </Button>
              </div>
              <FieldDescription>For an umpire who isn&apos;t on the system.</FieldDescription>
            </Field>
          </FieldGroup>
        )}
      </div>
    </Section>
  );
}

function EventsEditor({ doc, saved, update }: { doc: MatchDocument; saved: MatchDocument; update: Update }) {
  const savedSeqs = useMemo(() => new Set(saved.events.map((e) => e.seq)), [saved]);
  const voided = voidedSeqs(doc);
  const shown = sortChronologically(doc.events.filter((e) => e.type !== "void"));

  // The shared helpers return new documents; copy the result into the editor's draft.
  const apply = (next: MatchDocument) => update((d) => void (d.events = next.events));
  const cancel = (e: MatchEvent) => apply(cancelEvent(doc, e.seq, savedSeqs));
  const restore = (e: MatchEvent) => apply(restoreEvent(doc, e.seq));

  return (
    <Section title="Events" description="Cancelling an event keeps it in the record, crossed out, so the watch's original is never lost.">
      <div className="space-y-6">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Event</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Player</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((e) => {
              const isVoided = voided.has(e.seq);
              const struck = cn(isVoided && "text-muted-foreground line-through");
              return (
                <TableRow key={e.seq}>
                  <TableCell className={cn("tabular-nums", struck)}>{eventTime(e, doc.settings)}</TableCell>
                  <TableCell className={cn("whitespace-normal", struck)}>
                    {describeEvent(e, doc.settings)}
                    {e.type === "card" && !isVoided && (
                      <div className="mt-2 w-52">
                        <Choice
                          id={`reason-${e.seq}`}
                          label="Why"
                          value={e.reason ?? "none"}
                          onChange={(v) => apply(setCardReason(doc, e.seq, v === "none" ? null : v))}
                          options={REASON_OPTIONS}
                        />
                      </div>
                    )}
                  </TableCell>
                  <TableCell className={struck}>{"team" in e ? doc.teams[e.team].name : ""}</TableCell>
                  <TableCell className={struck}>{"player" in e && e.player !== undefined ? `#${e.player}` : ""}</TableCell>
                  <TableCell className="text-right">
                    {isVoided ? (
                      <Button variant="ghost" size="sm" onClick={() => restore(e)}>
                        <RotateCcw /> Restore
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => cancel(e)}>
                        <X /> {savedSeqs.has(e.seq) ? "Cancel" : "Remove"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <AddEvent doc={doc} onAdd={(event) => apply(addEvent(doc, event))} />
      </div>
    </Section>
  );
}

type NewEventType = EventInput["type"];

/** Why a card was given, or "Not recorded", for the Choice selects. */
const REASON_OPTIONS: ["none" | CardReason, string][] = [["none", "Not recorded"], ...(Object.entries(CARD_REASONS) as [CardReason, string][])];

function Choice<T extends string>({ id, label, value, onChange, options }: { id: string; label: string; value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => (
            <SelectItem key={v} value={v}>
              {l}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function AddEvent({ doc, onAdd }: { doc: MatchDocument; onAdd: (event: NewEvent) => void }) {
  const { settings } = doc;
  const [type, setType] = useState<NewEventType>("goal");
  const [team, setTeam] = useState<TeamSide>("home");
  const [period, setPeriod] = useState("1");
  const [clock, setClock] = useState("");
  const [player, setPlayer] = useState("");
  const [method, setMethod] = useState<"none" | "field" | "pc" | "ps">("none");
  const [color, setColor] = useState<"green" | "yellow" | "red">("green");
  const [yellowLong, setYellowLong] = useState(false);
  const [reason, setReason] = useState<"none" | CardReason>("none");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  function add() {
    const built = buildEvent(
      { type, team, period: Number(period), clock, player, method: method === "none" ? undefined : method, color, yellowLong, reason: reason === "none" ? undefined : reason, text: note },
      settings,
    );
    if ("error" in built) return setError(built.error);
    onAdd(built.event);
    setError(null);
    setPlayer("");
    setNote("");
  }

  return (
    <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
      <h3 className="font-medium">Add an event</h3>
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Choice
          id="new-type"
          label="Event"
          value={type}
          onChange={setType}
          options={[
            ["goal", "Goal"],
            ["card", "Card"],
            ["note", "Note"],
          ]}
        />
        {type !== "note" && (
          <Choice
            id="new-team"
            label="Team"
            value={team}
            onChange={setTeam}
            options={[
              ["home", doc.teams.home.name],
              ["away", doc.teams.away.name],
            ]}
          />
        )}
        <Choice
          id="new-period"
          label="Period"
          value={period}
          onChange={setPeriod}
          options={Array.from({ length: settings.periods }, (_, i) => [String(i + 1), periodLabel(settings.periods, i + 1)] as [string, string])}
        />
        <Field>
          <FieldLabel htmlFor="new-clock">Clock{type === "note" && <span className="font-normal text-muted-foreground"> (optional)</span>}</FieldLabel>
          <Input id="new-clock" value={clock} placeholder="e.g. 12:30" onChange={(e) => setClock(e.target.value)} />
        </Field>
        {(type === "goal" || type === "card") && (
          <Field>
            <FieldLabel htmlFor="new-player">Shirt number</FieldLabel>
            <Input id="new-player" type="number" min={0} max={999} value={player} onChange={(e) => setPlayer(e.target.value)} />
          </Field>
        )}
      </div>
      {type === "goal" && (
        <div className="max-w-xs">
          <Choice
            id="new-method"
            label="How"
            value={method}
            onChange={setMethod}
            options={[
              ["none", "Not recorded"],
              ["field", "Field goal"],
              ["pc", "Penalty corner"],
              ["ps", "Penalty stroke"],
            ]}
          />
        </div>
      )}
      {type === "card" && (
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-40">
            <Choice
              id="new-color"
              label="Card"
              value={color}
              onChange={setColor}
              options={[
                ["green", "Green"],
                ["yellow", "Yellow"],
                ["red", "Red"],
              ]}
            />
          </div>
          <div className="w-52">
            <Choice id="new-reason" label="Why" value={reason} onChange={setReason} options={REASON_OPTIONS} />
          </div>
          {color === "yellow" && (
            <Field orientation="horizontal" className="w-auto pb-2">
              <Checkbox id="new-long" checked={yellowLong} onCheckedChange={(v) => setYellowLong(v === true)} />
              <FieldLabel htmlFor="new-long" className="font-normal">
                Long suspension ({settings.cardDurationsSec.yellowLong / 60} min)
              </FieldLabel>
            </Field>
          )}
        </div>
      )}
      {type === "note" && (
        <Field>
          <FieldLabel htmlFor="new-note">Note</FieldLabel>
          <Textarea id="new-note" value={note} maxLength={1000} rows={2} onChange={(e) => setNote(e.target.value)} />
        </Field>
      )}
      <Button variant="secondary" onClick={add}>
        <Plus /> Add event
      </Button>
      {error && (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
      )}
    </div>
  );
}
