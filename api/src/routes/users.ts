import { ROLES } from "@fh/shared";
import { and, arrayContains, desc, eq, ilike, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor, requireRole, toUserDto } from "../auth.js";
import { clubs, matchUmpires, pushTokens, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { decodeCursor, page } from "../lib/cursor.js";
import { HttpError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { Limit, containsPattern } from "../lib/sql.js";
import { audit } from "../services/audit.js";
import { hashPassword, revokeAllRefreshTokens, verifyPassword } from "../services/auth-tokens.js";
import { DisplayName, Password } from "./auth.js";

const IdParams = z.object({ id: z.uuid() });

export const userRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    async function loadUser(id: string) {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      if (!user) throw notFound("User not found.");
      return user;
    }

    // ---- Your own account ----

    app.get("/me", { schema: { tags: ["me"] } }, async (request) => toUserDto(await loadUser(requireActor(request).id)));

    app.patch(
      "/me",
      {
        schema: {
          tags: ["me"],
          summary: "Change your display name or password. A new password signs out every device.",
          body: z
            .strictObject({
              displayName: DisplayName.optional(),
              currentPassword: z.string().max(200).optional(),
              newPassword: Password.optional(),
            })
            .refine((b) => !b.newPassword || b.currentPassword, {
              message: "currentPassword is required to set a new password.",
              path: ["currentPassword"],
            }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const { displayName, currentPassword, newPassword } = request.body;
        const user = await loadUser(actor.id);
        const now = deps.now();
        const changes: Partial<typeof users.$inferInsert> = { updatedAt: now };
        if (displayName !== undefined) changes.displayName = displayName;
        if (newPassword) {
          if (!(await verifyPassword(user.passwordHash, currentPassword!))) {
            throw new HttpError(403, "wrong_password", "Current password is wrong.");
          }
          changes.passwordHash = await hashPassword(newPassword);
        }
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx.update(users).set(changes).where(eq(users.id, actor.id)).returning();
          if (newPassword) await revokeAllRefreshTokens(tx, actor.id, now);
          await audit(tx, actor.id, "update", "user", actor.id, { displayName, passwordChanged: !!newPassword });
          return row!;
        });
        return toUserDto(updated);
      },
    );

    app.delete(
      "/me",
      { schema: { tags: ["me"], summary: "Ask an admin to delete your account." } },
      async (request, reply) => {
        const actor = requireActor(request);
        await db.transaction(async (tx) => {
          await tx.update(users).set({ deletionRequestedAt: deps.now() }).where(eq(users.id, actor.id));
          await audit(tx, actor.id, "request_deletion", "user", actor.id);
        });
        return reply.code(202).send({ message: "An admin will delete your account." });
      },
    );

    app.post(
      "/me/push-tokens",
      {
        schema: {
          tags: ["me"],
          body: z.strictObject({ token: z.string().min(1).max(300), platform: z.enum(["ios", "android"]) }),
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        const { token, platform } = request.body;
        const now = deps.now();
        // A device that changes hands moves to the new account.
        await db
          .insert(pushTokens)
          .values({ userId: actor.id, token, platform, lastUsedAt: now })
          .onConflictDoUpdate({ target: pushTokens.token, set: { userId: actor.id, platform, lastUsedAt: now } });
        return reply.code(204).send();
      },
    );

    app.delete(
      "/me/push-tokens/:token",
      { schema: { tags: ["me"], params: z.object({ token: z.string().min(1).max(300) }) } },
      async (request, reply) => {
        const actor = requireActor(request);
        await db.delete(pushTokens).where(and(eq(pushTokens.token, request.params.token), eq(pushTokens.userId, actor.id)));
        return reply.code(204).send();
      },
    );

    // ---- Umpire lookup, for adding umpire 2 to a match ----

    app.get(
      "/umpires",
      { schema: { tags: ["users"], querystring: z.object({ q: z.string().trim().min(1).max(80) }) } },
      async (request) => {
        const actor = requireActor(request);
        if (!actor.roles.includes("umpire") && !actor.roles.includes("admin")) throw forbidden();
        const rows = await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(
            and(
              arrayContains(users.roles, ["umpire"]),
              isNotNull(users.emailVerifiedAt),
              ilike(users.displayName, containsPattern(request.query.q)),
            ),
          )
          .orderBy(users.displayName)
          .limit(20);
        return { items: rows };
      },
    );

    // ---- Admin: manage users ----

    app.get(
      "/users",
      {
        schema: {
          tags: ["users"],
          querystring: z.object({
            q: z.string().trim().max(254).optional(),
            role: z.enum(ROLES).optional(),
            deletionRequested: z.stringbool().optional(),
            cursor: z.string().optional(),
            limit: z.coerce.number().int().min(Limit.min).max(Limit.max).default(Limit.default),
          }),
        },
      },
      async (request) => {
        requireRole(request, "admin");
        const { q, role, deletionRequested, cursor, limit } = request.query;
        const c = cursor ? decodeCursor(cursor) : null;
        const rows = await db
          .select()
          .from(users)
          .where(
            and(
              q ? or(ilike(users.email, containsPattern(q)), ilike(users.displayName, containsPattern(q))) : undefined,
              role ? arrayContains(users.roles, [role]) : undefined,
              deletionRequested === undefined
                ? undefined
                : deletionRequested
                  ? isNotNull(users.deletionRequestedAt)
                  : isNull(users.deletionRequestedAt),
              c ? sql`(${users.createdAt}, ${users.id}) < (${c.sortValue}::timestamptz, ${c.id}::uuid)` : undefined,
            ),
          )
          .orderBy(desc(users.createdAt), desc(users.id))
          .limit(limit + 1);
        const { items, nextCursor } = page(rows, limit, (u) => [u.createdAt, u.id]);
        return { items: items.map(toUserDto), nextCursor };
      },
    );

    app.get("/users/:id", { schema: { tags: ["users"], params: IdParams } }, async (request) => {
      requireRole(request, "admin");
      return toUserDto(await loadUser(request.params.id));
    });

    app.patch(
      "/users/:id",
      {
        schema: {
          tags: ["users"],
          summary: "Set a user's roles and club. The club is kept only while the user is a club admin.",
          params: IdParams,
          body: z.strictObject({
            displayName: DisplayName.optional(),
            roles: z
              .array(z.enum(ROLES))
              .max(ROLES.length)
              .refine((r) => new Set(r).size === r.length, "Roles must not repeat.")
              .optional(),
            clubId: z.uuid().nullable().optional(),
          }),
        },
      },
      async (request) => {
        const actor = requireRole(request, "admin");
        const user = await loadUser(request.params.id);
        const { displayName, roles: newRoles, clubId: newClubId } = request.body;

        const roles = newRoles ?? user.roles;
        if (user.id === actor.id && !roles.includes("admin")) {
          throw conflict("cannot_remove_own_admin", "You can't remove your own admin role.");
        }
        let clubId: string | null = null;
        if (roles.includes("club_admin")) {
          clubId = newClubId === undefined ? user.clubId : newClubId;
          if (!clubId) throw badRequest("club_required", "A club admin needs a club.");
          const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId));
          if (!club) throw badRequest("unknown_club", "That club doesn't exist.");
        }

        const updated = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(users)
            .set({ roles, clubId, updatedAt: deps.now(), ...(displayName !== undefined ? { displayName } : {}) })
            .where(eq(users.id, user.id))
            .returning();
          await audit(tx, actor.id, "update", "user", user.id, {
            before: { roles: user.roles, clubId: user.clubId, displayName: user.displayName },
            after: { roles, clubId, displayName: row!.displayName },
          });
          return row!;
        });
        return toUserDto(updated);
      },
    );

    app.delete(
      "/users/:id",
      {
        schema: {
          tags: ["users"],
          summary: "Delete a user. Their matches stay, with the umpire shown as a deleted user.",
          params: IdParams,
        },
      },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const user = await loadUser(request.params.id);
        if (user.id === actor.id) throw conflict("cannot_delete_self", "You can't delete your own account.");
        await db.transaction(async (tx) => {
          await tx.update(matchUmpires).set({ userId: null, name: "Deleted user" }).where(eq(matchUmpires.userId, user.id));
          await tx.delete(users).where(eq(users.id, user.id));
          await audit(tx, actor.id, "delete", "user", user.id, { email: user.email });
        });
        return reply.code(204).send();
      },
    );
  };
