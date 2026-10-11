"use server";

import { FORMAT_PRESETS, type ImportResult, parseCsv } from "@fh/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";
import type { Fixture } from "@/lib/types";

const done = (ok: string, ...paths: string[]): FormState => {
  for (const p of paths) revalidatePath(p);
  return { ok };
};

/** Runs an API call for a form, turning its problem into the form's error. */
async function attempt(call: () => Promise<unknown>, ok: string, ...paths: string[]): Promise<FormState> {
  try {
    await call();
  } catch (err) {
    return formError(err);
  }
  return done(ok, ...paths);
}

// ---- A club's umpire list (club admins) ----

export async function searchUmpireAccounts(q: string): Promise<{ id: string; displayName: string }[]> {
  if (q.trim().length < 2) return [];
  return (await api<{ items: { id: string; displayName: string }[] }>("/v1/umpires", { query: { q } })).items;
}

export async function addClubUmpire(clubId: string, userId: string): Promise<FormState> {
  return attempt(() => api(`/v1/clubs/${clubId}/umpires/${userId}`, { method: "PUT", body: {} }), "Added.", "/dashboard/umpires");
}

export async function updateClubUmpire(_: FormState, fd: FormData): Promise<FormState> {
  const level = text(fd, "level");
  const team = text(fd, "playsForTeamId");
  return attempt(
    () =>
      api(`/v1/clubs/${text(fd, "clubId")}/umpires/${text(fd, "userId")}`, {
        method: "PUT",
        body: { level: level === "none" ? null : Number(level), playsForTeamId: team === "none" ? null : team },
      }),
    "Saved.",
    "/dashboard/umpires",
  );
}

export async function removeClubUmpire(_: FormState, fd: FormData): Promise<FormState> {
  return attempt(() => api(`/v1/clubs/${text(fd, "clubId")}/umpires/${text(fd, "userId")}`, { method: "DELETE" }), "Taken off the list.", "/dashboard/umpires");
}

// ---- Fixtures (club admins) ----

/** A fixture's fields from its form, as the API takes them. */
function fixtureBody(fd: FormData) {
  const format = text(fd, "format");
  return {
    date: text(fd, "date"),
    time: optionalText(fd, "time") ?? null,
    home: { name: text(fd, "home") },
    away: { name: text(fd, "away") },
    venue: optionalText(fd, "venue") ?? null,
    competition: optionalText(fd, "competition") ?? null,
    format: FORMAT_PRESETS.find((p) => p.key === format)?.format ?? null,
    umpiresNeeded: text(fd, "umpiresNeeded") === "1" ? 1 : 2,
    notes: optionalText(fd, "notes") ?? null,
  };
}

export async function createFixture(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  let fixture: Fixture;
  try {
    fixture = await api<Fixture>(`/v1/clubs/${clubId}/fixtures`, { method: "POST", body: fixtureBody(fd) });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/dashboard/fixtures");
  redirect(`/dashboard/fixtures/${fixture.id}`);
}

export async function updateFixture(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "fixtureId");
  return attempt(
    () => api(`/v1/clubs/${text(fd, "clubId")}/fixtures/${id}`, { method: "PATCH", body: fixtureBody(fd) }),
    "Saved. Appointed umpires are emailed if it moved.",
    `/dashboard/fixtures/${id}`,
    "/dashboard/fixtures",
  );
}

export async function deleteFixture(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/clubs/${text(fd, "clubId")}/fixtures/${text(fd, "fixtureId")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/dashboard/fixtures");
  redirect("/dashboard/fixtures?deleted=1");
}

export type FixtureImportState =
  | { csv: string; saved: boolean; result: ImportResult; firstLine: number }
  | { error: string }
  | undefined;

const FIXTURE_HEADINGS = new Set(["date", "day"]);

/** Previews (or, with `save`, imports) fixtures from a CSV file or pasted rows. */
export async function importFixtures(_: FixtureImportState, fd: FormData): Promise<FixtureImportState> {
  const clubId = text(fd, "clubId");
  const file = fd.get("file");
  const csv = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("csv") ?? "");
  const rows = parseCsv(csv);
  const heading = rows.length > 0 && FIXTURE_HEADINGS.has(rows[0]![0]!.toLowerCase());
  const data = heading ? rows.slice(1) : rows;
  if (data.length === 0) return { error: "There's nothing to import: choose a CSV file or paste its rows." };
  if (data.length > 1000) return { error: `That's ${data.length} rows. Import at most 1000 at a time.` };
  const saved = fd.get("save") !== null;
  try {
    const result = await api<ImportResult>(`/v1/clubs/${clubId}/fixtures/import`, { method: "POST", body: { rows: data, dryRun: !saved } });
    if (saved) revalidatePath("/dashboard/fixtures");
    return { csv, saved, result, firstLine: heading ? 2 : 1 };
  } catch (err) {
    return { error: formError(err)?.error ?? "Couldn't import that." };
  }
}

// ---- Appointing (club admins) ----

export async function appoint(_: FormState, fd: FormData): Promise<FormState> {
  const fixtureId = text(fd, "fixtureId");
  const role = text(fd, "role") === "second" ? "second" : "watch";
  return attempt(
    () =>
      api(`/v1/clubs/${text(fd, "clubId")}/fixtures/${fixtureId}/appointments`, {
        method: "POST",
        body: { userId: text(fd, "userId"), role, mentoring: fd.get("mentoring") === "on" },
      }),
    "Asked, and emailed.",
    `/dashboard/fixtures/${fixtureId}`,
    "/dashboard/fixtures",
  );
}

export async function unappoint(_: FormState, fd: FormData): Promise<FormState> {
  const fixtureId = text(fd, "fixtureId");
  return attempt(
    () => api(`/v1/clubs/${text(fd, "clubId")}/fixtures/${fixtureId}/appointments/${text(fd, "appointmentId")}`, { method: "DELETE" }),
    "Taken off.",
    `/dashboard/fixtures/${fixtureId}`,
    "/dashboard/fixtures",
  );
}

// ---- Your appointments (umpires) ----

export async function answerAppointment(_: FormState, fd: FormData): Promise<FormState> {
  const answer = text(fd, "answer") === "accept" ? "accept" : "decline";
  return attempt(
    () => api(`/v1/me/appointments/${text(fd, "appointmentId")}/${answer}`, { method: "POST" }),
    answer === "accept" ? "Accepted." : "Declined. The club's admins are told.",
    "/appointments",
  );
}

export async function askForCover(_: FormState, fd: FormData): Promise<FormState> {
  const requested = text(fd, "requested") === "true";
  return attempt(
    () => api(`/v1/me/appointments/${text(fd, "appointmentId")}/cover`, { method: "POST", body: { requested } }),
    requested ? "Asked. The club's umpires and admins are emailed." : "You're no longer asking for cover.",
    "/appointments",
  );
}

export async function takeCover(_: FormState, fd: FormData): Promise<FormState> {
  return attempt(() => api(`/v1/me/cover-requests/${text(fd, "appointmentId")}/take`, { method: "POST" }), "It's yours. They've been told.", "/appointments");
}

export async function resetCalendarLink(_: FormState): Promise<FormState> {
  return attempt(() => api("/v1/me/calendar/reset", { method: "POST" }), "There's a new address. Subscribe to it again.", "/appointments");
}

// ---- Availability (umpires) ----

/** Marks a day: "available", "unavailable", or "clear" to unmark it. */
export async function markDay(date: string, state: "available" | "unavailable" | "clear"): Promise<FormState> {
  return attempt(
    () =>
      state === "clear"
        ? api(`/v1/me/availability/${date}`, { method: "DELETE" })
        : api(`/v1/me/availability/${date}`, { method: "PUT", body: { available: state === "available" } }),
    "Saved.",
    "/availability",
  );
}

export async function markHours(_: FormState, fd: FormData): Promise<FormState> {
  return attempt(
    () =>
      api(`/v1/me/availability/${text(fd, "date")}`, {
        method: "PUT",
        body: { available: true, from: optionalText(fd, "from") ?? null, to: optionalText(fd, "to") ?? null },
      }),
    "Saved.",
    "/availability",
  );
}

export async function setUnavailableWeekdays(_: FormState, fd: FormData): Promise<FormState> {
  const unavailable = [0, 1, 2, 3, 4, 5, 6].filter((d) => fd.get(`weekday_${d}`) === "on");
  return attempt(() => api("/v1/me/availability-weekdays", { method: "PUT", body: { unavailable } }), "Saved.", "/availability");
}

// ---- Competitions' levels (admins) ----

export async function setCompetitionLevel(_: FormState, fd: FormData): Promise<FormState> {
  const level = text(fd, "minLevel");
  return attempt(
    () => api(`/v1/competitions/${text(fd, "competitionId")}/umpire-level`, { method: "PUT", body: { minLevel: level === "none" ? null : Number(level) } }),
    "Saved.",
    "/admin/competitions",
  );
}
