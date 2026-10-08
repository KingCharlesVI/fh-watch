import { FORMAT_PRESETS, formatPreset } from "@fh/shared";
import { ActionForm } from "@/components/ActionForm";
import { FilterSelect } from "@/components/FilterSelect";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cachedPublic } from "@/lib/api";
import type { FormState } from "@/lib/forms";
import type { ClubWithTeams, Competition, Fixture, Items, Venue } from "@/lib/types";

const FORMAT_OPTIONS = [{ value: "none", label: "Leave to the umpire" }, ...FORMAT_PRESETS.map((p) => ({ value: p.key, label: p.label }))];

/** A fixture's details, to add one or change it. Team, venue and competition names are offered from the site's lists. */
export async function FixtureForm({
  club,
  fixture,
  action,
  submitLabel,
}: {
  club: ClubWithTeams;
  fixture?: Fixture;
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [venues, competitions] = await Promise.all([cachedPublic<Items<Venue>>("/v1/venues"), cachedPublic<Items<Competition>>("/v1/competitions")]);
  const preset = fixture ? formatPreset(fixture.format) : undefined;
  return (
    <ActionForm action={action} submitLabel={submitLabel} className="max-w-xl">
      <input type="hidden" name="clubId" value={club.id} />
      {fixture && <input type="hidden" name="fixtureId" value={fixture.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="fixture-date">Date</FieldLabel>
          <Input id="fixture-date" name="date" type="date" required defaultValue={fixture?.date} />
        </Field>
        <Field>
          <FieldLabel htmlFor="fixture-time">Kick-off</FieldLabel>
          <Input id="fixture-time" name="time" type="time" defaultValue={fixture?.time ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="fixture-home">Home</FieldLabel>
          <Input id="fixture-home" name="home" required maxLength={100} list="fixture-teams" defaultValue={fixture?.home.name} placeholder="e.g. M1" />
        </Field>
        <Field>
          <FieldLabel htmlFor="fixture-away">Away</FieldLabel>
          <Input id="fixture-away" name="away" required maxLength={100} list="fixture-teams" defaultValue={fixture?.away.name} placeholder="e.g. Reading M1" />
        </Field>
      </div>
      <datalist id="fixture-teams">
        {club.teams.map((t) => (
          <option key={t.id} value={t.name} />
        ))}
      </datalist>
      <FieldDescription>
        Your club&apos;s teams by name (&ldquo;M1&rdquo;), another club&apos;s as club and team (&ldquo;Reading M1&rdquo;), are linked to the site&apos;s
        teams.
      </FieldDescription>
      <Field>
        <FieldLabel htmlFor="fixture-venue">Venue</FieldLabel>
        <Input id="fixture-venue" name="venue" maxLength={120} list="fixture-venues" defaultValue={fixture?.venue ?? ""} />
        <datalist id="fixture-venues">
          {venues?.items.map((v) => (
            <option key={v.id} value={v.name} />
          ))}
        </datalist>
      </Field>
      <Field>
        <FieldLabel htmlFor="fixture-competition">Competition</FieldLabel>
        <Input id="fixture-competition" name="competition" maxLength={120} list="fixture-competitions" defaultValue={fixture?.competition ?? ""} />
        <datalist id="fixture-competitions">
          {competitions?.items.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>Format</FieldLabel>
          <FilterSelect name="format" defaultValue={preset?.key ?? "none"} options={FORMAT_OPTIONS} />
          <FieldDescription>Sent to the watch umpire&apos;s phone, set up.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel>Umpires needed</FieldLabel>
          <FilterSelect
            name="umpiresNeeded"
            defaultValue={String(fixture?.umpiresNeeded ?? 2)}
            options={[
              { value: "2", label: "Two" },
              { value: "1", label: "One (the other side provides one)" },
            ]}
          />
        </Field>
      </div>
      <Field>
        <FieldLabel htmlFor="fixture-notes">Notes for the umpires</FieldLabel>
        <Textarea id="fixture-notes" name="notes" maxLength={500} rows={2} defaultValue={fixture?.notes ?? ""} />
      </Field>
    </ActionForm>
  );
}
