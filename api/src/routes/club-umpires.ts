import { type Club, type ClubUmpire, type CompetitionUmpireLevel, UMPIRE_LEVELS, canManageUmpiring, localDay } from "@fh/shared";
import { and, arrayContains, asc, eq, isNotNull } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor, requireRole } from "../auth.js";
import { clubUmpires, clubs, competitionUmpireLevels, competitions, teams, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import { seasonAppointmentCounts } from "../services/suggestions.js";

/**
 * Each club's umpire list, kept by its club admins, with each umpire's qualification level
 * and the team they play for. Umpires can leave a list themselves. Competitions can name
 * the lowest level suggested for their fixtures.
 */

const Level = z
  .number()
  .int()
  .min(0)
  .max(UMPIRE_LEVELS.length - 1);
const IdParams = z.object({ id: z.uuid() });
const UmpireParams = z.object({ id: z.uuid(), userId: z.uuid() });

type Row = typeof clubUmpires.$inferSelect;
const dto = (r: Row, u: { displayName: string; email: string }, seasonAppointments = 0): ClubUmpire => ({
  userId: r.userId,
  displayName: u.displayName,
  email: u.email,
  level: r.level,
  playsForTeamId: r.playsForTeamId,
  addedAt: r.addedAt.toISOString(),
  seasonAppointments,
});

export const clubUmpireRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    async function requireManagedClub(request: Parameters<typeof requireActor>[0], clubId: string) {
      const actor = requireActor(request);
      const [club] = await db.select().from(clubs).where(eq(clubs.id, clubId));
      if (!club) throw notFound("No such club.");
      if (!canManageUmpiring(actor, club.id)) throw forbidden();
      return { actor, club };
    }

    app.get("/clubs/:id/umpires", { schema: { tags: ["umpiring"], params: IdParams, summary: "The club's umpire list (its club admins)." } }, async (request) => {
      const { club } = await requireManagedClub(request, request.params.id);
      const rows = await db
        .select({ row: clubUmpires, displayName: users.displayName, email: users.email })
        .from(clubUmpires)
        .innerJoin(users, eq(users.id, clubUmpires.userId))
        .where(eq(clubUmpires.clubId, club.id))
        .orderBy(asc(users.displayName));
      const counts = await seasonAppointmentCounts(db, club.id, localDay(deps.now()));
      return { items: rows.map((r) => dto(r.row, r, counts.get(r.row.userId))) };
    });

    app.put(
      "/clubs/:id/umpires/:userId",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Add an umpire to the club's list, or change their level or team. Only registered umpires can be added.",
          params: UmpireParams,
          body: z.strictObject({ level: Level.nullable().optional(), playsForTeamId: z.uuid().nullable().optional() }),
        },
      },
      async (request, reply) => {
        const { actor, club } = await requireManagedClub(request, request.params.id);
        const { userId } = request.params;
        const { level, playsForTeamId } = request.body;
        const [user] = await db
          .select({ displayName: users.displayName, email: users.email })
          .from(users)
          .where(and(eq(users.id, userId), arrayContains(users.roles, ["umpire"]), isNotNull(users.emailVerifiedAt)));
        if (!user) throw notFound("No such umpire.");
        if (playsForTeamId) {
          const [team] = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, playsForTeamId), eq(teams.clubId, club.id)));
          if (!team) throw badRequest("not_club_team", "That team isn't one of this club's.");
        }
        const changes = {
          ...(level !== undefined ? { level } : {}),
          ...(playsForTeamId !== undefined ? { playsForTeamId } : {}),
        };
        const { row, created } = await db.transaction(async (tx) => {
          const [existing] = await tx.select().from(clubUmpires).where(and(eq(clubUmpires.clubId, club.id), eq(clubUmpires.userId, userId)));
          const [saved] = existing
            ? await tx
                .update(clubUmpires)
                .set(changes)
                .where(and(eq(clubUmpires.clubId, club.id), eq(clubUmpires.userId, userId)))
                .returning()
            : await tx
                .insert(clubUmpires)
                .values({ clubId: club.id, userId, ...changes })
                .returning();
          await audit(tx, actor.id, existing ? "update" : "create", "club_umpire", `${club.id}:${userId}`, changes);
          return { row: saved!, created: !existing };
        });
        return reply.code(created ? 201 : 200).send(dto(row, user));
      },
    );

    app.delete(
      "/clubs/:id/umpires/:userId",
      { schema: { tags: ["umpiring"], summary: "Take an umpire off the club's list: its club admins, or the umpire themself.", params: UmpireParams } },
      async (request, reply) => {
        const actor = requireActor(request);
        const { id: clubId, userId } = request.params;
        if (actor.id !== userId && !canManageUmpiring(actor, clubId)) throw forbidden();
        await db.transaction(async (tx) => {
          const gone = await tx
            .delete(clubUmpires)
            .where(and(eq(clubUmpires.clubId, clubId), eq(clubUmpires.userId, userId)))
            .returning();
          if (gone.length === 0) throw notFound("They aren't on this club's list.");
          await audit(tx, actor.id, "delete", "club_umpire", `${clubId}:${userId}`, null);
        });
        return reply.code(204).send();
      },
    );

    app.get("/me/umpiring-clubs", { schema: { tags: ["umpiring"], summary: "The clubs you're on the umpire list of." } }, async (request) => {
      const actor = requireActor(request);
      const rows = await db
        .select({ club: clubs })
        .from(clubUmpires)
        .innerJoin(clubs, eq(clubs.id, clubUmpires.clubId))
        .where(eq(clubUmpires.userId, actor.id))
        .orderBy(asc(clubs.name));
      return {
        items: rows.map(
          ({ club: c }): Club => ({
            id: c.id,
            name: c.name,
            slug: c.slug,
            logoUrl: c.logoUpdatedAt ? `/v1/clubs/${c.id}/logo?v=${c.logoUpdatedAt.getTime()}` : null,
          }),
        ),
      };
    });

    // ---- Competitions' umpire levels ----

    app.get(
      "/competitions/umpire-levels",
      { schema: { tags: ["umpiring"], summary: "The lowest umpire level each competition with one asks for." } },
      async (request) => {
        requireActor(request);
        const rows = await db.select().from(competitionUmpireLevels);
        return { items: rows.map((r): CompetitionUmpireLevel => ({ competitionId: r.competitionId, minLevel: r.minLevel })) };
      },
    );

    app.put(
      "/competitions/:id/umpire-level",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Set the lowest umpire level suggested for a competition's fixtures, or null for any (admins).",
          params: IdParams,
          body: z.strictObject({ minLevel: Level.nullable() }),
        },
      },
      async (request) => {
        const actor = requireRole(request, "admin");
        const competitionId = request.params.id;
        const { minLevel } = request.body;
        const [competition] = await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.id, competitionId));
        if (!competition) throw notFound("No such competition.");
        await db.transaction(async (tx) => {
          if (minLevel === null) {
            await tx.delete(competitionUmpireLevels).where(eq(competitionUmpireLevels.competitionId, competitionId));
          } else {
            await tx
              .insert(competitionUmpireLevels)
              .values({ competitionId, minLevel })
              .onConflictDoUpdate({ target: competitionUmpireLevels.competitionId, set: { minLevel } });
          }
          await audit(tx, actor.id, "update", "competition", competitionId, { minUmpireLevel: minLevel });
        });
        return { competitionId, minLevel };
      },
    );
  };
