"use server";

import { ROLES, type Role } from "@fh/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";
import type { Club, ClubRequest, Team, Venue } from "@/lib/types";

const done = (ok: string, ...paths: string[]): FormState => {
  for (const p of paths) revalidatePath(p);
  return { ok };
};

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
  return done("Saved.", `/admin/clubs/${id}`, "/admin/clubs");
}

export async function deleteClub(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/clubs/${text(fd, "id")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/clubs");
  redirect("/admin/clubs?deleted=1");
}

export async function createTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  try {
    await api<Team>(`/v1/clubs/${clubId}/teams`, { method: "POST", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return done("Team added.", `/admin/clubs/${clubId}`);
}

export async function renameTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  try {
    await api(`/v1/clubs/${clubId}/teams/${text(fd, "teamId")}`, { method: "PATCH", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return done("Saved.", `/admin/clubs/${clubId}`);
}

export async function deleteTeam(_: FormState, fd: FormData): Promise<FormState> {
  const clubId = text(fd, "clubId");
  try {
    await api(`/v1/clubs/${clubId}/teams/${text(fd, "teamId")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  return done("Team deleted.", `/admin/clubs/${clubId}`);
}

// ---- Venues ----

export async function createVenue(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api<Venue>("/v1/venues", { method: "POST", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return done("Venue added.", "/admin/venues");
}

export async function renameVenue(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/venues/${text(fd, "id")}`, { method: "PATCH", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  return done("Saved.", "/admin/venues");
}

export async function deleteVenue(_: FormState, fd: FormData): Promise<FormState> {
  try {
    await api(`/v1/venues/${text(fd, "id")}`, { method: "DELETE" });
  } catch (err) {
    return formError(err);
  }
  return done("Venue deleted.", "/admin/venues");
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
  return done(decision === "approve" ? "Approved." : "Rejected.", "/admin/requests", "/admin");
}
