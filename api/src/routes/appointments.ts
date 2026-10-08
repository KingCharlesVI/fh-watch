import { type MyAppointment, fixtureWhen, localDay } from "@fh/shared";
import { and, asc, eq, gte, inArray, isNotNull, ne, notInArray, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { appointments, clubUmpires, clubs, fixtures, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import type { Mail } from "../services/mailer.js";
import { appointmentDto, appointmentsFor, clubAdminEmails, sendAll } from "../services/umpiring.js";
import { type FixtureRow, fixtureDto, requireUmpiringClub } from "./fixtures.js";

/**
 * Appointments: a club admin asks an umpire from the club's list to umpire a fixture, as
 * its watch umpire (who runs the watch app, and gets the match set up on their phone) or
 * its second (named on the match). The umpire accepts or declines. An accepted umpire who
 * can't make it asks for cover, and anyone else on the club's list can take it over. Each
 * step emails whoever it concerns.
 */

const FixtureParams = z.object({ id: z.uuid(), fixtureId: z.uuid() });
const AppointmentParams = z.object({ id: z.uuid(), fixtureId: z.uuid(), appointmentId: z.uuid() });
const MyParams = z.object({ appointmentId: z.uuid() });

const teamsOf = (f: FixtureRow) => `${f.homeName} v ${f.awayName}`;
const roleName = (role: "watch" | "second") => (role === "watch" ? "watch umpire" : "second umpire");

export const appointmentRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db, config } = deps;
    const appointmentsUrl = `${config.webUrl}/appointments`;

    /** The fixture and club, for a club admin's request about one. */
    async function requireClubFixture(tx: DbOrTx, clubId: string, fixtureId: string) {
      const [row] = await tx
        .select()
        .from(fixtures)
        .where(and(eq(fixtures.id, fixtureId), eq(fixtures.clubId, clubId)));
      if (!row) throw notFound("No such fixture.");
      return row;
    }

    /** One of the caller's appointments, with its fixture and club, locked for the change. */
    async function requireMine(tx: DbOrTx, userId: string, appointmentId: string) {
      const [row] = await tx
        .select({ a: appointments, f: fixtures, club: clubs })
        .from(appointments)
        .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
        .innerJoin(clubs, eq(clubs.id, fixtures.clubId))
        .where(and(eq(appointments.id, appointmentId), eq(appointments.userId, userId)))
        .for("update", { of: appointments });
      if (!row) throw notFound("No such appointment.");
      return row;
    }

    const isPast = (f: FixtureRow) => f.date < localDay(deps.now());

    // ---- Club admins ----

    app.post(
      "/clubs/:id/fixtures/:fixtureId/appointments",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Ask an umpire on the club's list to umpire a fixture, as its watch or second umpire (its club admins). They're emailed.",
          params: FixtureParams,
          body: z.strictObject({ userId: z.uuid(), role: z.enum(["watch", "second"]), mentoring: z.boolean().default(false) }),
        },
      },
      async (request, reply) => {
        const { actor, club } = await requireUmpiringClub(db, request, request.params.id);
        const { userId, role, mentoring } = request.body;
        const { appointment, fixture, umpire } = await db.transaction(async (tx) => {
          const fixture = await requireClubFixture(tx, club.id, request.params.fixtureId);
          if (isPast(fixture)) throw badRequest("fixture_past", "That fixture has been played.");
          const [umpire] = await tx
            .select({ email: users.email, displayName: users.displayName })
            .from(clubUmpires)
            .innerJoin(users, eq(users.id, clubUmpires.userId))
            .where(and(eq(clubUmpires.clubId, club.id), eq(clubUmpires.userId, userId)));
          if (!umpire) throw badRequest("not_club_umpire", "They aren't on this club's umpire list.");
          const active = await tx
            .select({ id: appointments.id })
            .from(appointments)
            .where(and(eq(appointments.fixtureId, fixture.id), inArray(appointments.status, ["offered", "accepted"])))
            .for("update");
          if (active.length >= fixture.umpiresNeeded) throw conflict("fixture_full", "That fixture already has the umpires it needs.");
          let row;
          try {
            [row] = await tx.insert(appointments).values({ fixtureId: fixture.id, userId, role, mentoring, createdBy: actor.id }).returning();
          } catch (err) {
            if (isUniqueViolation(err)) throw conflict("already_appointed", `That fixture already has a ${roleName(role)}, or they're already on it.`);
            throw err;
          }
          await audit(tx, actor.id, "create", "appointment", row!.id, { fixtureId: fixture.id, userId, role, mentoring });
          return { appointment: row!, fixture, umpire };
        });
        sendAll(deps, request.log, [
          {
            to: umpire.email,
            subject: `Can you umpire ${teamsOf(fixture)}?`,
            text:
              `${club.name} has asked you to be the ${roleName(role)}${mentoring ? " (mentoring)" : ""} for ${teamsOf(fixture)}, ` +
              `${fixtureWhen(fixture.date, fixture.time)}${fixture.venue ? ` at ${fixture.venue}` : ""}.\n\n` +
              `Accept or decline it here:\n\n${appointmentsUrl}`,
          },
        ]);
        return reply.code(201).send(appointmentDto(appointment, umpire.displayName));
      },
    );

    app.delete(
      "/clubs/:id/fixtures/:fixtureId/appointments/:appointmentId",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Take an umpire off a fixture (its club admins). If they'd been asked or had accepted, they're emailed.",
          params: AppointmentParams,
        },
      },
      async (request, reply) => {
        const { actor, club } = await requireUmpiringClub(db, request, request.params.id);
        const removed = await db.transaction(async (tx) => {
          const fixture = await requireClubFixture(tx, club.id, request.params.fixtureId);
          const [row] = await tx
            .delete(appointments)
            .where(and(eq(appointments.id, request.params.appointmentId), eq(appointments.fixtureId, fixture.id)))
            .returning();
          if (!row) throw notFound("No such appointment.");
          await audit(tx, actor.id, "delete", "appointment", row.id, { fixtureId: fixture.id, userId: row.userId });
          const [umpire] = await tx.select({ email: users.email }).from(users).where(eq(users.id, row.userId));
          return { row, fixture, email: umpire?.email };
        });
        if (removed.email && (removed.row.status === "offered" || removed.row.status === "accepted") && !isPast(removed.fixture)) {
          sendAll(deps, request.log, [
            {
              to: removed.email,
              subject: `You're no longer umpiring ${teamsOf(removed.fixture)}`,
              text: `${club.name} has taken you off ${teamsOf(removed.fixture)}, ${fixtureWhen(removed.fixture.date, removed.fixture.time)}. There's nothing you need to do.`,
            },
          ]);
        }
        return reply.code(204).send();
      },
    );

    // ---- Umpires ----

    app.get(
      "/me/appointments",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Your appointments from today (or from `from`): asked, accepted and declined, soonest first.",
          querystring: z.object({ from: z.iso.date().optional() }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const from = request.query.from ?? localDay(deps.now());
        const rows = await db
          .select({ a: appointments, f: fixtures, club: clubs, displayName: users.displayName })
          .from(appointments)
          .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
          .innerJoin(clubs, eq(clubs.id, fixtures.clubId))
          .innerJoin(users, eq(users.id, appointments.userId))
          .where(and(eq(appointments.userId, actor.id), ne(appointments.status, "released"), gte(fixtures.date, from)))
          .orderBy(asc(fixtures.date), sql`${fixtures.time} asc nulls last`)
          .limit(200);
        const others = await appointmentsFor(
          db,
          rows.map((r) => r.f.id),
        );
        return {
          items: rows.map(({ a, f, club, displayName }): MyAppointment => {
            const colleague = others.get(f.id)!.find((o) => o.userId !== actor.id && (o.status === "offered" || o.status === "accepted"));
            const { appointments: _, ...fixture } = fixtureDto(f);
            return {
              ...appointmentDto(a, displayName),
              fixture,
              club: { id: club.id, name: club.name, slug: club.slug },
              colleague: colleague ? { displayName: colleague.displayName, role: colleague.role, status: colleague.status } : null,
            };
          }),
        };
      },
    );

    /** Accept or decline: only while it's still being asked, and the fixture hasn't been played. */
    for (const answer of ["accept", "decline"] as const) {
      app.post(
        `/me/appointments/:appointmentId/${answer}`,
        { schema: { tags: ["umpiring"], summary: answer === "accept" ? "Accept an appointment." : "Decline an appointment. The club's admins are emailed.", params: MyParams } },
        async (request) => {
          const actor = requireActor(request);
          const { row, displayName } = await db.transaction(async (tx) => {
            const { a, f } = await requireMine(tx, actor.id, request.params.appointmentId);
            if (isPast(f)) throw badRequest("fixture_past", "That fixture has been played.");
            if (a.status !== "offered") throw conflict("already_answered", `You've already ${a.status} this one.`);
            const [updated] = await tx
              .update(appointments)
              .set({ status: answer === "accept" ? "accepted" : "declined", respondedAt: deps.now() })
              .where(eq(appointments.id, a.id))
              .returning();
            await audit(tx, actor.id, answer, "appointment", a.id, null);
            const [me] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, actor.id));
            return { row: updated!, displayName: me!.displayName };
          });
          if (answer === "decline") {
            const [f] = await db.select().from(fixtures).where(eq(fixtures.id, row.fixtureId));
            const to = await clubAdminEmails(db, f!.clubId);
            sendAll(
              deps,
              request.log,
              to.map((email) => ({
                to: email,
                subject: `${displayName} can't umpire ${teamsOf(f!)}`,
                text: `${displayName} has declined being ${roleName(row.role)} for ${teamsOf(f!)}, ${fixtureWhen(f!.date, f!.time)}. Ask someone else:\n\n${config.webUrl}/dashboard/fixtures`,
              })),
            );
          }
          return appointmentDto(row, displayName);
        },
      );
    }

    app.post(
      "/me/appointments/:appointmentId/cover",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Ask for someone to cover an appointment you accepted (or stop asking). The club's admins and umpires are emailed.",
          params: MyParams,
          body: z.strictObject({ requested: z.boolean() }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const { requested } = request.body;
        const { row, f, club, displayName } = await db.transaction(async (tx) => {
          const { a, f, club } = await requireMine(tx, actor.id, request.params.appointmentId);
          if (isPast(f)) throw badRequest("fixture_past", "That fixture has been played.");
          if (a.status !== "accepted") throw conflict("not_accepted", "Only an appointment you've accepted can be covered.");
          const [updated] = await tx
            .update(appointments)
            .set({ coverRequestedAt: requested ? (a.coverRequestedAt ?? deps.now()) : null })
            .where(eq(appointments.id, a.id))
            .returning();
          await audit(tx, actor.id, requested ? "request_cover" : "cancel_cover", "appointment", a.id, null);
          const [me] = await tx.select({ displayName: users.displayName }).from(users).where(eq(users.id, actor.id));
          return { row: updated!, f, club, displayName: me!.displayName };
        });
        if (requested) {
          // Everyone else on the club's list, and its admins.
          const umpires = await db
            .select({ email: users.email })
            .from(clubUmpires)
            .innerJoin(users, eq(users.id, clubUmpires.userId))
            .where(and(eq(clubUmpires.clubId, club.id), ne(clubUmpires.userId, actor.id)));
          const admins = await clubAdminEmails(db, club.id);
          const to = [...new Set([...umpires.map((u) => u.email), ...admins])];
          const mail = (email: string): Mail => ({
            to: email,
            subject: `Cover needed: ${teamsOf(f)}, ${fixtureWhen(f.date, f.time)}`,
            text:
              `${displayName} can't make ${teamsOf(f)}, ${fixtureWhen(f.date, f.time)}${f.venue ? ` at ${f.venue}` : ""}, ` +
              `where they're ${club.name}'s ${roleName(row.role)}. If you can cover it, take it here:\n\n${appointmentsUrl}`,
          });
          sendAll(deps, request.log, to.map(mail));
        }
        return appointmentDto(row, displayName);
      },
    );

    app.get(
      "/me/cover-requests",
      { schema: { tags: ["umpiring"], summary: "Appointments in your clubs that need covering, which you could take over." } },
      async (request) => {
        const actor = requireActor(request);
        const today = localDay(deps.now());
        const myClubs = db.select({ clubId: clubUmpires.clubId }).from(clubUmpires).where(eq(clubUmpires.userId, actor.id));
        const onFixture = db
          .select({ fixtureId: appointments.fixtureId })
          .from(appointments)
          .where(and(eq(appointments.userId, actor.id), inArray(appointments.status, ["offered", "accepted"])));
        const rows = await db
          .select({ a: appointments, f: fixtures, club: clubs, displayName: users.displayName })
          .from(appointments)
          .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
          .innerJoin(clubs, eq(clubs.id, fixtures.clubId))
          .innerJoin(users, eq(users.id, appointments.userId))
          .where(
            and(
              eq(appointments.status, "accepted"),
              isNotNull(appointments.coverRequestedAt),
              ne(appointments.userId, actor.id),
              gte(fixtures.date, today),
              inArray(fixtures.clubId, myClubs),
              notInArray(fixtures.id, onFixture),
            ),
          )
          .orderBy(asc(fixtures.date), sql`${fixtures.time} asc nulls last`);
        return {
          items: rows.map(({ a, f, club, displayName }): MyAppointment => {
            const { appointments: _, ...fixture } = fixtureDto(f);
            return { ...appointmentDto(a, displayName), fixture, club: { id: club.id, name: club.name, slug: club.slug }, colleague: null };
          }),
        };
      },
    );

    app.post(
      "/me/cover-requests/:appointmentId/take",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Take over an appointment someone needs covering, in one of your clubs. They and the club's admins are emailed.",
          params: MyParams,
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        const result = await db.transaction(async (tx) => {
          const [row] = await tx
            .select({ a: appointments, f: fixtures, club: clubs })
            .from(appointments)
            .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
            .innerJoin(clubs, eq(clubs.id, fixtures.clubId))
            .where(eq(appointments.id, request.params.appointmentId))
            .for("update", { of: appointments });
          if (!row || row.a.status !== "accepted" || !row.a.coverRequestedAt) throw notFound("That doesn't need covering any more.");
          const { a, f, club } = row;
          if (isPast(f)) throw badRequest("fixture_past", "That fixture has been played.");
          if (a.userId === actor.id) throw badRequest("own_appointment", "That's your own appointment.");
          const [member] = await tx
            .select({ userId: clubUmpires.userId })
            .from(clubUmpires)
            .where(and(eq(clubUmpires.clubId, club.id), eq(clubUmpires.userId, actor.id)));
          if (!member) throw forbidden();
          await tx.update(appointments).set({ status: "released", coverRequestedAt: null }).where(eq(appointments.id, a.id));
          let taken;
          try {
            [taken] = await tx
              .insert(appointments)
              .values({ fixtureId: f.id, userId: actor.id, role: a.role, mentoring: a.mentoring, status: "accepted", createdBy: actor.id, respondedAt: deps.now() })
              .returning();
          } catch (err) {
            if (isUniqueViolation(err)) throw conflict("already_appointed", "You're already on that fixture.");
            throw err;
          }
          await audit(tx, actor.id, "take_cover", "appointment", taken!.id, { from: a.id });
          const people = await tx
            .select({ id: users.id, email: users.email, displayName: users.displayName })
            .from(users)
            .where(inArray(users.id, [a.userId, actor.id]));
          const me = people.find((p) => p.id === actor.id)!;
          const them = people.find((p) => p.id === a.userId);
          return { taken: taken!, f, club, me, them };
        });
        const { taken, f, club, me, them } = result;
        const what = `${teamsOf(f)}, ${fixtureWhen(f.date, f.time)}`;
        const admins = await clubAdminEmails(db, club.id);
        sendAll(deps, request.log, [
          ...(them ? [{ to: them.email, subject: `${me.displayName} is covering ${teamsOf(f)}`, text: `${me.displayName} has taken over ${what} from you. There's nothing more you need to do.` }] : []),
          ...admins.map((email) => ({
            to: email,
            subject: `${me.displayName} is covering ${teamsOf(f)}`,
            text: `${me.displayName} has taken over as ${roleName(taken.role)} for ${what}${them ? `, covering for ${them.displayName}` : ""}.`,
          })),
        ]);
        return reply.code(201).send(appointmentDto(taken, me.displayName));
      },
    );
  };
