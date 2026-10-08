import { type UmpireSuggestion, UMPIRE_LEVELS, availabilityFor, minutesBetween, seasonStart } from "@fh/shared";
import { and, count, eq, gte, inArray, ne, or, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { appointments, clubUmpires, competitionUmpireLevels, competitions, fixtures, teams, users } from "../db/schema.js";
import { availabilityOf } from "./umpiring.js";

type FixtureRow = typeof fixtures.$inferSelect;

/** A match takes about 90 minutes with its breaks: kick-offs closer than this can't both be done. */
const SAME_TIME_MINUTES = 105;
/** Kick-offs at different grounds closer than this leave little time to travel between them. */
const TRAVEL_MINUTES = 180;

/** Appointments for the club each umpire has accepted this season. */
export async function seasonAppointmentCounts(db: DbOrTx, clubId: string, today: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: appointments.userId, n: count() })
    .from(appointments)
    .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
    .where(and(eq(fixtures.clubId, clubId), eq(appointments.status, "accepted"), gte(fixtures.date, seasonStart(today))))
    .groupBy(appointments.userId);
  return new Map(rows.map((r) => [r.userId, r.n]));
}

/**
 * The club's umpires as choices for a fixture, best first: available before unknown before
 * not, those with nothing against them first, then whoever has done fewest this season.
 */
export async function suggestUmpires(db: DbOrTx, fixture: FixtureRow, today: string): Promise<UmpireSuggestion[]> {
  const people = await db
    .select({ userId: clubUmpires.userId, displayName: users.displayName, level: clubUmpires.level, teamId: clubUmpires.playsForTeamId, teamName: teams.name })
    .from(clubUmpires)
    .innerJoin(users, eq(users.id, clubUmpires.userId))
    .leftJoin(teams, eq(teams.id, clubUmpires.playsForTeamId))
    .where(eq(clubUmpires.clubId, fixture.clubId));
  if (people.length === 0) return [];
  const ids = people.map((p) => p.userId);
  const teamIds = people.map((p) => p.teamId).filter((t): t is string => t !== null);

  const [availability, counts, onThis, sameDay, teamsPlaying, minLevel] = await Promise.all([
    availabilityOf(db, ids, fixture.date, fixture.date),
    seasonAppointmentCounts(db, fixture.clubId, today),
    db
      .select({ userId: appointments.userId, status: appointments.status })
      .from(appointments)
      .where(and(eq(appointments.fixtureId, fixture.id), ne(appointments.status, "released"))),
    // Their other appointments that day, for any club.
    db
      .select({ userId: appointments.userId, time: fixtures.time, venue: fixtures.venue, home: fixtures.homeName, away: fixtures.awayName })
      .from(appointments)
      .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
      .where(
        and(
          inArray(appointments.userId, ids),
          inArray(appointments.status, ["offered", "accepted"]),
          eq(fixtures.date, fixture.date),
          ne(fixtures.id, fixture.id),
        ),
      ),
    // Other fixtures that day of the teams they play for.
    teamIds.length
      ? db
          .select({ homeTeamId: fixtures.homeTeamId, awayTeamId: fixtures.awayTeamId, time: fixtures.time })
          .from(fixtures)
          .where(
            and(
              eq(fixtures.date, fixture.date),
              ne(fixtures.id, fixture.id),
              or(inArray(fixtures.homeTeamId, teamIds), inArray(fixtures.awayTeamId, teamIds)),
            ),
          )
      : [],
    fixture.competition
      ? db
          .select({ name: competitions.name, minLevel: competitionUmpireLevels.minLevel })
          .from(competitions)
          .innerJoin(competitionUmpireLevels, eq(competitionUmpireLevels.competitionId, competitions.id))
          .where(sql`lower(${competitions.name}) = ${fixture.competition.toLowerCase()}`)
          .then((rows) => rows[0] ?? null)
      : null,
  ]);

  const suggestions = people.map((p): UmpireSuggestion => {
    const avail = availability.get(p.userId)!;
    const clashes: string[] = [];
    const here = onThis.find((a) => a.userId === p.userId);
    if (here?.status === "declined") clashes.push("Said no to this fixture");
    else if (here) clashes.push("Already on this fixture");

    if (p.teamId && (p.teamId === fixture.homeTeamId || p.teamId === fixture.awayTeamId)) {
      clashes.push(`Plays for ${p.teamName} in this match`);
    } else if (p.teamId) {
      for (const other of teamsPlaying.filter((f) => f.homeTeamId === p.teamId || f.awayTeamId === p.teamId)) {
        if (!other.time || !fixture.time) clashes.push(`${p.teamName} play that day`);
        else if (minutesBetween(other.time, fixture.time) < TRAVEL_MINUTES) clashes.push(`Plays for ${p.teamName} at ${other.time}`);
      }
    }

    for (const other of sameDay.filter((a) => a.userId === p.userId)) {
      const what = `${other.home} v ${other.away}`;
      if (!other.time || !fixture.time) clashes.push(`Also umpiring ${what} that day`);
      else {
        const gap = minutesBetween(other.time, fixture.time);
        const elsewhere = other.venue && fixture.venue && other.venue.toLowerCase() !== fixture.venue.toLowerCase();
        if (gap < SAME_TIME_MINUTES) clashes.push(`Umpiring ${what} at ${other.time}`);
        else if (elsewhere && gap < TRAVEL_MINUTES) clashes.push(`Umpiring at ${other.venue} at ${other.time}: little time to get there`);
      }
    }

    if (minLevel) {
      const needed = UMPIRE_LEVELS[minLevel.minLevel];
      if (p.level === null) clashes.push(`Level not recorded; ${minLevel.name} asks for ${needed}`);
      else if (p.level < minLevel.minLevel) clashes.push(`Below ${needed}, which ${minLevel.name} asks for`);
    }

    return {
      userId: p.userId,
      displayName: p.displayName,
      level: p.level,
      availability: availabilityFor(fixture.date, fixture.time, avail.days.get(fixture.date), avail.weekdays),
      seasonAppointments: counts.get(p.userId) ?? 0,
      clashes,
    };
  });

  const rank = { available: 0, unknown: 1, unavailable: 2 } as const;
  return suggestions.sort(
    (a, b) =>
      rank[a.availability] - rank[b.availability] ||
      Number(a.clashes.length > 0) - Number(b.clashes.length > 0) ||
      a.seasonAppointments - b.seasonAppointments ||
      a.displayName.localeCompare(b.displayName),
  );
}
