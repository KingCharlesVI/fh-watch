import type { ComponentProps, ReactNode } from "react";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** A labelled input with an optional hint, for server-rendered forms. */
export function TextField({ label, hint, id, name, ...input }: ComponentProps<typeof Input> & { label: ReactNode; hint?: ReactNode; name: string }) {
  const fieldId = id ?? name;
  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input id={fieldId} name={name} {...input} />
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}
