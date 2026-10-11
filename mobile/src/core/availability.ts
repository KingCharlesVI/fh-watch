import { type AvailabilityDay, TIME_PATTERN, addDays, weekdayOf } from "@fh/shared";

/**
 * Your availability, as the phone shows it: the next 12 weeks, Monday first, as on the
 * website. Tapping a day moves it on from not said, to free, to not free, and back.
 */

export const WEEKS = 12;

export type Mark = "available" | "unavailable" | "clear";
const NEXT: Record<Mark, Mark> = { clear: "available", available: "unavailable", unavailable: "clear" };

export const markOf = (day: AvailabilityDay | undefined): Mark => (day ? (day.available ? "available" : "unavailable") : "clear");
export const nextMark = (day: AvailabilityDay | undefined): Mark => NEXT[markOf(day)];

/** The calendar's days, a week to a row, from the Monday of this week. */
export function calendarWeeks(today: string, weeks = WEEKS): string[][] {
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(monday, w * 7 + d)));
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
