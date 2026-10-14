import { type AvailabilityDay, TIME_PATTERN, addDays, weekdayOf } from "@fh/shared";

/**
 * Your availability, as the phone shows it: a month at a time, Monday first, up to a year
 * ahead. Tapping a day moves it on from not said, to free, to not free, and back.
 */

/** How many months the calendar goes to, this one included. */
export const MONTHS_AHEAD = 12;
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export type Mark = "available" | "unavailable" | "clear";
const NEXT: Record<Mark, Mark> = { clear: "available", available: "unavailable", unavailable: "clear" };

export const markOf = (day: AvailabilityDay | undefined): Mark => (day ? (day.available ? "available" : "unavailable") : "clear");
export const nextMark = (day: AvailabilityDay | undefined): Mark => NEXT[markOf(day)];

/** "2026-10" plus some months. */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m! - 1]} ${y}`;
}

/** The last day of a month, "2026-10-31". */
export const lastDay = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1);

/** A month's days, a week to a row, Monday first; null pads the first and last weeks. */
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const days = Number(lastDay(month).slice(8));
  const cells: (string | null)[] = [...Array<null>((weekdayOf(first) + 6) % 7).fill(null), ...Array.from({ length: days }, (_, i) => addDays(first, i))];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

export type Tone = "free" | "busy" | "usually-busy" | "unknown";

/** How a day reads: what's marked on it, or else whether it's a weekday you're never free. */
export function dayStatus(day: AvailabilityDay | undefined, neverFree: boolean): { tone: Tone; label: string } {
  if (day && !day.available) return { tone: "busy", label: "Not free" };
  if (day) return { tone: "free", label: day.from || day.to ? `${day.from ?? ""}–${day.to ?? ""}` : "Free" };
  return neverFree ? { tone: "usually-busy", label: "Not free" } : { tone: "unknown", label: "" };
}

/** The marked days after one changes: marking replaces the day, unmarking removes it. */
export function withMark(
  days: ReadonlyMap<string, AvailabilityDay>,
  date: string,
  mark: Mark,
  hours: { from: string | null; to: string | null } = { from: null, to: null },
): Map<string, AvailabilityDay> {
  const next = new Map(days);
  if (mark === "clear") next.delete(date);
  else next.set(date, { date, available: mark === "available", ...(mark === "available" ? hours : { from: null, to: null }) });
  return next;
}

/** Hours as typed, "10:00" and "16:00", either left blank; or why they won't do. */
export function readHours(from: string, to: string): { from: string | null; to: string | null } | { error: string } {
  const f = from.trim() || null;
  const t = to.trim() || null;
  if ((f && !TIME_PATTERN.test(f)) || (t && !TIME_PATTERN.test(t))) return { error: "Use 24-hour times, e.g. 14:00." };
  if (!f && !t) return { error: "Give the hours you can do: from, until or both." };
  if (f && t && f >= t) return { error: "The hours must end after they start." };
  return { from: f, to: t };
}
