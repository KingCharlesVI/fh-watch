import { type PlannedMatch, TEAM_COLOURS, TIME_PATTERN, localDay } from "@fh/shared";
import { and, asc, count, eq, gte, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor, requireRole } from "../auth.js";
import { plannedMatches } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, notFound } from "../lib/errors.js";

/**
 * Matches an umpire sets up ahead of time on the website, as they would on the phone. The
 * phone picks them up into Upcoming, to send to the watch at the ground.
 */

/** Enough for a season ahead, and a limit on what one account can store. */
const MAX_PLANNED = 200;

const Name = z.string().trim().min(1).max(80);
const ListName = z.string().trim().min(1).max(120);
const Colour = z
  .string()
  .transform((c) => c.toUpperCase())
  .refine((c) => TEAM_COLOURS.some((t) => t.hex === c), "Use one of the watch's colours.");
const Side = z.strictObject({ name: Name, color: Colour, captain: z.number().int().min(0).max(999).nullable().optional() });
// The watch's setup limits (Setup in watch-wear/.../data/Prefs.kt).
const Format = z.strictObject({
  periods: z.number().int().min(1).max(8),
  periodMinutes: z.number().int().min(1).max(90),
  breakMinutes: z.number().int().min(0).max(30),
  halfTimeMinutes: z.number().int().min(0).max(30),
  shootoutIfDrawn: z.boolean(),
});
const Body = z.strictObject({
  date: z.iso.date(),
  time: z.string().regex(TIME_PATTERN, "Use a 24-hour time, e.g. 14:00.").nullable().optional(),
  home: Side,
  away: Side,
  venue: ListName.nullable().optional(),
  competition: ListName.nullable().optional(),
  format: Format.nullable().optional(),
});
const Params = z.object({ id: z.uuid() });

type Row = typeof plannedMatches.$inferSelect;

const dto = (p: Row): PlannedMatch => ({
  id: p.id,
  date: p.date,
  time: p.time,
  home: { name: p.homeName, color: p.homeColor, captain: p.homeCaptain },
  away: { name: p.awayName, color: p.awayColor, captain: p.awayCaptain },
  venue: p.venue,
  competition: p.competition,
  format: p.format,
  createdAt: p.createdAt.toISOString(),
  updatedAt: p.updatedAt.toISOString(),
});

const columns = (b: z.infer<typeof Body>) => ({
  date: b.date,
  time: b.time ?? null,
  homeName: b.home.name,
  homeColor: b.home.color,
  homeCaptain: b.home.captain ?? null,
  awayName: b.away.name,
  awayColor: b.away.color,
  awayCaptain: b.away.captain ?? null,
  venue: b.venue ?? null,
  competition: b.competition ?? null,
  format: b.format ?? null,
});

export const plannedMatchRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;
    const mine = (userId: string, id: string) => and(eq(plannedMatches.userId, userId), eq(plannedMatches.id, id));
    const today = () => localDay(deps.now());

    app.get(
      "/me/planned-matches",
      { schema: { tags: ["matches"], summary: "Matches you've set up ahead of time, from today, soonest first." } },
      async (request) => {
        const actor = requireActor(request);
        const rows = await db
          .select()
          .from(plannedMatches)
          .where(and(eq(plannedMatches.userId, actor.id), gte(plannedMatches.date, today())))
          .orderBy(asc(plannedMatches.date), sql`${plannedMatches.time} asc nulls last`, asc(plannedMatches.createdAt));
        return { items: rows.map(dto) };
      },
    );

    app.get(
      "/me/planned-matches/:id",
      { schema: { tags: ["matches"], summary: "One match you've set up ahead of time.", params: Params } },
      async (request): Promise<PlannedMatch> => {
        const actor = requireActor(request);
        const [row] = await db.select().from(plannedMatches).where(mine(actor.id, request.params.id));
        if (!row) throw notFound("That match isn't planned any more.");
        return dto(row);
      },
    );

    app.post(
      "/me/planned-matches",
      { schema: { tags: ["matches"], summary: "Set up a match ahead of time, for your phone to send to the watch.", body: Body } },
      async (request, reply) => {
        const actor = requireRole(request, "umpire");
        if (request.body.date < today()) throw badRequest("past_date", "That day has gone.");
        const [{ n } = { n: 0 }] = await db
          .select({ n: count() })
          .from(plannedMatches)
          .where(and(eq(plannedMatches.userId, actor.id), gte(plannedMatches.date, today())));
        if (n >= MAX_PLANNED) throw badRequest("too_many", `You can plan up to ${MAX_PLANNED} matches ahead.`);
        const [row] = await db
          .insert(plannedMatches)
          .values({ userId: actor.id, ...columns(request.body) })
          .returning();
        return reply.code(201).send(dto(row!));
      },
    );

    app.put(
      "/me/planned-matches/:id",
      { schema: { tags: ["matches"], summary: "Change a match you've set up ahead of time.", params: Params, body: Body } },
      async (request): Promise<PlannedMatch> => {
        const actor = requireRole(request, "umpire");
        if (request.body.date < today()) throw badRequest("past_date", "That day has gone.");
        const [row] = await db
          .update(plannedMatches)
          .set({ ...columns(request.body), updatedAt: deps.now() })
          .where(mine(actor.id, request.params.id))
          .returning();
        if (!row) throw notFound("That match isn't planned any more.");
        return dto(row);
      },
    );

    app.delete(
      "/me/planned-matches/:id",
      { schema: { tags: ["matches"], summary: "Delete a match you've set up ahead of time.", params: Params } },
      async (request, reply) => {
        const actor = requireActor(request);
        await db.delete(plannedMatches).where(mine(actor.id, request.params.id));
        return reply.code(204).send();
      },
    );
  };
