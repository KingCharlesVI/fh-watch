"use client";

import { FORMAT_PRESETS, type FixtureFormat, formatPreset } from "@fh/shared";
import { useState } from "react";
import { FilterSelect } from "@/components/FilterSelect";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const OPTIONS = [
  { value: "phone", label: "As last set up on your phone" },
  ...FORMAT_PRESETS.map((p) => ({ value: p.key, label: p.label })),
  { value: "custom", label: "Other" },
];

/** How the match is played: one of the watch's presets, other periods and breaks, or the phone's last setup's. */
export function FormatFields({ format }: { format: FixtureFormat | null }) {
  const [choice, setChoice] = useState(format ? (formatPreset(format)?.key ?? "custom") : "phone");
  const start = format ?? FORMAT_PRESETS[0]!.format;
  const halfTime = (periods: number) => periods % 2 === 0 && periods > 2;
  const [periods, setPeriods] = useState(start.periods);
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor="planned-format">Format</FieldLabel>
        <FilterSelect id="planned-format" name="format" defaultValue={choice} options={OPTIONS} onChange={setChoice} />
      </Field>
      {choice === "custom" && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="planned-periods">Periods</FieldLabel>
            <Input
              id="planned-periods"
              name="periods"
              type="number"
              min={1}
              max={8}
              required
              defaultValue={start.periods}
              onChange={(e) => setPeriods(Number(e.target.value))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="planned-minutes">Minutes each</FieldLabel>
            <Input id="planned-minutes" name="periodMinutes" type="number" min={1} max={90} required defaultValue={start.periodMinutes} />
          </Field>
          <Field>
            <FieldLabel htmlFor="planned-break">Breaks</FieldLabel>
            <Input id="planned-break" name="breakMinutes" type="number" min={0} max={30} required defaultValue={start.breakMinutes} />
          </Field>
          <Field>
            <FieldLabel htmlFor="planned-half-time">Half-time</FieldLabel>
            <Input
              id="planned-half-time"
              name="halfTimeMinutes"
              type="number"
              min={0}
              max={30}
              required
              disabled={!halfTime(periods)}
              defaultValue={start.halfTimeMinutes}
            />
          </Field>
          {/* A disabled field isn't submitted; the watch still wants a half-time. */}
          {!halfTime(periods) && <input type="hidden" name="halfTimeMinutes" value={start.halfTimeMinutes} />}
        </div>
      )}
      {choice !== "phone" && (
        <Field orientation="horizontal">
          <Checkbox id="planned-shootout" name="shootout" defaultChecked={format?.shootoutIfDrawn ?? false} />
          <FieldLabel htmlFor="planned-shootout">Shoot-out if drawn</FieldLabel>
        </Field>
      )}
    </div>
  );
}
