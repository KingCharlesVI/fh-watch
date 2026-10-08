"use server";

import { type ImportResult, ROLES, type Role, parseCsv } from "@fh/shared";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { LISTS_TAG, api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";
import type { Club, ClubRequest, Team, Venue as NamedItem } from "@/lib/types";

const done = (ok: string, ...paths: string[]): FormState => {
  for (const p of paths) revalidatePath(p);
  return { ok };
};

/** For a change to clubs, teams, logos, venues or competitions: the public lists show it straight away. */
const listsChanged = (ok: string, ...paths: string[]): FormState => {
  updateTag(LISTS_TAG);
  return done(ok, ...paths);
};

/** Merges `from` into `into`, both picked on a Merge duplicates form, at the API's merge path for `from`. */
async function merge(fd: FormData, path: (from: string) => string, ...paths: string[]): Promise<FormState> {
  const from = text(fd, "from");
  const into = text(fd, "into");
  if (!from || !into) return { error: "Pick the duplicate and the one to keep." };
  if (from === into) return { error: "Pick two different ones." };
  try {
    const res = await api<{ matches: number }>(path(from), { method: "POST", body: { into } });
    const updated = res.matches === 0 ? "No matches needed changing." : `${res.matches} ${res.matches === 1 ? "match" : "matches"} updated.`;
    return listsChanged(`Merged. ${updated}`, ...paths);
  } catch (err) {
    return formError(err);
  }
}

// ---- Users ----

export async function updateUser(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  const roles = ROLES.filter((r) => fd.get(`role_${r}`) === "on") as Role[];
  const club = optionalText(fd, "clubId");
  try {
    await api(`/v1/users/${id}`, {
      method: "PATCH",
      body: { displayName: text(fd, "displayName"), roles, clubId: club && club !== "none" ? club : null },
    });
  } catch (err) {
    return formError(err);
  }
  return done("Saved.", `/admin/users/${id}`, "/admin/users");
}

export async function deleteUser(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/users/${text(fd, "id")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/users");
  redirect("/admin/users?deleted=1");
}

// ---- Club logos ----

// As the API accepts them.
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_LOGO_BYTES = 512 * 1024;

/** The logo chosen in the form's `logo` field: null if none was, or the reason it won't do. */
function logoFile(fd: FormData): File | null | { error: string } {
  const file = fd.get("logo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!LOGO_TYPES.includes(file.type)) return { error: "The logo must be a PNG, JPEG or WebP image." };
  if (file.size > MAX_LOGO_BYTES) return { error: "The logo must be 512 KB or smaller." };
  return file;
}

const uploadLogo = (clubId: string, file: File) => api<Club>(`/v1/clubs/${clubId}/logo`, { method: "PUT", body: file });

/** For when the club was saved but its logo then wasn't. */
function logoFailed(saved: string, err: unknown): FormState {
  const state = formError(err);
  return { ...state, error: `${saved}, but the logo wasn't: ${state?.error} Add it on the club's page.` };
}

/** Logos show on the public club pages as well as in admin. */
function revalidateClubPages(id: string) {
  updateTag(LISTS_TAG);
  revalidatePath(`/admin/clubs/${id}`);
  revalidatePath("/admin/clubs");
  revalidatePath("/clubs", "layout");
}

export async function setClubLogo(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  const logo = logoFile(fd);
  if (!logo) return { error: "Choose an image for the logo." };
  if (!(logo instanceof File)) return logo;
  try {
    await uploadLogo(id, logo);
  } catch (err) {
    return formError(err);
  }
  revalidateClubPages(id);
  return { ok: "Logo saved." };
}

export async function removeClubLogo(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  try {
    await api(`/v1/clubs/${id}/logo`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidateClubPages(id);
  return { ok: "Logo removed." };
}

// ---- Clubs and teams ----

export async function createClub(_: FormState, fd: FormData): Promise<FormState> {
  const logo = logoFile(fd);
  if (logo && !(logo instanceof File)) return logo;
  let club: Club;
  try {
    club = await api<Club>("/v1/clubs", { method: "POST", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  updateTag(LISTS_TAG);
  revalidatePath("/admin/clubs");
  if (logo) {
    try {
      await uploadLogo(club.id, logo);
    } catch (err) {
      return logoFailed(`${club.name} was added`, err);
    }
  }
  redirect(`/admin/clubs/${club.id}`);
}

export async function renameClub(_: FormState, fd: FormData): Promise<FormState> {
  const id = text(fd, "id");
  try {
    await api(`/v1/clubs/${id}`, { method: "PATCH", body: { name: text(fd, "name"), slug: optionalText(fd, "slug") } });
  } catch (err) {
    return formError(err);
  }
  return listsChanged("Saved.", `/admin/clubs/${id}`, "/admin/clubs");
}

export async function deleteClub(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/clubs/${text(fd, "id")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  updateTag(LISTS_TAG);
  revalidatePath("/admin/clubs");
  redirect("/admin/clubs?deleted=1");
}

export async function mergeClub(_: FormState, fd: FormData): Promise<FormState> {
  return merge(fd, (from) => `/v1/clubs/${from}/merge`, "/admin/clubs", `/admin/clubs/${text(fd, "into")}`);
}

export async function createTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  try {
    await api<Team>(`/v1/clubs/${clubId}/teams`, { method: "POST", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return listsChanged("Team added.", `/admin/clubs/${clubId}`);
}

export async function renameTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  try {
    await api(`/v1/clubs/${clubId}/teams/${text(fd, "teamId")}`, { method: "PATCH", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return listsChanged("Saved.", `/admin/clubs/${clubId}`);
}

export async function deleteTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  try {
    await api(`/v1/clubs/${clubId}/teams/${text(fd, "teamId")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  return listsChanged("Team deleted.", `/admin/clubs/${clubId}`);
}

export async function mergeTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  return merge(fd, (from) => `/v1/clubs/${clubId}/teams/${from}/merge`, `/admin/clubs/${clubId}`);
}

// ---- Venues and competitions ----

/** The lists admins keep for umpires to pick from (the API's /venues and /competitions). */
const LISTS = { venues: "Venue", competitions: "Competition" } as const;
export type ListName = keyof typeof LISTS;

/** The list a form is about, from its hidden `list` field; only ever one of LISTS. */
function list(fd: FormData): ListName {
  const name = text(fd, "list");
  if (!(name in LISTS)) throw new Error(`Not a list: ${name}`);
  return name as ListName;
}

export async function createListItem(_: FormState, fd: FormData): Promise<FormState> {
  const l = list(fd);
  try {
    await api<NamedItem>(`/v1/${l}`, { method: "POST", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return listsChanged(`${LISTS[l]} added.`, `/admin/${l}`);
}

export async function renameListItem(_: FormState, fd: FormData): Promise<FormState> {
  const l = list(fd);
  try {
    await api(`/v1/${l}/${text(fd, "id")}`, { method: "PATCH", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return listsChanged("Saved.", `/admin/${l}`);
}

export async function deleteListItem(_: FormState, fd: FormData): Promise<FormState> {
  const l = list(fd);
  try {
    await api(`/v1/${l}/${text(fd, "id")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  return listsChanged(`${LISTS[l]} deleted.`, `/admin/${l}`);
}

export async function mergeListItem(_: FormState, fd: FormData): Promise<FormState> {
  const l = list(fd);
  return merge(fd, (from) => `/v1/${l}/${from}/merge`, `/admin/${l}`);
}

// ---- Bulk import ----

export type ImportKind = "clubs" | "venues" | "competitions";

/** A bulk import's preview or outcome, with the file's text kept so Import can send it again. */
export type ImportState =
  | {
      kind: ImportKind;
      csv: string;
      /** False for the preview. */
      saved: boolean;
      result: ImportResult;
      /** What to add to a row's index to get its line in the file (1, or 2 after a heading). */
      firstLine: number;
    }
  | { error: string }
  | undefined;

const HEADINGS = new Set(["club", "club name", "name", "venue", "competition"]);

/**
 * Previews a bulk import (the `preview` button) or saves it (`save`), from a CSV file or
 * pasted text. A heading row, if there is one, is left out.
 */
export async function importRows(_: ImportState, fd: FormData): Promise<ImportState> {
  const kind = text(fd, "kind") as ImportKind;
  if (!["clubs", "venues", "competitions"].includes(kind)) return { error: "Choose what to import." };
  const file = fd.get("file");
  const csv = file instanceof File && file.size > 0 ? await file.text() : String(fd.get("csv") ?? "");
  const rows = parseCsv(csv);
  const heading = rows.length > 0 && HEADINGS.has(rows[0]![0]!.toLowerCase());
  const data = heading ? rows.slice(1) : rows;
  if (data.length === 0) return { error: "There's nothing to import: choose a CSV file or paste its rows." };
  if (data.length > 2000) return { error: `That's ${data.length} rows. Import at most 2000 at a time.` };
  const saved = fd.get("save") !== null;
  try {
    const result = await api<ImportResult>("/v1/import", { method: "POST", body: { kind, rows: data, dryRun: !saved } });
    if (saved && result.added.length > 0) {
      updateTag(LISTS_TAG);
      revalidatePath(kind === "clubs" ? "/admin/clubs" : `/admin/${kind}`);
      if (kind === "clubs") revalidatePath("/clubs", "layout");
    }
    return { kind, csv, saved, result, firstLine: heading ? 2 : 1 };
  } catch (err) {
    return { error: formError(err)?.error ?? "Couldn't import that." };
  }
}

// ---- Testing requests ----

export async function reviewAccessRequest(_: FormState, fd: FormData): Promise<FormState> {
  const decision = text(fd, "decision") === "approve" ? "approve" : "deny";
  const note = optionalText(fd, "note");
  try {
    // Both decisions email the umpire; the note goes in it.
    await api(`/v1/access-requests/${text(fd, "id")}/${decision}`, { method: "POST", body: note ? { note } : {} });
  } catch (err) {
    return formError(err);
  }
  return done(decision === "approve" ? "Approved, and emailed." : "Denied, and emailed.", "/admin/access-requests", "/admin");
}

// ---- Club requests ----

export async function reviewRequest(_: FormState, fd: FormData): Promise<FormState> {
  const decision = text(fd, "decision") === "approve" ? "approve" : "reject";
  // Approving a request for a new club can give that club its logo.
  const logo = decision === "approve" ? logoFile(fd) : null;
  if (logo && !(logo instanceof File)) return logo;
  let request: ClubRequest;
  try {
    request = await api<ClubRequest>(`/v1/club-requests/${text(fd, "id")}/${decision}`, { method: "POST" });
  } catch (err) {
    return formError(err);
  }
  if (logo && request.clubId) {
    try {
      await uploadLogo(request.clubId, logo);
    } catch (err) {
      // Not revalidated, so the request stays on the page to show this.
      return logoFailed("Approved", err);
    }
  }
  return listsChanged(decision === "approve" ? "Approved." : "Rejected.", "/admin/requests", "/admin");
}
