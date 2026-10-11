import { addDays, localDay } from "@fh/shared";
import { and, asc, eq, gte } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../auth.js";
import { appointments, calendarFeeds, clubs, fixtures, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { randomToken } from "../lib/crypto.js";
import { notFound } from "../lib/errors.js";
import { calendar } from "../lib/ical.js";
import { appointmentsFor } from "../services/umpiring.js";

/**
 * Each umpire's appointments as a calendar to subscribe to (Google, Apple, Outlook), at a
 * private address only they know. Accepted appointments only, from a few weeks back.
 */

/** How long a match is in the calendar, with its breaks. */
const MATCH_MINUTES = 120;
const PAST_DAYS = 28;

export const calendarRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db, config } = deps;
    const feedUrl = (token: string) => `${config.webUrl}/v1/calendar/${token}.ics`;

    app.get("/me/calendar", { schema: { tags: ["umpiring"], summary: "The private address of your appointments calendar, made the first time." } }, async (request) => {
      const actor = requireActor(request);
      const [existing] = await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, actor.id));
      if (existing) return { url: feedUrl(existing.token) };
      const [created] = await db.insert(calendarFeeds).values({ userId: actor.id, token: randomToken() }).onConflictDoNothing().returning();
      // Two requests at once: the other one made it.
      const token = created?.token ?? (await db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, actor.id)))[0]!.token;
      return { url: feedUrl(token) };
    });

    app.post(
      "/me/calendar/reset",
      { schema: { tags: ["umpiring"], summary: "Replace your calendar's address, so the old one stops working (if it was shared by mistake)." } },
      async (request) => {
        const actor = requireActor(request);
        const token = randomToken();
        await db
          .insert(calendarFeeds)
          .values({ userId: actor.id, token })
          .onConflictDoUpdate({ target: calendarFeeds.userId, set: { token, createdAt: deps.now() } });
        return { url: feedUrl(token) };
      },
    );

    app.get(
      "/calendar/:file",
      { schema: { tags: ["umpiring"], summary: "An umpire's appointments calendar (iCalendar), by its private address.", params: z.object({ file: z.string().regex(/^[A-Za-z0-9_-]{43}\.ics$/) }) } },
      async (request, reply) => {
        const token = request.params.file.slice(0, -".ics".length);
        const [feed] = await db
          .select({ userId: calendarFeeds.userId, displayName: users.displayName })
          .from(calendarFeeds)
          .innerJoin(users, eq(users.id, calendarFeeds.userId))
          .where(eq(calendarFeeds.token, token));
        if (!feed) throw notFound("No such calendar.");
        const rows = await db
          .select({ a: appointments, f: fixtures, clubName: clubs.name })
          .from(appointments)
          .innerJoin(fixtures, eq(fixtures.id, appointments.fixtureId))
          .innerJoin(clubs, eq(clubs.id, fixtures.clubId))
          .where(and(eq(appointments.userId, feed.userId), eq(appointments.status, "accepted"), gte(fixtures.date, addDays(localDay(deps.now()), -PAST_DAYS))))
          .orderBy(asc(fixtures.date));
        const others = await appointmentsFor(
          db,
          rows.map((r) => r.f.id),
        );
        const events = rows.map(({ a, f, clubName }) => {
          const colleague = others.get(f.id)!.find((o) => o.userId !== feed.userId && o.status === "accepted");
          const role = a.role === "watch" ? "Watch umpire" : "Second umpire";
          const details = [
            `${role}${a.mentoring ? " (mentoring)" : ""} for ${clubName}.`,
            colleague ? `With ${colleague.displayName}.` : null,
            f.competition,
            f.notes,
          ];
          return {
            uid: `${a.id}@fhmatchcentre`,
            date: f.date,
            time: f.time,
            durationMinutes: MATCH_MINUTES,
            summary: `Umpiring ${f.homeName} v ${f.awayName}`,
            location: f.venue,
            description: details.filter(Boolean).join("\n"),
          };
        });
        return reply
          .type("text/calendar; charset=utf-8")
          .header("content-disposition", 'inline; filename="appointments.ics"')
          .send(calendar(`Umpiring: ${feed.displayName}`, events, deps.now()));
      },
    );
  };
