"use server";

import { DEFAULT_COLOURS, type MatchDocument, TIME_PATTERN, type Team, type ValidationIssue, localInstant, readDay, recordedMatch } from "@fh/shared";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, LISTS_TAG, api } from "@/lib/api";
import { type FormState, formError, formatFrom, optionalText, text } from "@/lib/forms";
import type { Items, Match, TeamWithClub, Umpire } from "@/lib/types";

const refresh = (id: string) => {
  revalidatePath(`/matches/${id}`);
  revalidatePath("/dashboard");
};

export async function publishMatch(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  try {
    await api(`/v1/matches/${id}/publish`, { method: "POST" });
  } catch (err) {
    return formError(err);
  }
  refresh(id);
  return { ok: "Published." };
}

export async function unpublishMatch(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  try {
    await api(`/v1/matches/${id}/unpublish`, { method: "POST" });
  } catch (err) {
    return formError(err);
  }
  refresh(id);
  return { ok: "Unpublished. The share link shows nothing until you publish it again." };
}

export async function deleteMatch(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  try {
    await api(`/v1/matches/${id}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/dashboard");
  redirect("/dashboard?deleted=1");
}

export type SaveResult =
  | { ok: true; revision: number; warnings: ValidationIssue[] }
  | { ok: false; error: string; details?: string[]; conflict?: boolean };

/** Saves an edited document as a new revision. `revision` is the one the edit started from. */
export async function saveMatch(id: string, revision: number, document: MatchDocument): Promise<SaveResult> {
  try {
    const res = await api<{ match: Match; warnings: ValidationIssue[] }>(`/v1/matches/${id}`, {
      method: "PUT",
      headers: { "if-match": `"${revision}"` },
      body: { source: "web", document },
    });
    refresh(id);
    return { ok: true, revision: res.match.currentRevision, warnings: res.warnings };
  } catch (err) {
    if (err instanceof ApiError && err.status === 412) {
      return { ok: false, conflict: true, error: "Someone else saved this match while you were editing. Reload to see their changes." };
    }
    const state = formError(err);
    return { ok: false, error: state?.error ?? "Couldn't save.", details: state?.details };
  }
}

/** The site's team a name is, "Reading M1", when exactly one is; otherwise it's left for the editor to link. */
async function teamNamed(name: string): Promise<string | null> {
  const found = (await api<Items<TeamWithClub>>("/v1/teams", { query: { q: name } })).items;
  const exact = found.filter((t) => `${t.club.name} ${t.name}`.toLowerCase() === name.toLowerCase());
  return exact.length === 1 ? exact[0]!.id : null;
}

/** A match umpired without the watch: saved as a draft, then opened in the editor for its goals and cards. */
export async function recordMatch(_: FormState, fd: FormData): Promise<FormState> {
  const day = readDay(text(fd, "date"));
  const time = text(fd, "time");
  if (!day || !TIME_PATTERN.test(time)) return { error: "Enter the day and kick-off." };
  const startedAt = localInstant(day, time);
  if (startedAt.getTime() > Date.now()) return { error: "That kick-off hasn't happened yet. To set up a match to come, plan it instead." };
  const format = formatFrom(fd);
  if (!format) return { error: "Pick the format the match was played in." };

  const id = crypto.randomUUID();
  try {
    const side = async (s: "home" | "away"): Promise<Team> => {
      const name = text(fd, s);
      const captain = text(fd, `${s}Captain`);
      return { name, teamId: name ? await teamNamed(name) : null, color: text(fd, `${s}Color`) || DEFAULT_COLOURS[s], captain: captain === "" ? null : Number(captain) };
    };
    const document = recordedMatch({
      id,
      startedAt,
      format,
      home: await side("home"),
      away: await side("away"),
      venue: optionalText(fd, "venue") ?? null,
      competition: optionalText(fd, "competition") ?? null,
    });
    await api(`/v1/matches/${id}`, { method: "PUT", body: { source: "web", document } });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/dashboard");
  redirect(`/matches/${id}/edit`);
}

export async function searchTeams(q: string): Promise<TeamWithClub[]> {
  if (q.trim().length < 1) return [];
  return (await api<Items<TeamWithClub>>("/v1/teams", { query: { q } })).items;
}

/** Venues and competitions whose names have every word of q, from the lists admins keep. */
export async function searchVenues(q: string): Promise<{ id: string; name: string }[]> {
  if (q.trim().length < 1) return [];
  return (await api<Items<{ id: string; name: string }>>("/v1/venues", { query: { q }, auth: false })).items;
}

export async function searchCompetitions(q: string): Promise<{ id: string; name: string }[]> {
  if (q.trim().length < 1) return [];
  return (await api<Items<{ id: string; name: string }>>("/v1/competitions", { query: { q }, auth: false })).items;
}

export type AddResult = { ok: true; name: string } | { ok: false; error: string };

/** Adds a venue or competition the list is missing. One already there (in any capitals) comes back instead. */
async function addToList(list: "venues" | "competitions", name: string): Promise<AddResult> {
  try {
    const item = await api<{ id: string; name: string }>(`/v1/${list}`, { method: "POST", body: { name } });
    updateTag(LISTS_TAG);
    revalidatePath(`/admin/${list}`);
    return { ok: true, name: item.name };
  } catch (err) {
    return { ok: false, error: formError(err)?.error ?? "Couldn't add it." };
  }
}

export async function addVenue(name: string): Promise<AddResult> {
  return addToList("venues", name);
}

export async function addCompetition(name: string): Promise<AddResult> {
  return addToList("competitions", name);
}

export async function searchUmpires(q: string): Promise<{ id: string; displayName: string }[]> {
  if (q.trim().length < 1) return [];
  return (await api<Items<{ id: string; displayName: string }>>("/v1/umpires", { query: { q } })).items;
}

export type UmpireResult = { ok: true; umpires: Umpire[] } | { ok: false; error: string };

/** Sets umpire 2 (a registered umpire, or just a name), or removes them with null. Saved straight away. */
export async function setSecondUmpire(id: string, value: { userId: string } | { name: string } | null): Promise<UmpireResult> {
  try {
    const res = await api<{ match: Match }>(
      `/v1/matches/${id}/umpires/2`,
      value ? { method: "PUT", body: value } : { method: "DELETE" },
    );
    refresh(id);
    return { ok: true, umpires: res.match.umpires };
  } catch (err) {
    return { ok: false, error: formError(err)?.error ?? "Couldn't save." };
  }
}
