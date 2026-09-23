"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Club } from "@/lib/types";

type Kind = "none" | "existing" | "new";

/** Fields for asking to run an existing club, or for a missing club to be added. Names match the server actions. */
export function ClubRequestFields({ clubs, optional = false }: { clubs: Club[]; optional?: boolean }) {
  const [kind, setKind] = useState<Kind>(optional ? "none" : "existing");
  const name = optional ? "club" : "kind";

  return (
    <FieldSet>
      <FieldLegend>{optional ? "Club (optional)" : "Which club?"}</FieldLegend>
      <RadioGroup name={name} value={kind} onValueChange={(v) => setKind(v as Kind)}>
        {optional && (
          <Field orientation="horizontal">
            <RadioGroupItem value="none" id={`${name}-none`} />
            <FieldLabel htmlFor={`${name}-none`} className="font-normal">
              Not now
            </FieldLabel>
          </Field>
        )}
        <Field orientation="horizontal">
          <RadioGroupItem value="existing" id={`${name}-existing`} />
          <FieldLabel htmlFor={`${name}-existing`} className="font-normal">
            I run an existing club and want to see its matches
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <RadioGroupItem value="new" id={`${name}-new`} />
          <FieldLabel htmlFor={`${name}-new`} className="font-normal">
            My club isn&apos;t listed
          </FieldLabel>
        </Field>
      </RadioGroup>

      {kind === "existing" && (
        <Field>
          <FieldLabel>Club</FieldLabel>
          <Select name="clubId" required>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose a club" />
            </SelectTrigger>
            <SelectContent>
              {clubs.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {kind === "new" && (
        <>
          <Field>
            <FieldLabel htmlFor="clubName">Club name</FieldLabel>
            <Input id="clubName" name="clubName" required minLength={2} maxLength={100} />
          </Field>
          <Field orientation="horizontal">
            <Checkbox id="wantsAdmin" name="wantsAdmin" defaultChecked />
            <FieldLabel htmlFor="wantsAdmin" className="font-normal">
              Make me its club admin
            </FieldLabel>
          </Field>
        </>
      )}
      {kind !== "none" && <FieldDescription>An admin reviews club requests before they take effect.</FieldDescription>}
    </FieldSet>
  );
}
