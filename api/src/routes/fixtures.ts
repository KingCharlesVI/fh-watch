import { type Appointment, type Fixture, type ImportResult, TIME_PATTERN, canManageUmpiring, fixtureWhen, localDay, readDay, readTime } from "@fh/shared";
import { and, asc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { appointments, clubs, fixtures, teams, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { maybeDryRun } from "../lib/dry-run.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import { appointmentsFor, sendAll } from "../services/umpiring.js";

/**
 * A club's fixtures: the matches it needs umpires for. Its club admins add them, one at a
 * time or from a spreadsheet, and appoint umpires to them (routes/appointments.ts).
 */

const Name = z.string().trim().min(1).max(100);
const ListName = z.string().trim().min(1).max(120);
const Side = z.strictObject({ name: Name, teamId: z.uuid().nullable().optional() });
const Format = z.strictObject({
  periods: z.number().int().min(1).max(8),
  periodMinutes: z.number().int().min(1).max(90),
  breakMinutes: z.number().int().min(0).max(30),
  halfTimeMinutes: z.number().int().min(0).max(30),
  shootoutIfDrawn: z.boolean(),
});
const Fields = {
  date: z.iso.date(),
  time: z.string().regex(TIME_PATTERN, "Use a 24-hour time, e.g. 14:00.").nullable().optional(),
  home: Side,
  away: Side,
  venue: ListName.nullable().optional(),
  competition: ListName.nullable().optional(),
  format: Format.nullable().optional(),
  umpiresNeeded: z.union([z.literal(1), z.literal(2)]).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
};
const ClubParams = z.object({ id: z.uuid() });
const FixtureParams = z.object({ id: z.uuid(), fixtureId: z.uuid() });

export type FixtureRow = typeof fixtures.$inferSelect;

export const fixtureDto = (f: FixtureRow, appointments: Appointment[] = []): Fixture => ({
  id: f.id,
  clubId: f.clubId,
  date: f.date,
  time: f.time,
  home: { name: f.homeName, teamId: f.homeTeamId },
  away: { name: f.awayName, teamId: f.awayTeamId },
  venue: f.venue,
  competition: f.competition,
  format: f.format,
  umpiresNeeded: f.umpiresNeeded === 1 ? 1 : 2,
  notes: f.notes,
  createdAt: f.createdAt.toISOString(),
  appointments,
});

/** The club the request is about, if the caller runs its umpiring. */
export async function requireUmpiringClub(db: DbOrTx, request: FastifyRequest, clubId: string) {
  const actor = requireActor(request);
  const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
  if (!club) throw notFound("No such club.");
  if (!canManageUmpiring(actor, club.id)) throw forbidden();
  return { actor, club };
}

/**
 * The site's team a fixture's side names: one of the club's own by its name ("M1"), or any
 * club's as "Club Team" ("Oxford Hawks M1"), in any capitals.
 */
async function findTeam(tx: DbOrTx, clubId: string, name: string): Promise<string | null> {
  const key = name.trim().toLowerCase();
  const [own] = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.clubId, clubId), sql`lower(${teams.name}) = ${key}`));
  if (own) return own.id;
  const [any] = await tx
    .select({ id: teams.id })
    .from(teams)
    .innerJoin(clubs, eq(clubs.id, teams.clubId))
    .where(sql`lower(${clubs.name} || ' ' || ${teams.name}) = ${key}`);
  return any?.id ?? null;
}

/** The email addresses of the umpires asked to umpire a fixture, or who've accepted. */
async function appointedEmails(tx: DbOrTx, fixtureId: string): Promise<string[]> {
  const rows = await tx
    .select({ email: users.email })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.userId))
    .where(and(eq(appointments.fixtureId, fixtureId), inArray(appointments.status, ["offered", "accepted"])));
  return rows.map((r) => r.email);
}

async function requireTeam(tx: DbOrTx, teamId: string | null | undefined) {
  if (!teamId) return;
  const [team] = await tx.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId));
  if (!team) throw badRequest("no_such_team", "That team doesn't exist.");
}

export const fixtureRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    async function requireFixture(tx: DbOrTx, clubId: string, fixtureId: string) {
      const [row] = await tx
        .select()
        .from(fixtures)
        .where(and(eq(fixtures.id, fixtureId), eq(fixtures.clubId, clubId)));
      if (!row) throw notFound("No such fixture.");
      return row;
    }

    app.get(
      "/clubs/:id/fixtures",
      {
        schema: {
          tags: ["umpiring"],
          summary: "The club's fixtures by date and kick-off, from today unless `from` says otherwise (its club admins).",
          params: ClubParams,
          querystring: z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
        },
      },
      async (request) => {
        const { club } = await requireUmpiringClub(db, request, request.params.id);
        const from = request.query.from ?? localDay(deps.now());
        const rows = await db
          .select()
          .from(fixtures)
          .where(and(eq(fixtures.clubId, club.id), gte(fixtures.date, from), request.query.to ? lte(fixtures.date, request.query.to) : undefined))
          .orderBy(asc(fixtures.date), sql`${fixtures.time} asc nulls last`, asc(fixtures.homeName))
          .limit(500);
        const appointed = await appointmentsFor(
          db,
          rows.map((r) => r.id),
        );
        return { items: rows.map((r) => fixtureDto(r, appointed.get(r.id))) };
      },
    );

    app.get("/clubs/:id/fixtures/:fixtureId", { schema: { tags: ["umpiring"], params: FixtureParams } }, async (request) => {
      const { club } = await requireUmpiringClub(db, request, request.params.id);
      const row = await requireFixture(db, club.id, request.params.fixtureId);
      return fixtureDto(row, (await appointmentsFor(db, [row.id])).get(row.id));
    });

    app.post(
      "/clubs/:id/fixtures",
      { schema: { tags: ["umpiring"], summary: "Add a fixture (its club admins).", params: ClubParams, body: z.strictObject(Fields) } },
      async (request, reply) => {
        const { actor, club } = await requireUmpiringClub(db, request, request.params.id);
        const b = request.body;
        const row = await db.transaction(async (tx) => {
          await requireTeam(tx, b.home.teamId);
          await requireTeam(tx, b.away.teamId);
          const [created] = await tx
            .insert(fixtures)
            .values({
              clubId: club.id,
              date: b.date,
              time: b.time ?? null,
              homeName: b.home.name,
              awayName: b.away.name,
              homeTeamId: b.home.teamId ?? (await findTeam(tx, club.id, b.home.name)),
              awayTeamId: b.away.teamId ?? (await findTeam(tx, club.id, b.away.name)),
              venue: b.venue ?? null,
              competition: b.competition ?? null,
              format: b.format ?? null,
              umpiresNeeded: b.umpiresNeeded ?? 2,
              notes: b.notes || null,
              createdBy: actor.id,
            })
            .returning();
          await audit(tx, actor.id, "create", "fixture", created!.id, b);
          return created!;
        });
        return reply.code(201).send(fixtureDto(row));
      },
    );

    app.patch(
      "/clubs/:id/fixtures/:fixtureId",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Change a fixture (its club admins). Fields left out stay as they are.",
          params: FixtureParams,
          body: z.strictObject({ ...Fields, date: Fields.date.optional(), home: Side.optional(), away: Side.optional() }),
        },
      },
      async (request) => {
        const { actor, club } = await requireUmpiringClub(db, request, request.params.id);
        const b = request.body;
        const { row, before, emails } = await db.transaction(async (tx) => {
          const before = await requireFixture(tx, club.id, request.params.fixtureId);
          await requireTeam(tx, b.home?.teamId);
          await requireTeam(tx, b.away?.teamId);
          const [updated] = await tx
            .update(fixtures)
            .set({
              ...(b.date !== undefined ? { date: b.date } : {}),
              ...(b.time !== undefined ? { time: b.time } : {}),
              ...(b.home ? { homeName: b.home.name, homeTeamId: b.home.teamId ?? (await findTeam(tx, club.id, b.home.name)) } : {}),
              ...(b.away ? { awayName: b.away.name, awayTeamId: b.away.teamId ?? (await findTeam(tx, club.id, b.away.name)) } : {}),
              ...(b.venue !== undefined ? { venue: b.venue } : {}),
              ...(b.competition !== undefined ? { competition: b.competition } : {}),
              ...(b.format !== undefined ? { format: b.format } : {}),
              ...(b.umpiresNeeded !== undefined ? { umpiresNeeded: b.umpiresNeeded } : {}),
              ...(b.notes !== undefined ? { notes: b.notes || null } : {}),
              updatedAt: deps.now(),
            })
            .where(eq(fixtures.id, request.params.fixtureId))
            .returning();
          await audit(tx, actor.id, "update", "fixture", updated!.id, b);
          return { row: updated!, before, emails: await appointedEmails(tx, updated!.id) };
        });
        // The umpires need to know when or where it's moved to.
        const moved = row.date !== before.date || row.time !== before.time || row.venue !== before.venue;
        if (moved && row.date >= localDay(deps.now())) {
          sendAll(
            deps,
            request.log,
            emails.map((to) => ({
              to,
              subject: `${row.homeName} v ${row.awayName} has moved`,
              text: `${club.name} has changed ${row.homeName} v ${row.awayName}, which you're umpiring. It's now ${fixtureWhen(row.date, row.time)}${row.venue ? ` at ${row.venue}` : ""}.\n\nSee it here:\n\n${deps.config.webUrl}/appointments`,
            })),
          );
        }
        return fixtureDto(row, (await appointmentsFor(db, [row.id])).get(row.id));
      },
    );

    app.delete("/clubs/:id/fixtures/:fixtureId", { schema: { tags: ["umpiring"], params: FixtureParams } }, async (request, reply) => {
      const { actor, club } = await requireUmpiringClub(db, request, request.params.id);
      const { row, emails } = await db.transaction(async (tx) => {
        const row = await requireFixture(tx, club.id, request.params.fixtureId);
        const emails = await appointedEmails(tx, row.id);
        await tx.delete(fixtures).where(eq(fixtures.id, row.id));
        await audit(tx, actor.id, "delete", "fixture", row.id, { date: row.date, home: row.homeName, away: row.awayName });
        return { row, emails };
      });
      if (row.date >= localDay(deps.now())) {
        sendAll(
          deps,
          request.log,
          emails.map((to) => ({
            to,
            subject: `${row.homeName} v ${row.awayName} is off`,
            text: `${club.name} has cancelled ${row.homeName} v ${row.awayName}, ${fixtureWhen(row.date, row.time)}, which you were umpiring. There's nothing you need to do.`,
          })),
        );
      }
      return reply.code(204).send();
    });

    app.post(
      "/clubs/:id/fixtures/import",
      {
        schema: {
          tags: ["umpiring"],
          summary:
            "Add fixtures from a spreadsheet's rows, without its heading: [date, time, home, away, venue, competition, umpires]. One already there (same day and teams) is left alone. dryRun previews it.",
          params: ClubParams,
          body: z.strictObject({
            rows: z.array(z.array(z.string().max(500)).max(10)).min(1).max(1000),
            dryRun: z.boolean().default(false),
          }),
        },
      },
      async (request) => {
        const { actor, club } = await requireUmpiringClub(db, request, request.params.id);
        const { rows, dryRun } = request.body;
        const tidy = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

        const run = async (tx: DbOrTx): Promise<ImportResult> => {
          const result: ImportResult = { added: [], existing: 0, errors: [] };
          for (const [i, cells] of rows.entries()) {
            const [rawDate, rawTime, rawHome, rawAway, rawVenue, rawCompetition, rawUmpires] = cells.map(tidy);
            const date = readDay(rawDate ?? "");
            const time = rawTime ? readTime(rawTime) : null;
            const home = rawHome ?? "";
            const away = rawAway ?? "";
            const umpires = rawUmpires ? Number(rawUmpires) : 2;
            const problem = !date
              ? `“${rawDate ?? ""}” isn't a date. Use 11/10/2026 or 2026-10-11.`
              : rawTime && !time
                ? `“${rawTime}” isn't a kick-off time. Use 14:00.`
                : !home || !away
                  ? "Both teams are needed."
                  : home.length > 100 || away.length > 100
                    ? "A team's name is longer than 100 characters."
                    : umpires !== 1 && umpires !== 2
                      ? "Umpires needed is 1 or 2."
                      : (rawVenue?.length ?? 0) > 120 || (rawCompetition?.length ?? 0) > 120
                        ? "The venue or competition is longer than 120 characters."
                        : null;
            if (problem) {
              result.errors.push({ row: i, message: problem });
              continue;
            }
            const [existing] = await tx
              .select({ id: fixtures.id })
              .from(fixtures)
              .where(
                and(
                  eq(fixtures.clubId, club.id),
                  eq(fixtures.date, date!),
                  sql`lower(${fixtures.homeName}) = ${home.toLowerCase()}`,
                  sql`lower(${fixtures.awayName}) = ${away.toLowerCase()}`,
                ),
              );
            if (existing) {
              result.existing++;
              continue;
            }
            const [created] = await tx
              .insert(fixtures)
              .values({
                clubId: club.id,
                date: date!,
                time,
                homeName: home,
                awayName: away,
                homeTeamId: await findTeam(tx, club.id, home),
                awayTeamId: await findTeam(tx, club.id, away),
                venue: rawVenue || null,
                competition: rawCompetition || null,
                umpiresNeeded: umpires,
                createdBy: actor.id,
              })
              .returning({ id: fixtures.id });
            await audit(tx, actor.id, "create", "fixture", created!.id, { date, time, home, away, imported: true });
            result.added.push(`${date}${time ? ` ${time}` : ""}: ${home} v ${away}`);
          }
          return result;
        };

        return maybeDryRun(db, dryRun, run);
      },
    );
  };
