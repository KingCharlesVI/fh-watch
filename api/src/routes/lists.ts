import { and, asc, eq, ilike } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireRole } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { type NamedListTable, competitions, venues } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { conflict, isUniqueViolation, notFound } from "../lib/errors.js";
import { containsPattern } from "../lib/sql.js";
import { audit } from "../services/audit.js";

/**
 * Lists of names that admins keep and umpires pick from when setting up or editing a match:
 * venues (where it's played, not tied to any club, as clubs share grounds) and competitions.
 * A match keeps the name as text, so changing a list never changes a match.
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
}

const LISTS: ListSpec[] = [
  { path: "venues", table: venues, entity: "venue", noun: "venue" },
  { path: "competitions", table: competitions, entity: "competition", noun: "competition" },
];

type Row = NamedListTable["$inferSelect"];
const dto = (r: Row) => ({ id: r.id, name: r.name });

export const listRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    for (const { path, table, entity, noun } of LISTS) {
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

      app.post(`/${path}`, { schema: { tags, body: z.strictObject({ name: Name }) } }, async (request, reply) => {
        const actor = requireRole(request, "admin");
        const { name } = request.body;
        const row = await uniqueName(() =>
          db.transaction(async (tx) => {
            const [created] = await tx.insert(table).values({ name }).returning();
            await audit(tx, actor.id, "create", entity, created!.id, { name });
            return created!;
          }),
        );
        return reply.code(201).send(dto(row));
      });

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
