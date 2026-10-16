"use server";

import { FORMAT_PRESETS } from "@fh/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";

/** A planned match's fields from its form, as the API takes them. */
function plannedBody(fd: FormData) {
  const side = (s: "home" | "away") => {
    const captain = text(fd, `${s}Captain`);
    return { name: text(fd, s), color: text(fd, `${s}Color`), captain: captain === "" ? null : Number(captain) };
  };
  const choice = text(fd, "format");
  const shootoutIfDrawn = fd.get("shootout") !== null;
  const preset = FORMAT_PRESETS.find((p) => p.key === choice);
  const number = (name: string) => Number(text(fd, name));
  const format = preset
    ? { ...preset.format, shootoutIfDrawn }
    : choice === "custom"
      ? {
          periods: number("periods"),
          periodMinutes: number("periodMinutes"),
          breakMinutes: number("breakMinutes"),
          halfTimeMinutes: number("halfTimeMinutes"),
          shootoutIfDrawn,
        }
      : null;
  return {
    date: text(fd, "date"),
    time: optionalText(fd, "time") ?? null,
    home: side("home"),
    away: side("away"),
    venue: optionalText(fd, "venue") ?? null,
    competition: optionalText(fd, "competition") ?? null,
    format,
  };
}

export async function createPlannedMatch(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api("/v1/me/planned-matches", { method: "POST", body: plannedBody(fd) });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/upcoming");
  redirect("/upcoming");
}

export async function updatePlannedMatch(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/me/planned-matches/${text(fd, "id")}`, { method: "PUT", body: plannedBody(fd) });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/upcoming");
  redirect("/upcoming");
}

export async function deletePlannedMatch(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/me/planned-matches/${text(fd, "id")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/upcoming");
  redirect("/upcoming");
}
