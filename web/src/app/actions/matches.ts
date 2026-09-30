"use server";

import type { MatchDocument, ValidationIssue } from "@fh/shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { type FormState, formError, text } from "@/lib/forms";
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

export async function searchTeams(q: string): Promise<TeamWithClub[]> {
  if (q.trim().length < 1) return [];
  return (await api<Items<TeamWithClub>>("/v1/teams", { query: { q } })).items;
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
