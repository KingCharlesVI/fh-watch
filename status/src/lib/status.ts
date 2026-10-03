/**
 * The four states a thing can be in, borrowed from Cachet, and how they add up.
 * Worst wins: one major outage makes the whole page say so.
 */

export const LEVELS = ["operational", "degraded", "partial", "major", "maintenance"] as const;
export type Level = (typeof LEVELS)[number];

/** How bad each one is. Maintenance sits outside: planned, so never an outage. */
const RANK: Record<Level, number> = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };

export const worst = (levels: Level[]): Level =>
  levels.length === 0 ? "operational" : levels.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), "operational");

/** Does this level mean something is actually wrong? Used for uptime. */
export const isDown = (level: Level) => level === "partial" || level === "major";

export const LEVEL_TEXT: Record<Level, { label: string; summary: string }> = {
  operational: { label: "Operational", summary: "All systems operational" },
  maintenance: { label: "Under maintenance", summary: "Maintenance in progress" },
  degraded: { label: "Degraded performance", summary: "Some systems are slow" },
  partial: { label: "Partial outage", summary: "Some systems are down" },
  major: { label: "Major outage", summary: "Major outage" },
};

/** Tailwind classes per level, so one place decides what each colour means. */
export const LEVEL_LOOK: Record<Level, { dot: string; text: string; bar: string; band: string }> = {
  operational: { dot: "bg-ok", text: "text-ok", bar: "bg-ok", band: "border-ok/30 bg-ok/10" },
  maintenance: { dot: "bg-info", text: "text-info", bar: "bg-info", band: "border-info/30 bg-info/10" },
  degraded: { dot: "bg-warn", text: "text-warn", bar: "bg-warn", band: "border-warn/30 bg-warn/10" },
  partial: { dot: "bg-bad", text: "text-bad", bar: "bg-bad", band: "border-bad/30 bg-bad/10" },
  major: { dot: "bg-bad", text: "text-bad", bar: "bg-bad", band: "border-bad/40 bg-bad/15" },
};

/** Incident stages, in the order they happen. */
export const INCIDENT_STATES = ["investigating", "identified", "watching", "fixed"] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];

export const INCIDENT_STATE_LABEL: Record<IncidentState, string> = {
  investigating: "Investigating",
  identified: "Identified",
  watching: "Watching",
  fixed: "Fixed",
};
