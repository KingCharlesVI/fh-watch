import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { toUserDto } from "../auth.js";
import { clubRequests, clubs, emailTokens, refreshTokens, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { sha256 } from "../lib/crypto.js";
import { HttpError, badRequest, unauthorized } from "../lib/errors.js";
import { RateLimiter } from "../lib/rate-limit.js";
import { audit } from "../services/audit.js";
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_REUSE_GRACE_MS,
  hashPassword,
  issueEmailToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  signAccessToken,
  timingSafeDummyVerify,
  verifyPassword,
} from "../services/auth-tokens.js";
import type { Mail } from "../services/mailer.js";

export const Email = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const Password = z.string().min(10, "Use at least 10 characters.").max(200);
export const DisplayName = z.string().trim().min(1).max(80);

export const ClubRequestInput = z.union([
  z.strictObject({ clubId: z.uuid() }),
  z.strictObject({ clubName: z.string().trim().min(2).max(100), wantsAdmin: z.boolean() }),
]);

const AcceptedMessage = { message: "If the details are right, you'll get an email shortly." };

export const authRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db, config } = deps;
    const limiter = new RateLimiter(deps.authRateLimit.max, deps.authRateLimit.windowMs, deps.now);

    /** Counts the attempt against the caller's IP and, if given, the email. */
    const limit = (request: FastifyRequest, bucket: string, email?: string) => {
      const okIp = limiter.hit(`${bucket}:ip:${request.ip}`);
      const okEmail = email ? limiter.hit(`${bucket}:email:${email}`) : true;
      if (!okIp || !okEmail) throw new HttpError(429, "rate_limited", "Too many attempts. Try again in 15 minutes.");
    };

    const sendMail = (log: FastifyBaseLogger, mail: Mail) =>
      deps.mailer.send(mail).catch((err: unknown) => log.error({ err, to: mail.to }, "Failed to send email"));

    const verifyMail = (to: string, token: string): Mail => ({
      to,
      subject: "Confirm your email address",
      text: `Confirm your email address to finish setting up your account:\n\n${config.webUrl}/verify-email?token=${token}\n\nThe link expires in 24 hours.`,
    });

    async function tokenPair(userId: string, familyId: string) {
      const now = deps.now();
      return {
        accessToken: await signAccessToken(config, userId, now),
        accessTokenExpiresIn: ACCESS_TOKEN_TTL_SEC,
        refreshToken: await issueRefreshToken(db, userId, familyId, now),
      };
    }

    app.post(
      "/auth/register",
      {
        schema: {
          tags: ["auth"],
          summary: "Create an umpire account. Always answers 202 so emails can't be probed.",
          body: z.strictObject({
            email: Email,
            password: Password,
            displayName: DisplayName,
            clubRequest: ClubRequestInput.optional(),
          }),
        },
      },
      async (request, reply) => {
        const { email, password, displayName, clubRequest } = request.body;
        limit(request, "register", email);

        const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (existing) {
          void sendMail(request.log, {
            to: email,
            subject: "You already have an account",
            text: `Someone tried to register with this email address, which already has an account.\n\nIf it was you, sign in or reset your password at ${config.webUrl}/forgot-password.`,
          });
          return reply.code(202).send(AcceptedMessage);
        }

        if (clubRequest && "clubId" in clubRequest) {
          const [club] = await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubRequest.clubId));
          if (!club) throw badRequest("unknown_club", "That club doesn't exist.");
        }

        const passwordHash = await hashPassword(password);
        const token = await db.transaction(async (tx) => {
          const [user] = await tx.insert(users).values({ email, passwordHash, displayName }).returning({ id: users.id });
          if (clubRequest) {
            await tx.insert(clubRequests).values(
              "clubId" in clubRequest
                ? { userId: user!.id, clubId: clubRequest.clubId, wantsAdmin: true }
                : { userId: user!.id, clubName: clubRequest.clubName, wantsAdmin: clubRequest.wantsAdmin },
            );
          }
          await audit(tx, user!.id, "register", "user", user!.id);
          return issueEmailToken(tx, user!.id, "verify_email", deps.now());
        });
        void sendMail(request.log, verifyMail(email, token));
        return reply.code(202).send(AcceptedMessage);
      },
    );

    app.post(
      "/auth/resend-verification",
      { schema: { tags: ["auth"], body: z.strictObject({ email: Email }) } },
      async (request, reply) => {
        const { email } = request.body;
        limit(request, "verify", email);
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (user && !user.emailVerifiedAt) {
          const token = await issueEmailToken(db, user.id, "verify_email", deps.now());
          void sendMail(request.log, verifyMail(email, token));
        }
        return reply.code(202).send(AcceptedMessage);
      },
    );

    app.post(
      "/auth/verify-email",
      { schema: { tags: ["auth"], body: z.strictObject({ token: z.string().min(1).max(200) }) } },
      async (request, reply) => {
        limit(request, "verify");
        const now = deps.now();
        await db.transaction(async (tx) => {
          const [row] = await tx
            .update(emailTokens)
            .set({ usedAt: now })
            .where(
              and(
                eq(emailTokens.tokenHash, sha256(request.body.token)),
                eq(emailTokens.purpose, "verify_email"),
                isNull(emailTokens.usedAt),
                gt(emailTokens.expiresAt, now),
              ),
            )
            .returning({ userId: emailTokens.userId });
          if (!row) throw badRequest("invalid_token", "This link is invalid or has expired.");
          await tx.update(users).set({ emailVerifiedAt: now, updatedAt: now }).where(eq(users.id, row.userId));
          await audit(tx, row.userId, "verify_email", "user", row.userId);
        });
        return reply.code(204).send();
      },
    );

    app.post(
      "/auth/login",
      { schema: { tags: ["auth"], body: z.strictObject({ email: Email, password: z.string().min(1).max(200) }) } },
      async (request) => {
        const { email, password } = request.body;
        limit(request, "login", email);
        const [user] = await db.select().from(users).where(eq(users.email, email));
        if (!user) {
          await timingSafeDummyVerify(password);
          throw new HttpError(401, "invalid_credentials", "Email or password is wrong.");
        }
        if (!(await verifyPassword(user.passwordHash, password))) {
          throw new HttpError(401, "invalid_credentials", "Email or password is wrong.");
        }
        if (!user.emailVerifiedAt) {
          throw new HttpError(403, "email_not_verified", "Confirm your email address before signing in.");
        }
        return { ...(await tokenPair(user.id, randomUUID())), user: toUserDto(user) };
      },
    );

    app.post(
      "/auth/refresh",
      {
        schema: {
          tags: ["auth"],
          summary: "Swap a refresh token for a new pair. Reusing a spent token after 30 seconds signs out that whole session.",
          body: z.strictObject({ refreshToken: z.string().min(1).max(200) }),
        },
      },
      async (request) => {
        const now = deps.now();
        const [row] = await db
          .select()
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, sha256(request.body.refreshToken)));
        if (!row || row.expiresAt <= now) throw unauthorized("Refresh token is invalid or expired.");

        const [spent] = await db
          .update(refreshTokens)
          .set({ revokedAt: now, rotatedAt: now })
          .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
          .returning({ id: refreshTokens.id });
        const [latest] = spent ? [row] : await db.select().from(refreshTokens).where(eq(refreshTokens.id, row.id));
        const withinGrace =
          !spent && latest?.rotatedAt != null && now.getTime() - latest.rotatedAt.getTime() <= REFRESH_REUSE_GRACE_MS;
        if (!spent && !withinGrace) {
          // Already used: someone may have stolen it. End the whole session.
          await db
            .update(refreshTokens)
            .set({ revokedAt: now })
            .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
          throw new HttpError(401, "refresh_token_reused", "This session has ended. Sign in again.");
        }

        const [user] = await db.select().from(users).where(eq(users.id, row.userId));
        if (!user) throw unauthorized("Account no longer exists.");
        return { ...(await tokenPair(user.id, row.familyId)), user: toUserDto(user) };
      },
    );

    app.post(
      "/auth/logout",
      { schema: { tags: ["auth"], body: z.strictObject({ refreshToken: z.string().min(1).max(200) }) } },
      async (request, reply) => {
        const [row] = await db
          .select({ familyId: refreshTokens.familyId })
          .from(refreshTokens)
          .where(eq(refreshTokens.tokenHash, sha256(request.body.refreshToken)));
        if (row) {
          await db
            .update(refreshTokens)
            .set({ revokedAt: deps.now() })
            .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
        }
        return reply.code(204).send();
      },
    );

    app.post(
      "/auth/forgot-password",
      { schema: { tags: ["auth"], body: z.strictObject({ email: Email }) } },
      async (request, reply) => {
        const { email } = request.body;
        limit(request, "reset", email);
        const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
        if (user) {
          const token = await issueEmailToken(db, user.id, "reset_password", deps.now());
          void sendMail(request.log, {
            to: email,
            subject: "Reset your password",
            text: `Reset your password here:\n\n${config.webUrl}/reset-password?token=${token}\n\nThe link expires in 1 hour. If you didn't ask for this, ignore this email.`,
          });
        }
        return reply.code(202).send(AcceptedMessage);
      },
    );

    app.post(
      "/auth/reset-password",
      { schema: { tags: ["auth"], body: z.strictObject({ token: z.string().min(1).max(200), password: Password }) } },
      async (request, reply) => {
        limit(request, "reset");
        const now = deps.now();
        const passwordHash = await hashPassword(request.body.password);
        await db.transaction(async (tx) => {
          const [row] = await tx
            .update(emailTokens)
            .set({ usedAt: now })
            .where(
              and(
                eq(emailTokens.tokenHash, sha256(request.body.token)),
                eq(emailTokens.purpose, "reset_password"),
                isNull(emailTokens.usedAt),
                gt(emailTokens.expiresAt, now),
              ),
            )
            .returning({ userId: emailTokens.userId });
          if (!row) throw badRequest("invalid_token", "This link is invalid or has expired.");
          const [user] = await tx.select({ verifiedAt: users.emailVerifiedAt }).from(users).where(eq(users.id, row.userId));
          // Following the emailed link proves the address, so it counts as verification.
          await tx
            .update(users)
            .set({ passwordHash, emailVerifiedAt: user?.verifiedAt ?? now, updatedAt: now })
            .where(eq(users.id, row.userId));
          await revokeAllRefreshTokens(tx, row.userId, now);
          await audit(tx, row.userId, "reset_password", "user", row.userId);
        });
        return reply.code(204).send();
      },
    );
  };
