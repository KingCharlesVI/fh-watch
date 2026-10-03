import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import { COMPONENTS, type ComponentId } from "./components";
import { db, read } from "./db/client";
import { componentNotes, incidentUpdates, incidents } from "./db/schema";
import { type IncidentState, type Level, isDown, worst } from "./status";

export interface Update {
  state: IncidentState;
  body: string;
  at: Date;
}

export interface Incident {
  id: string;
  kind: "incident" | "maintenance";
  title: string;
  level: Level;
  state: IncidentState;
  components: ComponentId[];
  startedAt: Date;
  resolvedAt: Date | null;
  endsAt: Date | null;
  updates: Update[];
}

export interface Note {
  id: ComponentId;
  level: Level;
  note: string | null;
  at: Date;
}

export const UPTIME_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const since = (days: number) => new Date(Date.now() - days * DAY_MS);

/** An incident with its updates, newest update first. */
async function withUpdates(rows: (typeof incidents.$inferSelect)[]): Promise<Incident[]> {
  if (rows.length === 0) return [];
  const all = await db.select().from(incidentUpdates).orderBy(desc(incidentUpdates.at));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    level: r.level,
    state: r.state,
    components: r.components,
    startedAt: r.startedAt,
    resolvedAt: r.resolvedAt,
    endsAt: r.endsAt,
    updates: all.filter((u) => u.incidentId === r.id).map((u) => ({ state: u.state, body: u.body, at: u.at })),
  }));
}

/** Everything still going on: unresolved incidents, and maintenance that's started. */
export const openIncidents = () =>
  read(async () => {
    const rows = await db.select().from(incidents).where(isNull(incidents.resolvedAt)).orderBy(desc(incidents.startedAt));
    return withUpdates(rows.filter((r) => r.startedAt.getTime() <= Date.now()));
  }, [] as Incident[]);

/** Maintenance that hasn't started yet, soonest first. */
export const upcomingMaintenance = () =>
  read(async () => {
    const rows = await db
      .select()
      .from(incidents)
      .where(and(eq(incidents.kind, "maintenance"), isNull(incidents.resolvedAt)))
      .orderBy(incidents.startedAt);
    return withUpdates(rows.filter((r) => r.startedAt.getTime() > Date.now()));
  }, [] as Incident[]);

/** The history: everything that started in the window, newest first. */
export const recentIncidents = (days = UPTIME_DAYS) =>
  read(async () => {
    const rows = await db.select().from(incidents).where(gte(incidents.startedAt, since(days))).orderBy(desc(incidents.startedAt));
    return withUpdates(rows);
  }, [] as Incident[]);

export const incidentById = (id: string) =>
  read(async () => {
    const rows = await db.select().from(incidents).where(eq(incidents.id, id));
    return (await withUpdates(rows))[0] ?? null;
  }, null as Incident | null);

/** The states set by hand, for components nothing can check from outside. */
export const componentStateNotes = () =>
  read(async () => {
    const rows = await db.select().from(componentNotes);
    return rows.map((r) => ({ id: r.id as ComponentId, level: r.level, note: r.note, at: r.at })) satisfies Note[];
  }, [] as Note[]);

/** All of it in one round trip's worth of queries, for the front page. */
export async function loadBoard() {
  const [open, upcoming, history, notes] = await Promise.all([
    openIncidents(),
    upcomingMaintenance(),
    recentIncidents(),
    componentStateNotes(),
  ]);
  return {
    open: open.data,
    upcoming: upcoming.data,
    history: history.data,
    notes: notes.data,
    /** False when the database couldn't be read: the page says so rather than lying. */
    ok: open.ok && upcoming.ok && history.ok && notes.ok,
  };
}

// ---- Uptime --------------------------------------------------------------

/** When an incident was actually affecting things, clamped to the window. */
function overlap(incident: Incident, from: number, to: number): number {
  const start = Math.max(incident.startedAt.getTime(), from);
  const end = Math.min(incident.resolvedAt?.getTime() ?? Date.now(), to);
  return Math.max(0, end - start);
}

/**
 * Uptime per component over the window, from the incidents recorded against it:
 * the time it spent in a partial or major outage, against the whole window.
 * Degraded performance and planned maintenance don't count as down, the same way
 * Cachet's own uptime reads.
 */
export function uptime(history: Incident[], id: ComponentId, days = UPTIME_DAYS): number {
  const to = Date.now();
  const from = to - days * DAY_MS;
  const down = history
    .filter((i) => i.kind === "incident" && isDown(i.level) && i.components.includes(id))
    .reduce((ms, i) => ms + overlap(i, from, to), 0);
  return Math.max(0, 1 - down / (to - from));
}

export interface Day {
  /** Midnight UTC that day. */
  date: Date;
  level: Level;
  incidents: Incident[];
}

/** One bar per day for a component: the worst thing that happened to it that day. */
export function days(history: Incident[], id: ComponentId, count = UPTIME_DAYS): Day[] {
  const midnight = new Date();
  midnight.setUTCHours(0, 0, 0, 0);
  const mine = history.filter((i) => i.components.includes(id));
  return Array.from({ length: count }, (_, n) => {
    const date = new Date(midnight.getTime() - (count - 1 - n) * DAY_MS);
    const from = date.getTime();
    const to = from + DAY_MS;
    const touching = mine.filter((i) => overlap(i, from, to) > 0);
    return { date, level: worst(touching.map((i) => i.level)), incidents: touching };
  });
}

/** The ids an incident can be filed against, for the admin form. */
export const COMPONENT_IDS = COMPONENTS.map((c) => c.id);
