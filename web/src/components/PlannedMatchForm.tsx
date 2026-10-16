import { DEFAULT_COLOURS, TEAM_COLOURS, localDay } from "@fh/shared";
import { ActionForm } from "@/components/ActionForm";
import { ComboInput } from "@/components/ComboInput";
import { FilterSelect } from "@/components/FilterSelect";
import { FormatFields } from "@/components/FormatFields";
import { Field, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cachedPublic } from "@/lib/api";
import type { FormState } from "@/lib/forms";
import type { Competition, Items, PlannedMatch, TeamWithClub, Venue } from "@/lib/types";

const COLOUR_OPTIONS = TEAM_COLOURS.map((c) => ({ value: c.hex, label: c.name }));

/**
 * A match set up ahead of time: the same setup as on the phone, with its day and kick-off.
 * Team, venue and competition names are offered from the site's lists.
 */
export async function PlannedMatchForm({
  planned,
  action,
  submitLabel,
}: {
  planned?: PlannedMatch;
  action: (state: FormState, fd: FormData) => Promise<FormState>;
  submitLabel: string;
}) {
  const [venues, competitions, teams] = await Promise.all([
    cachedPublic<Items<Venue>>("/v1/venues"),
    cachedPublic<Items<Competition>>("/v1/competitions"),
    cachedPublic<Items<TeamWithClub>>("/v1/teams"),
  ]);
  const teamNames = (teams?.items ?? []).map((t) => `${t.club.name} ${t.name}`);

  const side = (s: "home" | "away", label: string) => (
    <FieldSet>
      <FieldLegend>{label}</FieldLegend>
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem_7rem]">
        <Field>
          <FieldLabel htmlFor={`planned-${s}`}>Team</FieldLabel>
          <ComboInput id={`planned-${s}`} name={s} required maxLength={80} options={teamNames} defaultValue={planned?.[s].name} placeholder="e.g. Reading M1" />
        </Field>
        <Field>
          <FieldLabel htmlFor={`planned-${s}-color`}>Colour</FieldLabel>
          <FilterSelect id={`planned-${s}-color`} name={`${s}Color`} defaultValue={planned?.[s].color ?? DEFAULT_COLOURS[s]} options={COLOUR_OPTIONS} />
        </Field>
        <Field>
          <FieldLabel htmlFor={`planned-${s}-captain`}>Captain</FieldLabel>
          <Input id={`planned-${s}-captain`} name={`${s}Captain`} type="number" min={0} max={999} placeholder="No." defaultValue={planned?.[s].captain ?? ""} />
        </Field>
      </div>
    </FieldSet>
  );

  return (
    <ActionForm action={action} submitLabel={submitLabel} className="max-w-2xl">
      {planned && <input type="hidden" name="id" value={planned.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="planned-date">Date</FieldLabel>
          <Input id="planned-date" name="date" type="date" required min={localDay(new Date())} defaultValue={planned?.date} />
        </Field>
        <Field>
          <FieldLabel htmlFor="planned-time">Kick-off</FieldLabel>
          <Input id="planned-time" name="time" type="time" defaultValue={planned?.time ?? ""} />
        </Field>
      </div>
      {side("home", "Home")}
      {side("away", "Away")}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="planned-venue">Venue</FieldLabel>
          <ComboInput id="planned-venue" name="venue" maxLength={120} options={venues?.items.map((v) => v.name) ?? []} defaultValue={planned?.venue ?? ""} />
        </Field>
        <Field>
          <FieldLabel htmlFor="planned-competition">Competition</FieldLabel>
          <ComboInput
            id="planned-competition"
            name="competition"
            maxLength={120}
            options={competitions?.items.map((c) => c.name) ?? []}
            defaultValue={planned?.competition ?? ""}
          />
        </Field>
      </div>
      <FormatFields format={planned?.format ?? null} />
    </ActionForm>
  );
}
