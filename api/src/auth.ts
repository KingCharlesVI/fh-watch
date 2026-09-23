import { type Actor, type Role, hasRole } from "@fh/shared";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { users } from "./db/schema.js";
import type { AppDeps } from "./deps.js";
import { forbidden, unauthorized } from "./lib/errors.js";
import { verifyAccessToken } from "./services/auth-tokens.js";

export interface AuthUser extends Actor {
  email: string;
  displayName: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in user, or null for the public. */
    actor: AuthUser | null;
  }
}

/**
 * Reads `Authorization: Bearer <access token>` on every request. No header
 * means a public request; a bad or expired token is a 401 so the client
 * knows to refresh, even on public routes.
 */
export function registerAuth(app: FastifyInstance, deps: AppDeps): void {
  app.decorateRequest("actor", null);
  app.addHook("onRequest", async (request) => {
    const header = request.headers.authorization;
    if (!header) return;
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) throw unauthorized("Malformed Authorization header.");
    const userId = await verifyAccessToken(deps.config, match[1]!, deps.now());
    if (!userId) throw unauthorized("Access token is invalid or expired.");
    const [user] = await deps.db
      .select({ id: users.id, email: users.email, displayName: users.displayName, roles: users.roles, clubId: users.clubId })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw unauthorized("Account no longer exists.");
    request.actor = user;
  });
}

export function requireActor(request: FastifyRequest): AuthUser {
  if (!request.actor) throw unauthorized();
  return request.actor;
}

export function requireRole(request: FastifyRequest, role: Role): AuthUser {
  const actor = requireActor(request);
  if (!hasRole(actor, role)) throw forbidden();
  return actor;
}

type UserRow = typeof users.$inferSelect;

export function toUserDto(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    clubId: user.clubId,
    emailVerified: user.emailVerifiedAt !== null,
    deletionRequested: user.deletionRequestedAt !== null,
    createdAt: user.createdAt.toISOString(),
  };
}
