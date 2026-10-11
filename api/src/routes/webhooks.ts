import { type Actor, type WebhookWithSecret, hasRole } from "@fh/shared";
import { count, desc, eq } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor } from "../auth.js";
import { clubs, competitions, webhookDeliveries, webhooks } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { audit } from "../services/audit.js";
import {
  MAX_WEBHOOKS,
  type WebhookRow,
  checkWebhookUrl,
  deliveryDto,
  newSecret,
  queuePing,
  webhookDto,
} from "../services/webhooks.js";

const IdParams = z.object({ id: z.uuid() });
const Url = z.string().trim().min(1).max(500);
const Description = z.string().trim().max(200).nullable();

/** Admins manage every webhook; club admins their own club's. Competitions' are for admins only. */
function canManage(actor: Actor, owner: { clubId: string | null }): boolean {
  if (hasRole(actor, "admin")) return true;
  return owner.clubId !== null && hasRole(actor, "club_admin") && actor.clubId === owner.clubId;
}

/** For the audit log: never the secret. */
const auditable = (w: WebhookRow) => ({ clubId: w.clubId, competitionId: w.competitionId, url: w.url, description: w.description, enabled: w.enabled });

export const webhookRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    /** A webhook the actor may manage. One they may not is a 404, so its address isn't given away. */
    async function load(id: string, actor: Actor): Promise<WebhookRow> {
      const [w] = await db.select().from(webhooks).where(eq(webhooks.id, id));
      if (!w || !canManage(actor, w)) throw notFound("Webhook not found.");
      return w;
    }

    app.get(
      "/webhooks",
      {
        schema: {
          tags: ["webhooks"],
          summary: "A club's or a competition's webhooks. With neither, admins get all of them and club admins their club's.",
          querystring: z.object({ clubId: z.uuid().optional(), competitionId: z.uuid().optional() }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const { clubId, competitionId } = request.query;
        const admin = hasRole(actor, "admin");
        if (competitionId && !admin) throw forbidden();
        if (clubId && !canManage(actor, { clubId })) throw forbidden();
        if (!admin && !clubId && !(hasRole(actor, "club_admin") && actor.clubId)) throw forbidden();
        const scope = clubId
          ? eq(webhooks.clubId, clubId)
          : competitionId
            ? eq(webhooks.competitionId, competitionId)
            : admin
              ? undefined
              : eq(webhooks.clubId, actor.clubId!);
        const rows = await db.select().from(webhooks).where(scope).orderBy(webhooks.createdAt);
        return { items: rows.map(webhookDto) };
      },
    );

    app.post(
      "/webhooks",
      {
        schema: {
          tags: ["webhooks"],
          summary: "Add a webhook for a club or a competition. The answer has its secret, which isn't shown again.",
          body: z
            .strictObject({ clubId: z.uuid().optional(), competitionId: z.uuid().optional(), url: Url, description: Description.optional() })
            .refine((b) => !b.clubId !== !b.competitionId, { message: "Give a clubId or a competitionId, not both." }),
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        const { clubId = null, competitionId = null, description = null } = request.body;
        if (competitionId ? !hasRole(actor, "admin") : !canManage(actor, { clubId })) throw forbidden();
        const url = checkWebhookUrl(request.body.url);
        const [owner] = clubId
          ? await db.select({ id: clubs.id }).from(clubs).where(eq(clubs.id, clubId))
          : await db.select({ id: competitions.id }).from(competitions).where(eq(competitions.id, competitionId!));
        if (!owner) throw notFound(clubId ? "Club not found." : "Competition not found.");

        const secret = newSecret();
        const created = await db.transaction(async (tx) => {
          const [{ n } = { n: 0 }] = await tx
            .select({ n: count() })
            .from(webhooks)
            .where(clubId ? eq(webhooks.clubId, clubId) : eq(webhooks.competitionId, competitionId!));
          if (n >= MAX_WEBHOOKS) throw badRequest("too_many_webhooks", `There can be at most ${MAX_WEBHOOKS} webhooks for each club or competition.`);
          const [row] = await tx
            .insert(webhooks)
            .values({ clubId, competitionId, url, description: description || null, secret, createdBy: actor.id, createdAt: deps.now() })
            .returning();
          await audit(tx, actor.id, "create", "webhook", row!.id, auditable(row!));
          return row!;
        });
        return reply.code(201).send({ webhook: webhookDto(created), secret } satisfies WebhookWithSecret);
      },
    );

    app.patch(
      "/webhooks/:id",
      {
        schema: {
          tags: ["webhooks"],
          summary: "Change a webhook's address or description, or turn it off or on. Turning it on clears its failures.",
          params: IdParams,
          body: z.strictObject({ url: Url.optional(), description: Description.optional(), enabled: z.boolean().optional() }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const before = await load(request.params.id, actor);
        const { url, description, enabled } = request.body;
        const changes: Partial<WebhookRow> = {};
        if (url !== undefined) changes.url = checkWebhookUrl(url);
        if (description !== undefined) changes.description = description || null;
        if (enabled !== undefined) {
          changes.enabled = enabled;
          if (enabled && !before.enabled) changes.failures = 0;
        }
        if (Object.keys(changes).length === 0) return webhookDto(before);
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx.update(webhooks).set(changes).where(eq(webhooks.id, before.id)).returning();
          await audit(tx, actor.id, "update", "webhook", before.id, { before: auditable(before), after: auditable(row!) });
          return row!;
        });
        return webhookDto(updated);
      },
    );

    app.delete("/webhooks/:id", { schema: { tags: ["webhooks"], params: IdParams } }, async (request, reply) => {
      const actor = requireActor(request);
      const w = await load(request.params.id, actor);
      await db.transaction(async (tx) => {
        await tx.delete(webhooks).where(eq(webhooks.id, w.id));
        await audit(tx, actor.id, "delete", "webhook", w.id, auditable(w));
      });
      return reply.code(204).send();
    });

    app.post(
      "/webhooks/:id/secret",
      { schema: { tags: ["webhooks"], summary: "Replace a webhook's secret. The old one stops working straight away.", params: IdParams } },
      async (request) => {
        const actor = requireActor(request);
        const w = await load(request.params.id, actor);
        const secret = newSecret();
        const updated = await db.transaction(async (tx) => {
          const [row] = await tx.update(webhooks).set({ secret }).where(eq(webhooks.id, w.id)).returning();
          await audit(tx, actor.id, "new_secret", "webhook", w.id);
          return row!;
        });
        return { webhook: webhookDto(updated), secret } satisfies WebhookWithSecret;
      },
    );

    app.post(
      "/webhooks/:id/ping",
      { schema: { tags: ["webhooks"], summary: "Send a test delivery (event `ping`) with the next run, within half a minute.", params: IdParams } },
      async (request, reply) => {
        const actor = requireActor(request);
        const w = await load(request.params.id, actor);
        if (!w.enabled) throw badRequest("webhook_off", "Turn the webhook on first.");
        return reply.code(202).send(deliveryDto(await queuePing(db, w.id, deps.now())));
      },
    );

    app.get(
      "/webhooks/:id/deliveries",
      { schema: { tags: ["webhooks"], summary: "A webhook's last 50 deliveries, newest first. Kept for 30 days.", params: IdParams } },
      async (request) => {
        const actor = requireActor(request);
        const w = await load(request.params.id, actor);
        const rows = await db
          .select()
          .from(webhookDeliveries)
          .where(eq(webhookDeliveries.webhookId, w.id))
          .orderBy(desc(webhookDeliveries.seq))
          .limit(50);
        return { items: rows.map(deliveryDto) };
      },
    );
  };
