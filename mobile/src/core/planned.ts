import type { PlannedMatch } from "@fh/shared";
import { isAppointmentUpcoming } from "./appointments";
import { DEFAULT_SETUP, type WatchSetup, setupErrors } from "./setup";
import type { UpcomingMatch } from "./upcoming";

/**
 * Upcoming on the website. A match planned there joins Upcoming once: delete it and it stays
 * deleted (and goes from the website too). Until it's sent to the watch, it takes in changes
 * made on the website since; it goes if it's deleted there. A match set up on the phone goes
 * to the website once it has a day, and changes made to it on the phone follow; from then on
 * it's like one planned there. Appointments come from their club, so they aren't planned.
 */

const PREFIX = "plan-";

/** Upcoming's id for a match planned on the website. */
export const plannedUpcomingId = (plannedId: string) => `${PREFIX}${plannedId}`;
/** The website's id for a match in Upcoming, or null if it isn't on the website. */
export const plannedIdOf = (u: Pick<UpcomingMatch, "id" | "plannedId">): string | null =>
  u.plannedId ?? (u.id.startsWith(PREFIX) ? u.id.slice(PREFIX.length) : null);
export const isPlannedUpcoming = (u: Pick<UpcomingMatch, "id" | "plannedId">) => plannedIdOf(u) !== null;

/** What the website takes for a planned match (api/src/routes/planned-matches.ts). */
export type PlannedMatchBody = Pick<PlannedMatch, "date" | "time" | "venue" | "competition"> & {
  home: PlannedMatch["home"];
  away: PlannedMatch["away"];
  format: NonNullable<PlannedMatch["format"]>;
};

/**
 * Whether the phone has something for the website: a match set up here that isn't there yet,
 * or changes to one that is. It needs a day, from today, and a setup ready to send.
 */
export function needsPlanning(u: UpcomingMatch, today: string): u is UpcomingMatch & { date: string } {
  if (isAppointmentUpcoming(u) || (isPlannedUpcoming(u) && !u.unsynced)) return false;
  return u.date !== null && u.date >= today && Object.keys(setupErrors(u.setup)).length === 0;
}

/** A match in Upcoming as the website takes it: trimmed, as the watch gets it. */
export function plannedBody(u: UpcomingMatch & { date: string }): PlannedMatchBody {
  const s = u.setup;
  return {
    date: u.date,
    time: u.time,
    home: { name: s.homeName.trim().slice(0, 80), color: s.homeColor, captain: s.homeCaptain },
    away: { name: s.awayName.trim().slice(0, 80), color: s.awayColor, captain: s.awayCaptain },
    venue: s.venue?.trim().slice(0, 120) || null,
    competition: s.competition?.trim().slice(0, 120) || null,
    format: {
      periods: s.periods,
      periodMinutes: s.periodMinutes,
      breakMinutes: s.breakMinutes,
      halfTimeMinutes: s.halfTimeMinutes,
      shootoutIfDrawn: s.shootoutIfDrawn,
    },
  };
}

/**
 * Upcoming once `sent` (a match as it was when it went to the website) is there as `p`. A
 * match changed on the phone since is kept as it is now, still to go; one deleted meanwhile
 * stays deleted, and `kept` is false.
 */
export function afterPlanning(list: readonly UpcomingMatch[], sent: UpcomingMatch, p: PlannedMatch): { list: UpcomingMatch[]; kept: boolean } {
  let kept = false;
  const next = list.map((u) => {
    if (u.id !== sent.id) return u;
    kept = true;
    return { ...u, plannedId: p.id, plannedAt: p.updatedAt, unsynced: u !== sent };
  });
  return { list: next, kept };
}

/** The setup a planned match gives, over what's there already; with no format, the format already there stays. */
export function setupFromPlanned(p: PlannedMatch, base: WatchSetup = DEFAULT_SETUP): WatchSetup {
  return {
    ...base,
    ...(p.format ?? {}),
    homeName: p.home.name,
    homeColor: p.home.color,
    homeCaptain: p.home.captain,
    awayName: p.away.name,
    awayColor: p.away.color,
    awayCaptain: p.away.captain,
    venue: p.venue,
    competition: p.competition,
  };
}

const fromPlanned = (p: PlannedMatch, base: WatchSetup) => ({ setup: setupFromPlanned(p, base), date: p.date, time: p.time, plannedAt: p.updatedAt });

/**
 * Upcoming after fetching your planned matches (from today): new ones added, starting from
 * `base` (the last setup sent) where they leave the format out; unsent ones changed on the
 * website (and not on the phone since) brought up to date; and ones deleted there removed. `added` is every planned match
 * already added once, kept on the phone.
 */
export function applyPlanned(
  list: readonly UpcomingMatch[],
  added: ReadonlySet<string>,
  planned: readonly PlannedMatch[],
  base: WatchSetup,
  today: string,
  now: string,
): { list: UpcomingMatch[]; added: Set<string> } {
  const byId = new Map(planned.map((p) => [p.id, p]));
  const nextAdded = new Set(added);
  const next: UpcomingMatch[] = [];
  for (const u of list) {
    if (!isPlannedUpcoming(u)) {
      next.push(u);
      continue;
    }
    const p = byId.get(plannedIdOf(u)!);
    if (!p) {
      // Deleted on the website: gone, unless it's already been sent or its day has gone.
      if (u.sentAt || (u.date !== null && u.date < today)) next.push(u);
      continue;
    }
    // Changes made on the phone, still to go to the website, win over the website's.
    next.push(u.sentAt || u.unsynced || u.plannedAt === p.updatedAt ? u : { ...u, ...fromPlanned(p, u.setup) });
  }
  for (const [id, p] of byId) {
    if (nextAdded.has(id) || next.some((u) => plannedIdOf(u) === id)) continue;
    next.push({ id: plannedUpcomingId(id), ...fromPlanned(p, base), createdAt: now, sentAt: null });
    nextAdded.add(p.id);
  }
  return { list: next, added: nextAdded };
}
