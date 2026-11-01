"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { type FormState, formError, formatFrom, optionalText, text } from "@/lib/forms";

/** A planned match's fields from its form, as the API takes them. */
function plannedBody(fd: FormData) {
  const side = (s: "home" | "away") => {
    const captain = text(fd, `${s}Captain`);
    return { name: text(fd, s), color: text(fd, `${s}Color`), captain: captain === "" ? null : Number(captain) };
  };
  return {
    date: text(fd, "date"),
    time: optionalText(fd, "time") ?? null,
    home: side("home"),
    away: side("away"),
    venue: optionalText(fd, "venue") ?? null,
    competition: optionalText(fd, "competition") ?? null,
    format: formatFrom(fd),
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
