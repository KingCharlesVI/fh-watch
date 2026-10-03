"use server";

import { ROLES, type Role } from "@fh/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { type FormState, formError, optionalText, text } from "@/lib/forms";
import type { Club, Team } from "@/lib/types";

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

// ---- Clubs and teams ----

export async function createClub(_: FormState, fd: FormData): Promise<FormState> {
  let club: Club;
  try {
    club = await api<Club>("/v1/clubs", { method: "POST", body: { name: text(fd, "name") } });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/admin/clubs");
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
  try {
    await api(`/v1/club-requests/${text(fd, "id")}/${decision}`, { method: "POST" });
  } catch (err) {
    return formError(err);
  }
  return done(decision === "approve" ? "Approved." : "Rejected.", "/admin/requests", "/admin");
}
