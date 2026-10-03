import { and, desc, eq } from "drizzle-orm";
import type { FastifyBaseLogger, FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { accessRequests } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { HttpError, conflict, notFound } from "../lib/errors.js";
import { RateLimiter } from "../lib/rate-limit.js";
import { audit } from "../services/audit.js";
import type { Mail } from "../services/mailer.js";
import { Email } from "./auth.js";

const Kind = z.enum(["google-play", "testflight"]);
const Params = z.object({ id: z.uuid() });
/** What an admin can add to the email the umpire gets. Absent is a decision with nothing to say. */
const Decision = z.strictObject({ note: z.string().trim().max(1000).optional() }).nullish();

const AccessRequestInput = z.strictObject({
  kind: Kind,
  name: z.string().trim().min(1).max(80),
  email: Email,
  devices: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).optional(),
});

/** Nothing here is anyone's account, so a request is only ever shown to an admin. */
type Row = typeof accessRequests.$inferSelect;
const dto = (r: Row) => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  email: r.email,
  devices: r.devices,
  notes: r.notes,
  status: r.status,
  decisionNote: r.decisionNote,
  createdAt: r.createdAt.toISOString(),
  reviewedAt: r.reviewedAt?.toISOString() ?? null,
});

const Accepted = { message: "Thanks. We'll email you about it." };

/** What to call each test in an email. */
const TEST_NAME = { "google-play": "Google Play", testflight: "TestFlight" } as const;

/**
 * Asking to join a test, from the landing page's form, and the admin side of
 * answering. The form is on another origin (the landing page is a static site on
 * its own domain), so the public route allows it by name and nothing else does.
 */
export const accessRequestRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db, config } = deps;

    /** Email never holds up an answer, and a request that's in isn't lost if it can't be sent. */
    const sendMail = (log: FastifyBaseLogger, mail: Mail) =>
      deps.mailer.send(mail).catch((err: unknown) => log.error({ err, to: mail.to }, "Failed to send email"));

    /** Says we have it, so nobody is left wondering whether the form worked. */
    const acknowledgement = (row: Row, replaced: boolean): Mail => ({
      to: row.email,
      subject: `Your request to join the ${TEST_NAME[row.kind]} test`,
      text: [
        `Thanks for asking to join the ${TEST_NAME[row.kind]} test of FH Match Centre.`,
        replaced ? "This replaces the request we already had from you." : null,
        "",
        "What you sent:",
        `  Name: ${row.name}`,
        `  Watch and phone: ${row.devices}`,
        ...(row.notes ? [`  Notes: ${row.notes}`] : []),
        "",
        "There's nothing to do for now. We'll email you again when a place is ready, with how to install the apps.",
        "Places are limited while the apps are in testing, so it can take a few days.",
        "",
        `If you didn't ask for this, ignore this email: ${config.landingUrl}`,
      ]
        .filter((line) => line !== null)
        .join("\n"),
    });
    // The same allowance as sign-in, counted per address and per IP.
    const limiter = new RateLimiter(deps.authRateLimit.max, deps.authRateLimit.windowMs, deps.now);

    app.post(
      "/access-requests",
      {
        schema: {
          tags: ["access"],
          summary: "Ask to join the Google Play or TestFlight test. Always answers 202.",
          body: AccessRequestInput,
        },
        // The landing page is a different origin, so the browser asks first.
        onRequest: async (request, reply) => {
          if (!allowLanding(deps, request.headers.origin, reply)) throw new HttpError(403, "origin_not_allowed", "Post this from the website's own form.");
        },
      },
      async (request, reply) => {
        const { kind, name, email, devices, notes } = request.body;
        for (const key of [`access:ip:${request.ip}`, `access:email:${email}`]) {
          if (!limiter.hit(key)) throw new HttpError(429, "rate_limited", "Too many requests. Try again in 15 minutes.");
        }

        let replaced = false;
        const row = await db.transaction(async (tx) => {
          // Asking twice (a lost email, a changed watch) updates the one that's waiting.
          const [waiting] = await tx
            .select()
            .from(accessRequests)
            .where(and(eq(accessRequests.email, email), eq(accessRequests.kind, kind), eq(accessRequests.status, "pending")));
          if (waiting) {
            replaced = true;
            const [updated] = await tx
              .update(accessRequests)
              .set({ name, devices, notes: notes ?? null })
              .where(eq(accessRequests.id, waiting.id))
              .returning();
            return updated!;
          }
          const [created] = await tx.insert(accessRequests).values({ kind, name, email, devices, notes }).returning();
          await audit(tx, null, "create", "access_request", created!.id, { kind });
          return created!;
        });
        request.log.info({ id: row.id, kind }, "Access request");
        void sendMail(request.log, acknowledgement(row, replaced));
        return reply.code(202).send(Accepted);
      },
    );

    // The preflight for the form's POST. Fastify answers OPTIONS itself otherwise, without the headers.
    app.options(
      "/access-requests",
      { schema: { hide: true } },
      async (request, reply) => {
        if (!allowLanding(deps, request.headers.origin, reply)) return reply.code(403).send();
        reply.header("access-control-allow-methods", "POST, OPTIONS");
        reply.header("access-control-allow-headers", "content-type");
        reply.header("access-control-max-age", "86400");
        return reply.code(204).send();
      },
    );

    app.get(
      "/access-requests",
      {
        schema: {
          tags: ["access"],
          summary: "Every request, newest first. Admins only.",
          querystring: z.object({ status: z.enum(["pending", "approved", "denied"]).optional(), kind: Kind.optional() }),
        },
      },
      async (request) => {
        requireRole(request, "admin");
        const { status, kind } = request.query;
        const rows = await db
          .select()
          .from(accessRequests)
          .where(and(status ? eq(accessRequests.status, status) : undefined, kind ? eq(accessRequests.kind, kind) : undefined))
          .orderBy(desc(accessRequests.createdAt))
          .limit(500);
        return { items: rows.map(dto) };
      },
    );

    /** Answers a request, once: the row is locked so two admins can't both decide it. */
    async function decide(request: FastifyRequest, id: string, status: "approved" | "denied", note?: string) {
      const actor = requireRole(request, "admin");
      const now = deps.now();
      return db.transaction(async (tx) => {
        const [row] = await tx.select().from(accessRequests).where(eq(accessRequests.id, id)).for("update");
        if (!row) throw notFound("Request not found.");
        if (row.status !== "pending") throw conflict("already_reviewed", `This request was already ${row.status}.`);
        const [updated] = await tx
          .update(accessRequests)
          .set({ status, decisionNote: note ?? null, reviewedBy: actor.id, reviewedAt: now })
          .where(eq(accessRequests.id, row.id))
          .returning();
        await audit(tx, actor.id, status === "approved" ? "approve" : "deny", "access_request", row.id);
        return updated!;
      });
    }

    app.post(
      "/access-requests/:id/approve",
      {
        schema: {
          tags: ["access"],
          summary: "Let them in. Add the invitation to the email with `note`, if there's anything to say.",
          params: Params,
          body: Decision,
        },
      },
      async (request) => dto(await decide(request, request.params.id, "approved", request.body?.note)),
    );

    app.post(
      "/access-requests/:id/deny",
      {
        schema: { tags: ["access"], summary: "Turn it down. `note` says why, in the email.", params: Params, body: Decision },
      },
      async (request) => dto(await decide(request, request.params.id, "denied", request.body?.note)),
    );
  };

/**
 * Lets the landing page's form post here, and no other site. Returns false for any
 * other origin; a request with no origin at all (curl, the phone app) is left alone.
 */
function allowLanding(deps: AppDeps, origin: string | undefined, reply: FastifyReply): boolean {
  reply.header("vary", "origin");
  if (!origin) return true;
  if (!deps.config.formOrigins.includes(origin)) return false;
  reply.header("access-control-allow-origin", origin);
  return true;
}
