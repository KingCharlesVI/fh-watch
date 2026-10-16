import type { PlannedMatch } from "@fh/shared";
import { DEFAULT_SETUP, type WatchSetup } from "./setup";
import type { UpcomingMatch } from "./upcoming";

/**
 * Matches planned on the website, on the phone. Each joins Upcoming once: delete it and it
 * stays deleted (and goes from the website too). Until it's sent to the watch, it takes in
 * changes made on the website since; it goes if it's deleted there.
 */

const PREFIX = "plan-";

/** Upcoming's id for a planned match. */
export const plannedUpcomingId = (plannedId: string) => `${PREFIX}${plannedId}`;
export const isPlannedUpcoming = (u: Pick<UpcomingMatch, "id">) => u.id.startsWith(PREFIX);
/** The website's id for a planned match in Upcoming. */
export const plannedIdOf = (u: Pick<UpcomingMatch, "id">) => u.id.slice(PREFIX.length);

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
 * website brought up to date; and ones deleted there removed. `added` is every planned match
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
  const byId = new Map(planned.map((p) => [plannedUpcomingId(p.id), p]));
  const nextAdded = new Set(added);
  const next: UpcomingMatch[] = [];
  for (const u of list) {
    if (!isPlannedUpcoming(u)) {
      next.push(u);
      continue;
    }
    const p = byId.get(u.id);
    if (!p) {
      // Deleted on the website: gone, unless it's already been sent or its day has gone.
      if (u.sentAt || (u.date !== null && u.date < today)) next.push(u);
      continue;
    }
    next.push(u.sentAt || u.plannedAt === p.updatedAt ? u : { ...u, ...fromPlanned(p, u.setup) });
  }
  for (const [id, p] of byId) {
    if (nextAdded.has(p.id) || next.some((u) => u.id === id)) continue;
    next.push({ id, ...fromPlanned(p, base), createdAt: now, sentAt: null });
    nextAdded.add(p.id);
  }
  return { list: next, added: nextAdded };
}
