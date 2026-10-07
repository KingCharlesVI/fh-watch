import { and, asc, eq, ilike } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireRole } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { venues } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { conflict, isUniqueViolation, notFound } from "../lib/errors.js";
import { containsPattern } from "../lib/sql.js";
import { audit } from "../services/audit.js";

/**
 * Venues: where matches are played. One list for everyone, not tied to any club (clubs
 * share grounds). Admins keep it; umpires are offered it when setting up a match, and a
 * match keeps its venue as text, so changing the list never changes a match.
 */

/** As long as a match document's venue can be. */
const Name = z.string().trim().min(2).max(120);
const Params = z.object({ id: z.uuid() });

type VenueRow = typeof venues.$inferSelect;
const venueDto = (v: VenueRow) => ({ id: v.id, name: v.name });

async function requireVenue(db: DbOrTx, id: string) {
  const [venue] = await db.select().from(venues).where(eq(venues.id, id));
  if (!venue) throw notFound("Venue not found.");
  return venue;
}

/** Runs a write, turning a clash of names into a 409. */
async function uniqueName<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict("venue_exists", "There's already a venue with that name.");
    throw err;
  }
}

export const venueRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    app.get(
      "/venues",
      {
        schema: {
          tags: ["venues"],
          summary: "Every venue by name, or those whose name has every word of q in it, e.g. 'banbury road'.",
          querystring: z.object({ q: z.string().trim().max(100).optional() }),
        },
      },
      async (request) => {
        const words = request.query.q?.split(/\s+/).filter(Boolean).slice(0, 5) ?? [];
        const rows = await db
          .select()
          .from(venues)
          .where(words.length ? and(...words.map((w) => ilike(venues.name, containsPattern(w)))) : undefined)
          .orderBy(asc(venues.name))
          .limit(words.length ? 50 : 1000);
        return { items: rows.map(venueDto) };
      },
    );

    app.post("/venues", { schema: { tags: ["venues"], body: z.strictObject({ name: Name }) } }, async (request, reply) => {
      const actor = requireRole(request, "admin");
      const { name } = request.body;
      const venue = await uniqueName(() =>
        db.transaction(async (tx) => {
          const [row] = await tx.insert(venues).values({ name }).returning();
          await audit(tx, actor.id, "create", "venue", row!.id, { name });
          return row!;
        }),
      );
      return reply.code(201).send(venueDto(venue));
    });

    app.patch(
      "/venues/:id",
      { schema: { tags: ["venues"], params: Params, body: z.strictObject({ name: Name }) } },
      async (request) => {
        const actor = requireRole(request, "admin");
        const venue = await requireVenue(db, request.params.id);
        const updated = await uniqueName(() =>
          db.transaction(async (tx) => {
            const [row] = await tx.update(venues).set(request.body).where(eq(venues.id, venue.id)).returning();
            await audit(tx, actor.id, "update", "venue", venue.id, { before: venueDto(venue), after: request.body });
            return row!;
          }),
        );
        return venueDto(updated);
      },
    );

    app.delete(
      "/venues/:id",
      { schema: { tags: ["venues"], summary: "Delete a venue. Matches played there keep its name.", params: Params } },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const venue = await requireVenue(db, request.params.id);
        await db.transaction(async (tx) => {
          await tx.delete(venues).where(eq(venues.id, venue.id));
          await audit(tx, actor.id, "delete", "venue", venue.id, venueDto(venue));
        });
        return reply.code(204).send();
      },
    );
  };
