import type { MatchDocument } from "@fh/shared";
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

/** "Today", "Tomorrow", "Sat 11 Oct", or "Sat 9 Jan 2027" in another year. */
export function dayLabel(day: string, today: Date): string {
  const d = parseDay(day);
  if (day === isoDay(today)) return "Today";
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (day === isoDay(tomorrow)) return "Tomorrow";
  const year = d.getFullYear() === today.getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "14:05" for a time of day, in the phone's own time zone. */
export function clockTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Where the date and time pickers start: the match's day and kick-off, or today at 14:00. */
export function pickerStart(u: Pick<UpcomingMatch, "date" | "time">, today: Date): Date {
  const d = u.date ? parseDay(u.date) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [h, m] = (u.time ?? "14:00").split(":").map(Number);
  d.setHours(h!, m!);
  return d;
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

/**
 * Upcoming matches that have been played: sent to the watch, and a match between the
 * same two teams came back from it, started after it was sent. They've done their job.
 */
export function playedUpcoming(list: readonly UpcomingMatch[], played: readonly Pick<MatchDocument, "teams" | "startedAt">[]): string[] {
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  return list
    .filter(
      (u) =>
        u.sentAt !== null &&
        played.some((m) => same(m.teams.home.name, u.setup.homeName) && same(m.teams.away.name, u.setup.awayName) && Date.parse(m.startedAt) >= Date.parse(u.sentAt!)),
    )
    .map((u) => u.id);
}
