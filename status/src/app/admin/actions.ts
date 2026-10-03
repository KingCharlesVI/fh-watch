"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, passwordMatches, requireAdmin, startSession } from "@/lib/admin-auth";
import type { ComponentId } from "@/lib/components";
import { COMPONENT_IDS } from "@/lib/incidents";
import { db } from "@/lib/db/client";
import { componentNotes, incidentUpdates, incidents } from "@/lib/db/schema";
import { INCIDENT_STATES, type IncidentState, LEVELS, type Level } from "@/lib/status";

/** Everything the admin page can do. Each one checks the session first. */

export interface Result {
  error?: string;
  ok?: string;
}

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

const level = (value: string): Level => (LEVELS.includes(value as Level) ? (value as Level) : "degraded");
const state = (value: string): IncidentState => (INCIDENT_STATES.includes(value as IncidentState) ? (value as IncidentState) : "investigating");

/** Only the ids this page knows about, so a hand-made form can't invent components. */
const chosenComponents = (form: FormData): ComponentId[] =>
  form.getAll("components").map(String).filter((id): id is ComponentId => (COMPONENT_IDS as string[]).includes(id));

/** A datetime-local value, read as UTC (the form says so). Empty: now. */
function when(value: string): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}${value.length === 16 ? ":00" : ""}Z`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/** "2026-10-04-uploads-timing-out", and never the same one twice. */
async function makeId(title: string, startedAt: Date): Promise<string> {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const base = `${startedAt.toISOString().slice(0, 10)}-${slug || "incident"}`;
  const taken = new Set((await db.select({ id: incidents.id }).from(incidents)).map((r) => r.id));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

const refresh = () => {
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/admin");
};

// ---- Signing in ----------------------------------------------------------

export async function signIn(_: Result | undefined, form: FormData): Promise<Result> {
  if (!passwordMatches(text(form, "password"))) {
    // Slow enough to make guessing tedious, quick enough not to look broken.
    await new Promise((done) => setTimeout(done, 600));
    return { error: "That isn't the password." };
  }
  await startSession();
  redirect("/admin");
}

export async function signOut(): Promise<void> {
  await endSession();
  redirect("/admin");
}

// ---- Incidents -----------------------------------------------------------

export async function createIncident(_: Result | undefined, form: FormData): Promise<Result> {
  await requireAdmin();
  const title = text(form, "title");
  if (!title) return { error: "It needs a title." };
  const components = chosenComponents(form);
  if (components.length === 0) return { error: "Say what it affects." };

  const maintenance = text(form, "kind") === "maintenance";
  const startedAt = when(text(form, "startedAt"));
  const id = await makeId(title, startedAt);
  const body = text(form, "body");

  await db.insert(incidents).values({
    id,
    kind: maintenance ? "maintenance" : "incident",
    title,
    level: maintenance ? "maintenance" : level(text(form, "level")),
    state: maintenance ? "investigating" : state(text(form, "state")),
    components,
    startedAt,
    endsAt: maintenance ? when(text(form, "endsAt")) : null,
  });
  if (body) {
    await db.insert(incidentUpdates).values({ incidentId: id, state: maintenance ? "investigating" : state(text(form, "state")), body, at: new Date() });
  }
  refresh();
  return { ok: maintenance ? "Maintenance scheduled." : "Incident posted." };
}

export async function addUpdate(_: Result | undefined, form: FormData): Promise<Result> {
  await requireAdmin();
  const id = text(form, "id");
  const body = text(form, "body");
  if (!body) return { error: "Say what's happened." };
  const next = state(text(form, "state"));
  const finished = next === "fixed" || form.get("resolve") === "on";

  await db.insert(incidentUpdates).values({ incidentId: id, state: finished ? "fixed" : next, body, at: new Date() });
  await db
    .update(incidents)
    .set({ state: finished ? "fixed" : next, ...(finished ? { resolvedAt: new Date() } : {}) })
    .where(eq(incidents.id, id));
  refresh();
  return { ok: finished ? "Posted, and marked over." : "Update posted." };
}

/** Ends something without another update: for maintenance that simply finished. */
export async function resolveIncident(_: Result | undefined, form: FormData): Promise<Result> {
  await requireAdmin();
  await db
    .update(incidents)
    .set({ state: "fixed", resolvedAt: new Date() })
    .where(eq(incidents.id, text(form, "id")));
  refresh();
  return { ok: "Marked over." };
}

export async function deleteIncident(_: Result | undefined, form: FormData): Promise<Result> {
  await requireAdmin();
  await db.delete(incidents).where(eq(incidents.id, text(form, "id")));
  refresh();
  return { ok: "Deleted." };
}

// ---- Component notes -----------------------------------------------------

export async function setComponentNote(_: Result | undefined, form: FormData): Promise<Result> {
  await requireAdmin();
  const id = text(form, "id");
  if (!(COMPONENT_IDS as string[]).includes(id)) return { error: "No such component." };
  const chosen = level(text(form, "level"));
  const note = text(form, "note");

  if (chosen === "operational" && !note) {
    await db.delete(componentNotes).where(eq(componentNotes.id, id));
    refresh();
    return { ok: "Back to normal." };
  }
  await db
    .insert(componentNotes)
    .values({ id, level: chosen, note: note || null, at: new Date() })
    .onConflictDoUpdate({ target: componentNotes.id, set: { level: chosen, note: note || null, at: new Date() } });
  refresh();
  return { ok: "Saved." };
}
