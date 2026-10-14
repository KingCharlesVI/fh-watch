import type { AuditEntry } from "@fh/shared";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { auditLog, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest } from "../lib/errors.js";
import { Limit } from "../lib/sql.js";

export const auditRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    app.get(
      "/audit",
      {
        schema: {
          tags: ["admin"],
          summary: "The audit log, newest first: who changed what. Admins only.",
          querystring: z.object({
            entity: z.string().trim().min(1).max(40).optional().describe("e.g. match, club, team, user, appointment."),
            entityId: z.string().trim().min(1).max(100).optional(),
            actorId: z.uuid().optional(),
            action: z.string().trim().min(1).max(40).optional(),
            from: z.iso.datetime({ offset: true }).optional().describe("At or after (inclusive)."),
            to: z.iso.datetime({ offset: true }).optional().describe("Before (exclusive)."),
            cursor: z.string().optional(),
            limit: z.coerce.number().int().min(Limit.min).max(Limit.max).default(Limit.default),
          }),
        },
      },
      async (request) => {
        requireRole(request, "admin");
        const { entity, entityId, actorId, action, from, to, cursor, limit } = request.query;
        // Newest first by id, which only goes up: `at` is to the microsecond, more than a cursor keeps.
        const before = cursor === undefined ? null : Number(cursor);
        if (before !== null && !(Number.isSafeInteger(before) && before > 0)) throw badRequest("invalid_cursor", "The cursor is not valid.");
        const rows = await db
          .select({
            id: auditLog.id,
            at: auditLog.at,
            action: auditLog.action,
            entity: auditLog.entity,
            entityId: auditLog.entityId,
            diff: auditLog.diff,
            actorId: auditLog.actorId,
            actorName: users.displayName,
          })
          .from(auditLog)
          .leftJoin(users, eq(users.id, auditLog.actorId))
          .where(
            and(
              entity ? eq(auditLog.entity, entity) : undefined,
              entityId ? eq(auditLog.entityId, entityId) : undefined,
              actorId ? eq(auditLog.actorId, actorId) : undefined,
              action ? eq(auditLog.action, action) : undefined,
              from ? gte(auditLog.at, new Date(from)) : undefined,
              to ? lt(auditLog.at, new Date(to)) : undefined,
              before !== null ? lt(auditLog.id, before) : undefined,
            ),
          )
          .orderBy(desc(auditLog.id))
          .limit(limit + 1);
        const items = rows.slice(0, limit);
        const nextCursor = rows.length > limit ? String(items.at(-1)!.id) : null;
        return {
          items: items.map(
            (r): AuditEntry => ({
              id: r.id,
              at: r.at.toISOString(),
              actor: r.actorId && r.actorName !== null ? { id: r.actorId, displayName: r.actorName } : null,
              action: r.action,
              entity: r.entity,
              entityId: r.entityId,
              diff: r.diff,
            }),
          ),
          nextCursor,
        };
      },
    );
  };
