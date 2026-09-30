import type { LocalMatch } from "./store";

/**
 * The umpire's workout during a match, recorded by the watch (FitnessTracker in the
 * Wear OS app) and sent with the match, but kept apart from the match document: it's
 * the umpire's own data, stays on the phone and is never uploaded or published.
 */
export interface Fitness {
  version: 1;
  /** ISO 8601 UTC. */
  startedAt: string;
  endedAt?: string;
  steps?: number;
  distanceM?: number;
  caloriesKcal?: number;
  heartRate?: { avg: number; min: number; max: number };
  /** [seconds since startedAt, beats per minute], in order. */
  heartRateSamples: [number, number][];
}

const num = (v: unknown, max: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;
const isoTime = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** A workout from the watch, checked, or null if it isn't one this app can read. */
export function parseFitness(json: string): Fitness | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.version !== 1 || !isoTime(d.startedAt)) return null;
  const f: Fitness = { version: 1, startedAt: d.startedAt, heartRateSamples: [] };
  if (isoTime(d.endedAt)) f.endedAt = d.endedAt;
  if (num(d.steps, 1e6)) f.steps = Math.round(d.steps);
  if (num(d.distanceM, 1e6)) f.distanceM = d.distanceM;
  if (num(d.caloriesKcal, 1e5)) f.caloriesKcal = d.caloriesKcal;
  const hr = d.heartRate as Record<string, unknown> | undefined;
  if (hr && num(hr.avg, 300) && num(hr.min, 300) && num(hr.max, 300)) f.heartRate = { avg: hr.avg, min: hr.min, max: hr.max };
  if (Array.isArray(d.heartRateSamples)) {
    for (const s of d.heartRateSamples) {
      if (Array.isArray(s) && num(s[0], 86_400) && num(s[1], 300)) f.heartRateSamples.push([s[0], s[1]]);
    }
  }
  return f;
}

/** Minutes from the first period to the final whistle, or null while unknown. */
export function workoutMinutes(f: Fitness): number | null {
  if (!f.endedAt) return null;
  return Math.max(0, Math.round((Date.parse(f.endedAt) - Date.parse(f.startedAt)) / 60_000));
}

/** "5.2 km", or "850 m" under a kilometre. */
export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Label and value pairs for what was recorded, in the order the app shows them. */
export function fitnessStats(f: Fitness): [string, string][] {
  const stats: [string, string][] = [];
  const minutes = workoutMinutes(f);
  if (minutes !== null) stats.push(["Time", `${minutes} min`]);
  if (f.distanceM !== undefined) stats.push(["Distance", formatDistance(f.distanceM)]);
  if (f.steps !== undefined) stats.push(["Steps", f.steps.toLocaleString("en-GB")]);
  if (f.heartRate) {
    stats.push(["Average heart rate", `${f.heartRate.avg} bpm`]);
    stats.push(["Highest heart rate", `${f.heartRate.max} bpm`]);
  }
  if (f.caloriesKcal !== undefined) stats.push(["Calories", `${Math.round(f.caloriesKcal)} kcal`]);
  return stats;
}

/** What goes to Health Connect for a match, or null while there's nothing finished to save. */
export function healthWorkout(m: LocalMatch) {
  const f = m.fitness;
  if (!f?.endedAt || !m.document) return null;
  const { home, away } = m.document.teams;
  return {
    matchId: m.id,
    title: `Umpiring: ${home.name} v ${away.name}`,
    startedAt: f.startedAt,
    endedAt: f.endedAt,
    ...(f.steps !== undefined ? { steps: f.steps } : {}),
    ...(f.distanceM !== undefined ? { distanceM: f.distanceM } : {}),
    ...(f.caloriesKcal !== undefined ? { caloriesKcal: f.caloriesKcal } : {}),
    heartRateSamples: f.heartRateSamples,
  };
}
