import type { MyAppointment } from "@fh/shared";
import { DEFAULT_SETUP, type WatchSetup } from "./setup";
import type { UpcomingMatch } from "./upcoming";

/**
 * Appointments from clubs, on the phone. A fixture you've accepted as its watch umpire joins
 * Upcoming, set up from the fixture, ready to send to the watch. It's added once: delete it
 * and it stays deleted. Until it's sent, it follows changes the club makes; it goes if you're
 * taken off. Second umpires aren't in Upcoming, as they don't run the watch.
 */

/** Upcoming's id for an appointment's match. */
export const upcomingId = (appointmentId: string) => `appt-${appointmentId}`;
export const isAppointmentUpcoming = (u: Pick<UpcomingMatch, "id">) => u.id.startsWith("appt-");

const asWatchUmpire = (a: MyAppointment) => a.status === "accepted" && a.role === "watch";

/** The setup a fixture gives, over what's there already (colours and captains are the umpire's). */
export function setupFrom(a: MyAppointment, base: WatchSetup = DEFAULT_SETUP): WatchSetup {
  const f = a.fixture;
  return {
    ...base,
    ...(f.format
      ? {
          periods: f.format.periods,
          periodMinutes: f.format.periodMinutes,
          breakMinutes: f.format.breakMinutes,
          halfTimeMinutes: f.format.halfTimeMinutes,
          shootoutIfDrawn: f.format.shootoutIfDrawn,
        }
      : {}),
    homeName: f.home.name,
    awayName: f.away.name,
    venue: f.venue,
    competition: f.competition,
  };
}

/**
 * Upcoming after fetching your appointments (from today): new watch appointments added,
 * unsent ones brought up to date, and ones you're no longer on (from today) removed.
 * `added` is every appointment already added once, kept on the phone.
 */
export function applyAppointments(
  list: readonly UpcomingMatch[],
  added: ReadonlySet<string>,
  appointments: readonly MyAppointment[],
  today: string,
  now: string,
): { list: UpcomingMatch[]; added: Set<string> } {
  const mine = new Map(appointments.filter(asWatchUmpire).map((a) => [upcomingId(a.id), a]));
  const nextAdded = new Set(added);
  const next: UpcomingMatch[] = [];
  for (const u of list) {
    if (!isAppointmentUpcoming(u)) {
      next.push(u);
      continue;
    }
    const a = mine.get(u.id);
    if (!a) {
      // Taken off, declined or covered: gone, unless it's already been sent or played.
      if (u.sentAt || (u.date !== null && u.date < today)) next.push(u);
      continue;
    }
    next.push(u.sentAt ? u : { ...u, setup: setupFrom(a, u.setup), date: a.fixture.date, time: a.fixture.time });
  }
  for (const [id, a] of mine) {
    if (nextAdded.has(a.id) || next.some((u) => u.id === id)) continue;
    next.push({ id, setup: setupFrom(a), date: a.fixture.date, time: a.fixture.time, createdAt: now, sentAt: null });
    nextAdded.add(a.id);
  }
  return { list: next, added: nextAdded };
}

export interface Reminder {
  id: string;
  at: Date;
  title: string;
  body: string;
}

/** When to remind about an appointment: 6pm the day before, in the phone's own time. */
export const REMINDER_HOUR = 18;

/** A reminder the day before each appointment you've accepted, that's still to come. */
export function appointmentReminders(appointments: readonly MyAppointment[], now: Date): Reminder[] {
  return appointments
    .filter((a) => a.status === "accepted")
    .flatMap((a) => {
      const [y, m, d] = a.fixture.date.split("-").map(Number);
      const at = new Date(y!, m! - 1, d! - 1, REMINDER_HOUR, 0);
      if (at <= now) return [];
      const f = a.fixture;
      const where = [f.time ? `at ${f.time}` : null, f.venue ? `at ${f.venue}` : null].filter(Boolean).join(" ");
      const role = a.role === "watch" ? "watch umpire" : "second umpire";
      return [
        {
          id: `appointment:${a.id}`,
          at,
          title: `Umpiring tomorrow: ${f.home.name} v ${f.away.name}`,
          body: `You're the ${role}${where ? ` ${where}` : ""}${a.colleague ? `, with ${a.colleague.displayName}` : ""}.`,
        },
      ];
    });
}
