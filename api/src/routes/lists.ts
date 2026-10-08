import { type Venue, canAddToLists } from "@fh/shared";
import { and, asc, eq, ilike, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor, requireRole } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { type NamedListTable, competitions, matches, venues } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from "../lib/errors.js";
import { containsPattern } from "../lib/sql.js";
import { audit } from "../services/audit.js";
import { reviseMatches } from "../services/matches.js";

/**
 * Lists of names umpires pick from when setting up or editing a match: venues (where it's
 * played, not tied to any club, as clubs share grounds) and competitions. Umpires add ones
 * that are missing as they go; admins tidy the lists (rename, delete, merge). A match keeps
 * the name as text, so renaming or deleting one doesn't change matches; merging a duplicate
 * into another does, so they're all under one name.
 */

/** As long as a match document's venue or competition can be. */
const Name = z.string().trim().min(2).max(120);
const Params = z.object({ id: z.uuid() });

interface ListSpec {
  /** The path and OpenAPI tag, e.g. "venues". */
  path: string;
  table: NamedListTable;
  /** For the audit log, e.g. "venue". */
  entity: string;
  /** For messages, e.g. "venue". */
  noun: string;
  /** The match document's field that holds the name. */
  field: "venue" | "competition";
}

const LISTS: ListSpec[] = [
  { path: "venues", table: venues, entity: "venue", noun: "venue", field: "venue" },
  { path: "competitions", table: competitions, entity: "competition", noun: "competition", field: "competition" },
];

type Row = NamedListTable["$inferSelect"];
// Venues and competitions have the same shape.
const dto = (r: Row): Venue => ({ id: r.id, name: r.name });

export const listRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    for (const { path, table, entity, noun, field } of LISTS) {
      const tags = [path];

      async function requireItem(tx: DbOrTx, id: string) {
        const [row] = await tx.select().from(table).where(eq(table.id, id));
        if (!row) throw notFound(`No such ${noun}.`);
        return row;
      }

      /** Runs a write, turning a clash of names into a 409. */
      async function uniqueName<T>(write: () => Promise<T>): Promise<T> {
        try {
          return await write();
        } catch (err) {
          if (isUniqueViolation(err)) throw conflict(`${entity}_exists`, `There's already a ${noun} with that name.`);
          throw err;
        }
      }

      app.get(
        `/${path}`,
        {
          schema: {
            tags,
            summary: `Every ${noun} by name, or those whose name has every word of q in it.`,
            querystring: z.object({ q: z.string().trim().max(100).optional() }),
          },
        },
        async (request) => {
          const words = request.query.q?.split(/\s+/).filter(Boolean).slice(0, 5) ?? [];
          const rows = await db
            .select()
            .from(table)
            .where(words.length ? and(...words.map((w) => ilike(table.name, containsPattern(w)))) : undefined)
            .orderBy(asc(table.name))
            .limit(words.length ? 50 : 1000);
          return { items: rows.map(dto) };
        },
      );

      app.post(
        `/${path}`,
        {
          schema: {
            tags,
            summary: `Add a ${noun} (umpires and admins). One that's already there, in any capitals, is answered with 200 and not added again.`,
            body: z.strictObject({ name: Name }),
          },
        },
        async (request, reply) => {
          const actor = requireActor(request);
          if (!canAddToLists(actor)) throw forbidden();
          // Spaces tidied, so "Banbury  Road" doesn't sit next to "Banbury Road".
          const name = request.body.name.replace(/\s+/g, " ");
          const [existing] = await db.select().from(table).where(sql`lower(${table.name}) = lower(${name})`);
          if (existing) return reply.code(200).send(dto(existing));
          const row = await uniqueName(() =>
            db.transaction(async (tx) => {
              const [created] = await tx.insert(table).values({ name }).returning();
              await audit(tx, actor.id, "create", entity, created!.id, { name });
              return created!;
            }),
          );
          return reply.code(201).send(dto(row));
        },
      );

      app.patch(`/${path}/:id`, { schema: { tags, params: Params, body: z.strictObject({ name: Name }) } }, async (request) => {
        const actor = requireRole(request, "admin");
        const before = await requireItem(db, request.params.id);
        const row = await uniqueName(() =>
          db.transaction(async (tx) => {
            const [updated] = await tx.update(table).set(request.body).where(eq(table.id, before.id)).returning();
            await audit(tx, actor.id, "update", entity, before.id, { before: dto(before), after: request.body });
            return updated!;
          }),
        );
        return dto(row);
      });

      app.post(
        `/${path}/:id/merge`,
        {
          schema: {
            tags,
            summary: `Merge a duplicate ${noun} into another (admins): its matches take the other's name, in a new revision, and it's deleted.`,
            params: Params,
            body: z.strictObject({ into: z.uuid() }),
          },
        },
        async (request) => {
          const actor = requireRole(request, "admin");
          if (request.body.into === request.params.id) throw badRequest("same_item", `Pick a different ${noun} to merge into.`);
          const from = await requireItem(db, request.params.id);
          const into = await requireItem(db, request.body.into);
          const changed = await db.transaction(async (tx) => {
            const n = await reviseMatches(
              tx,
              actor.id,
              sql`lower(${matches[field]}) = lower(${from.name})`,
              (doc) => ({ ...doc, [field]: into.name }),
              deps.now(),
              `${entity}_merge`,
            );
            await tx.delete(table).where(eq(table.id, from.id));
            await audit(tx, actor.id, "merge", entity, from.id, { from: dto(from), into: dto(into), matches: n });
            return n;
          });
          return { into: dto(into), matches: changed };
        },
      );

      app.delete(
        `/${path}/:id`,
        { schema: { tags, summary: `Delete a ${noun}. Matches keep its name.`, params: Params } },
        async (request, reply) => {
          const actor = requireRole(request, "admin");
          const row = await requireItem(db, request.params.id);
          await db.transaction(async (tx) => {
            await tx.delete(table).where(eq(table.id, row.id));
            await audit(tx, actor.id, "delete", entity, row.id, dto(row));
          });
          return reply.code(204).send();
        },
      );
    }
  };
