import { DEFAULT_SETUP, type WatchSetup } from "./setup";

/**
 * Upcoming matches: setups made ahead of time and kept on the phone, then sent to the
 * watch at the ground. Only the setup goes to the watch; the date and time are the
 * phone's, to put the list in order.
 */
export interface UpcomingMatch {
  id: string;
  setup: WatchSetup;
  /** The day, "2026-10-11", or null if not set. */
  date: string | null;
  /** Kick-off, "14:00", or null if not set. */
  time: string | null;
  createdAt: string;
  /** When it was last sent to the watch. */
  sentAt: string | null;
}

/** How far ahead a match can be dated: two weeks covers the next couple of fixtures. */
export const DAYS_AHEAD = 14;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The saved list, skipping anything unreadable; setups pick up fields added since. */
export function readUpcoming(saved: string | null | undefined): UpcomingMatch[] {
  if (!saved) return [];
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((u): u is UpcomingMatch => typeof u === "object" && u !== null && typeof (u as UpcomingMatch).id === "string")
      .map((u) => ({ ...u, setup: { ...DEFAULT_SETUP, ...u.setup }, date: u.date ?? null, time: u.time ?? null, sentAt: u.sentAt ?? null }));
  } catch {
    return [];
  }
}

/** Soonest first; undated ones after, oldest first. */
export function sortUpcoming(list: readonly UpcomingMatch[]): UpcomingMatch[] {
  const key = (u: UpcomingMatch) => (u.date ? `0 ${u.date} ${u.time ?? "99:99"}` : `1 ${u.createdAt}`);
  return [...list].sort((a, b) => key(a).localeCompare(key(b)));
}

/** Adds the match, or replaces the one with its id. */
export function saveUpcoming(list: readonly UpcomingMatch[], match: UpcomingMatch): UpcomingMatch[] {
  return list.some((u) => u.id === match.id) ? list.map((u) => (u.id === match.id ? match : u)) : [...list, match];
}

export function removeUpcoming(list: readonly UpcomingMatch[], id: string): UpcomingMatch[] {
  return list.filter((u) => u.id !== id);
}

/** "2026-10-11" for a date, in the phone's own time zone. */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDay(day: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

/** "Today", "Tomorrow", or "Sat 11 Oct". */
export function dayLabel(day: string, today: Date): string {
  const d = parseDay(day);
  if (day === isoDay(today)) return "Today";
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (day === isoDay(tomorrow)) return "Tomorrow";
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** The days a match can be put on, from today: value and label. */
export function upcomingDays(today: Date, days = DAYS_AHEAD): { value: string; label: string }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
    return { value: day, label: dayLabel(day, today) };
  });
}

/** When, for the list: "Sat 11 Oct, 14:00", "Today", or null if there's no date. */
export function whenLabel(u: Pick<UpcomingMatch, "date" | "time">, today: Date): string | null {
  if (!u.date) return null;
  return u.time ? `${dayLabel(u.date, today)}, ${u.time}` : dayLabel(u.date, today);
}

/** Whether the day has gone. */
export function isPast(u: Pick<UpcomingMatch, "date">, today: Date): boolean {
  return u.date !== null && u.date < isoDay(today);
}

/** A kick-off as typed, "14:00" or "9:30", made "09:30"; null if it isn't a time. */
export function parseTime(typed: string): string | null {
  const m = /^(\d{1,2})[:.](\d{2})$/.exec(typed.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
