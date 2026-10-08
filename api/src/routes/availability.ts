import { type Availability, type AvailabilityDay, TIME_PATTERN, addDays, localDay } from "@fh/shared";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { umpireAvailability, umpireUnavailableWeekdays } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest } from "../lib/errors.js";

/**
 * Each umpire's own availability: days they can or can't umpire (with hours, if only some),
 * and weekdays they're never free. Club admins see it through suggestions when appointing.
 */

const Time = z.string().regex(TIME_PATTERN, "Use a 24-hour time, e.g. 14:00.");
/** How far ahead the calendar shows by default. */
const DEFAULT_WEEKS = 12;

type DayRow = typeof umpireAvailability.$inferSelect;
export const dayDto = (r: DayRow): AvailabilityDay => ({ date: r.date, available: r.available, from: r.fromTime, to: r.toTime });

/** Marked days between two dates and weekdays never free, for each of some umpires. */
export async function availabilityOf(db: DbOrTx, userIds: string[], from: string, to: string) {
  const byUser = new Map<string, { days: Map<string, AvailabilityDay>; weekdays: number[] }>(
    userIds.map((id) => [id, { days: new Map(), weekdays: [] }]),
  );
  if (userIds.length === 0) return byUser;
  const [days, weekdays] = await Promise.all([
    db
      .select()
      .from(umpireAvailability)
      .where(and(inArray(umpireAvailability.userId, userIds), gte(umpireAvailability.date, from), lte(umpireAvailability.date, to))),
    db.select().from(umpireUnavailableWeekdays).where(inArray(umpireUnavailableWeekdays.userId, userIds)).orderBy(asc(umpireUnavailableWeekdays.weekday)),
  ]);
  for (const d of days) byUser.get(d.userId)!.days.set(d.date, dayDto(d));
  for (const w of weekdays) byUser.get(w.userId)!.weekdays.push(w.weekday);
  return byUser;
}

export const availabilityRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    app.get(
      "/me/availability",
      {
        schema: {
          tags: ["umpiring"],
          summary: `Your marked days, from today for ${DEFAULT_WEEKS} weeks unless from and to say otherwise, and weekdays you're never free.`,
          querystring: z.object({ from: z.iso.date().optional(), to: z.iso.date().optional() }),
        },
      },
      async (request): Promise<Availability> => {
        const actor = requireActor(request);
        const from = request.query.from ?? localDay(deps.now());
        const to = request.query.to ?? addDays(from, DEFAULT_WEEKS * 7);
        const [days, weekdays] = await Promise.all([
          db
            .select()
            .from(umpireAvailability)
            .where(and(eq(umpireAvailability.userId, actor.id), gte(umpireAvailability.date, from), lte(umpireAvailability.date, to)))
            .orderBy(asc(umpireAvailability.date)),
          db.select().from(umpireUnavailableWeekdays).where(eq(umpireUnavailableWeekdays.userId, actor.id)),
        ]);
        return { days: days.map(dayDto), unavailableWeekdays: weekdays.map((w) => w.weekday).sort() };
      },
    );

    app.put(
      "/me/availability/:date",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Mark a day you can (with from and to, only some hours) or can't umpire.",
          params: z.object({ date: z.iso.date() }),
          body: z.strictObject({ available: z.boolean(), from: Time.nullable().optional(), to: Time.nullable().optional() }),
        },
      },
      async (request): Promise<AvailabilityDay> => {
        const actor = requireActor(request);
        const { date } = request.params;
        const { available } = request.body;
        // Hours only mean something on a day they can do.
        const fromTime = available ? (request.body.from ?? null) : null;
        const toTime = available ? (request.body.to ?? null) : null;
        if (fromTime && toTime && fromTime >= toTime) throw badRequest("bad_hours", "The hours must end after they start.");
        const [row] = await db
          .insert(umpireAvailability)
          .values({ userId: actor.id, date, available, fromTime, toTime })
          .onConflictDoUpdate({ target: [umpireAvailability.userId, umpireAvailability.date], set: { available, fromTime, toTime } })
          .returning();
        return dayDto(row!);
      },
    );

    app.delete(
      "/me/availability/:date",
      { schema: { tags: ["umpiring"], summary: "Unmark a day.", params: z.object({ date: z.iso.date() }) } },
      async (request, reply) => {
        const actor = requireActor(request);
        await db.delete(umpireAvailability).where(and(eq(umpireAvailability.userId, actor.id), eq(umpireAvailability.date, request.params.date)));
        return reply.code(204).send();
      },
    );

    app.put(
      "/me/availability-weekdays",
      {
        schema: {
          tags: ["umpiring"],
          summary: "Set the weekdays you're never free, 0 for Sunday to 6 for Saturday. A day you mark overrides them.",
          body: z.strictObject({ unavailable: z.array(z.number().int().min(0).max(6)).max(7) }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const weekdays = [...new Set(request.body.unavailable)].sort();
        await db.transaction(async (tx) => {
          await tx.delete(umpireUnavailableWeekdays).where(eq(umpireUnavailableWeekdays.userId, actor.id));
          if (weekdays.length) await tx.insert(umpireUnavailableWeekdays).values(weekdays.map((weekday) => ({ userId: actor.id, weekday })));
        });
        return { unavailableWeekdays: weekdays };
      },
    );
  };
