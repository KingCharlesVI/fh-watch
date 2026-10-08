import type { FixtureFormat } from "./api-types.js";
import { type Actor, hasRole } from "./policy.js";

/**
 * Club umpiring: each club's umpire list, its fixtures, and who's appointed to them. Club
 * admins run it for their club. It's extra: umpires still set up and umpire any match
 * themselves, for any club or none.
 */

/**
 * Qualification levels, lowest first. A club umpire's level and a competition's minimum are stored as an index into this,
 * so a new level goes in with a migration that moves the stored ones (as 0016 did for Level 1 (Assessed)).
 */
export const UMPIRE_LEVELS = ["Trainee", "Level 1 (Unassessed)", "Level 1 (Assessed)", "Level 2", "Level 3", "National"] as const;

/** A level's name, or null for none recorded. */
export function umpireLevelName(level: number | null | undefined): string | null {
  return level === null || level === undefined ? null : (UMPIRE_LEVELS[level] ?? null);
}

/** The watch's format presets (its Setup.PRESETS, and the phone's), for a fixture to name one. */
export const FORMAT_PRESETS: { key: string; label: string; format: FixtureFormat }[] = [
  { key: "4x15", label: "4 × 15 min", format: { periods: 4, periodMinutes: 15, breakMinutes: 2, halfTimeMinutes: 5, shootoutIfDrawn: false } },
  { key: "2x35", label: "2 × 35 min", format: { periods: 2, periodMinutes: 35, breakMinutes: 10, halfTimeMinutes: 5, shootoutIfDrawn: false } },
  { key: "2x30", label: "2 × 30 min", format: { periods: 2, periodMinutes: 30, breakMinutes: 5, halfTimeMinutes: 5, shootoutIfDrawn: false } },
  { key: "2x25", label: "2 × 25 min", format: { periods: 2, periodMinutes: 25, breakMinutes: 5, halfTimeMinutes: 5, shootoutIfDrawn: false } },
];

/** The preset a format is, if it's one. */
export function formatPreset(format: FixtureFormat | null | undefined) {
  if (!format) return undefined;
  return FORMAT_PRESETS.find(
    (p) =>
      p.format.periods === format.periods &&
      p.format.periodMinutes === format.periodMinutes &&
      p.format.breakMinutes === format.breakMinutes &&
      p.format.halfTimeMinutes === format.halfTimeMinutes,
  );
}

/** Fixture dates and kick-offs are local times here, as the match reports are. */
export const UMPIRING_TIME_ZONE = "Europe/London";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: UMPIRING_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** The local day, "2026-10-11", of an instant. */
export function localDay(at: Date): string {
  return dayFormat.format(at);
}

/** A kick-off time, "14:00" (24-hour). */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A day as a spreadsheet may have it, "2026-10-11", "11/10/2026" or "11/10/26" (day first,
 * as in the UK), as "2026-10-11"; null if it isn't a real date.
 */
export function readDay(value: string): string | null {
  const v = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  const uk = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v);
  const [y, m, d] = iso ? [+iso[1]!, +iso[2]!, +iso[3]!] : uk ? [+uk[3]! + (uk[3]!.length === 2 ? 2000 : 0), +uk[2]!, +uk[1]!] : [];
  if (y === undefined || m === undefined || d === undefined) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** A kick-off as a spreadsheet may have it, "14:00", "2pm", "14.00" or "1430", as "14:00"; null if it isn't one. */
export function readTime(value: string): string | null {
  const v = value.trim().toLowerCase().replace(/\s+/g, "");
  const m = /^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm)?$/.exec(v);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3]) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (m[3] === "pm" ? 12 : 0);
  } else if (!m[2]) {
    return null; // "14" alone is too ambiguous
  }
  const time = `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  return TIME_PATTERN.test(time) ? time : null;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Sat 26 Sep 2026, 14:00", or without the time when there's none. */
export function fixtureWhen(day: string, time: string | null): string {
  const [y, m, d] = day.split("-").map(Number);
  const label = `${WEEKDAY_NAMES[weekdayOf(day)]} ${d} ${MONTH_NAMES[m! - 1]} ${y}`;
  return time ? `${label}, ${time}` : label;
}

/** The hockey season a day is in starts on 1 August: "2026-08-01" for any day from then to the next July. */
export function seasonStart(day: string): string {
  const year = Number(day.slice(0, 4));
  return day.slice(5) >= "08-01" ? `${year}-08-01` : `${year - 1}-08-01`;
}

/** Minutes between two kick-offs, "14:00" and "15:30". */
export function minutesBetween(a: string, b: string): number {
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return Math.abs(mins(a) - mins(b));
}

/** The weekday of a day, "2026-10-11", 0 for Sunday to 6 for Saturday. */
export function weekdayOf(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay();
}

/** "2026-10-11" plus some days. */
export function addDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! + days)).toISOString().slice(0, 10);
}

/**
 * Whether an umpire can do a kick-off: a day they've marked says so (and, with hours, whether
 * the kick-off is within them); otherwise a weekday they're never free says no; otherwise
 * nobody knows.
 */
export function availabilityFor(
  day: string,
  time: string | null,
  marked: { available: boolean; from: string | null; to: string | null } | undefined,
  unavailableWeekdays: readonly number[],
): "available" | "unavailable" | "unknown" {
  if (marked) {
    if (!marked.available) return "unavailable";
    if (time && marked.from && time < marked.from) return "unavailable";
    if (time && marked.to && time > marked.to) return "unavailable";
    return "available";
  }
  return unavailableWeekdays.includes(weekdayOf(day)) ? "unavailable" : "unknown";
}

/** Run a club's umpiring (its umpire list, fixtures and appointments): its club admins, and admins. */
export function canManageUmpiring(actor: Actor | null | undefined, clubId: string): boolean {
  return hasRole(actor, "admin") || (hasRole(actor, "club_admin") && actor!.clubId === clubId);
}
