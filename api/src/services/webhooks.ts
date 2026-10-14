import { type Match, type Webhook, type WebhookDelivery, type WebhookEvent, type WebhookFormat, type WebhookPayload, summarizeMatch } from "@fh/shared";
import { createHmac, randomBytes } from "node:crypto";
import { type LookupAddress, type LookupAllOptions, type LookupOneOptions, lookup } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { and, asc, eq, inArray, lt, lte, ne, or, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { competitions, matchRevisions, matches, teams, webhookDeliveries, webhooks } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest } from "../lib/errors.js";
import { chatHostProblem, chatMessage } from "./chat-messages.js";
import { type MatchRow, matchDto, umpiresFor } from "./matches.js";

export type WebhookRow = typeof webhooks.$inferSelect;
type DeliveryRow = typeof webhookDeliveries.$inferSelect;

export interface WebhookRequest {
  url: string;
  body: string;
  headers: Record<string, string>;
}

export interface WebhookSender {
  /** Posts one delivery. Resolves with the receiver's status; rejects if it couldn't be reached. */
  send(request: WebhookRequest): Promise<{ status: number }>;
}

/** After a failed attempt, the wait before the next: 6 attempts over about 8 and a half hours. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
/** Deliveries in a row that fail for good before a webhook is turned off. */
export const MAX_FAILURES = 5;
/** Webhooks per club or competition. */
export const MAX_WEBHOOKS = 5;
const DELIVERY_RETENTION_MS = 30 * 24 * 3600_000;
const TIMEOUT_MS = 10_000;
/** How long a claimed delivery is left to its sender before another run may take it. */
const CLAIM_MS = 2 * 60_000;
const BATCH = 20;

export const newSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

// ---- Where a webhook may point ----

/** Addresses on this machine, its network or reserved for special use: never a receiver's. */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  // Not ::ffff:0:0/96 (IPv4 written as IPv6): BlockList would judge every IPv4 address by it. isPublicAddress unwraps those.
  ["::", 127],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

/** Whether an IP address is on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return !blocked.check(ip, "ipv4");
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as the IPv4 address.
    const dotted = /^(?:0{0,4}:){0,5}:?ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
    if (dotted) return isPublicAddress(dotted[1]!);
    const hex = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(ip);
    if (hex) {
      const [hi, lo] = [parseInt(hex[1]!, 16), parseInt(hex[2]!, 16)];
      return isPublicAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return !blocked.check(ip, "ipv6");
  }
  return false;
}

/** A receiver's address as given, or why it won't do for its format. Where it really leads is checked again on every delivery. */
export function checkWebhookUrl(value: string, format: WebhookFormat): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw badRequest("invalid_url", "That isn't a web address.");
  }
  if (url.protocol !== "https:") throw badRequest("invalid_url", "The address must start with https://.");
  if (url.username || url.password) throw badRequest("invalid_url", "The address can't have a user name or password in it.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) ? !isPublicAddress(host) : host === "localhost" || /\.(localhost|local|internal|lan|home)$/.test(host) || !host.includes(".")) {
    throw badRequest("invalid_url", "The address must be on the public internet.");
  }
  const problem = chatHostProblem(format, host);
  if (problem) throw badRequest("invalid_url", problem);
  return url.toString();
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup that refuses names leading anywhere private, so the connection is only made to an address checked here. */
function publicLookup(hostname: string, options: LookupOneOptions | LookupAllOptions, callback: LookupCallback) {
  lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    if (addresses.length === 0 || addresses.some((a) => !isPublicAddress(a.address))) {
      return callback(Object.assign(new Error(`${hostname} leads to a private address.`), { code: "EPRIVATE" }), []);
    }
    if ((options as LookupAllOptions).all) return callback(null, addresses);
    callback(null, addresses[0]!.address, addresses[0]!.family);
  });
}

/** Posts over HTTPS to public addresses only, without following redirects, giving up after 10 seconds. */
export function httpsWebhookSender(): WebhookSender {
  return {
    send: ({ url, body, headers }) =>
      new Promise((resolve, reject) => {
        const target = new URL(url);
        const host = target.hostname.replace(/^\[|\]$/g, "");
        if (target.protocol !== "https:") return reject(new Error("Only https addresses are allowed."));
        // Node doesn't look up an address that's already an IP, so check it here.
        if (isIP(host) && !isPublicAddress(host)) return reject(new Error(`${host} is a private address.`));
        const req = request(
          target,
          { method: "POST", headers: { ...headers, "content-length": String(Buffer.byteLength(body)) }, timeout: TIMEOUT_MS, lookup: publicLookup },
          (res) => {
            res.resume();
            res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
            res.on("error", reject);
          },
        );
        req.on("timeout", () => req.destroy(new Error("No answer within 10 seconds.")));
        req.on("error", reject);
        req.end(body);
      }),
  };
}

/** Signs a body as the `X-FH-Signature` header: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`. */
export function signature(secret: string, body: string, at: Date): string {
  const t = Math.floor(at.getTime() / 1000);
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${body}`).digest("hex")}`;
}

// ---- Queueing ----

export function webhookDto(w: WebhookRow): Webhook {
  return {
    id: w.id,
    clubId: w.clubId,
    competitionId: w.competitionId,
    url: w.url,
    format: w.format,
    description: w.description,
    enabled: w.enabled,
    failures: w.failures,
    createdAt: w.createdAt.toISOString(),
  };
}

export function deliveryDto(d: DeliveryRow): WebhookDelivery {
  return {
    id: d.id,
    event: d.event as WebhookEvent,
    matchId: d.matchId,
    status: d.status,
    attempts: d.attempts,
    responseStatus: d.responseStatus,
    error: d.error,
    nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    deliveredAt: d.deliveredAt?.toISOString() ?? null,
  };
}

type Hook = Pick<WebhookRow, "id" | "format">;

/** The body is made now, in the webhook's format, so it says what the match was when the change was made. */
async function insertDelivery(db: DbOrTx, hook: Hook, event: WebhookEvent, matchId: string | null, data: WebhookPayload["data"], match: Match | null, now: Date) {
  const id = crypto.randomUUID();
  const payload = hook.format === "json" ? ({ id, event, createdAt: now.toISOString(), data } satisfies WebhookPayload) : chatMessage(hook.format, event, match);
  const [row] = await db.insert(webhookDeliveries).values({ id, webhookId: hook.id, event, matchId, payload, nextAttemptAt: now, createdAt: now }).returning();
  return row!;
}

/** Queues a test delivery to one webhook. */
export const queuePing = (db: DbOrTx, hook: Hook, now: Date) => insertDelivery(db, hook, "ping", null, {}, null, now);

/**
 * Queues a delivery of a match event to every webhook turned on for one of its clubs or its
 * competition. Call in the transaction that made the change, after making it, so the match is
 * sent as it now is and nothing is sent if the change is rolled back.
 */
export async function queueMatchEvent(
  db: DbOrTx,
  webUrl: string,
  matchId: string,
  event: Exclude<WebhookEvent, "ping">,
  now: Date,
): Promise<number> {
  const [match] = await db.select().from(matches).where(eq(matches.id, matchId));
  if (!match) return 0;
  const hooks = await listeners(db, match);
  if (hooks.length === 0) return 0;

  const umpires = (await umpiresFor(db, [match.id])).get(match.id) ?? [];
  const dto = matchDto(match, umpires, webUrl);
  let data: WebhookPayload["data"];
  if (event === "match.published" || event === "match.updated") {
    const [rev] = await db
      .select({ document: matchRevisions.document })
      .from(matchRevisions)
      .where(and(eq(matchRevisions.matchId, match.id), eq(matchRevisions.revision, match.currentRevision)));
    data = { match: dto, summary: summarizeMatch(rev!.document) };
  } else {
    // No longer public, so the signed payload says only which match. A chat message still names it.
    data = { matchId: match.id };
  }
  for (const h of hooks) await insertDelivery(db, h, event, match.id, data, dto, now);
  return hooks.length;
}

/** Webhooks turned on for a club whose team played in the match, or for its competition. */
function listeners(db: DbOrTx, match: MatchRow) {
  const teamIds = [match.homeTeamId, match.awayTeamId].filter((t): t is string => t !== null);
  const byClub = teamIds.length
    ? inArray(webhooks.clubId, db.select({ id: teams.clubId }).from(teams).where(inArray(teams.id, teamIds)))
    : undefined;
  const byCompetition = match.competition
    ? inArray(webhooks.competitionId, db.select({ id: competitions.id }).from(competitions).where(sql`lower(${competitions.name}) = lower(${match.competition})`))
    : undefined;
  if (!byClub && !byCompetition) return Promise.resolve([]);
  return db
    .select({ id: webhooks.id, format: webhooks.format })
    .from(webhooks)
    .where(and(eq(webhooks.enabled, true), or(byClub, byCompetition)));
}

// ---- Delivering ----

/**
 * Sends the deliveries that are due, oldest first, a batch at a time. Each is claimed first, so
 * two runs never send the same one. A 2xx answer delivers it; anything else is tried again later,
 * up to 6 times, and a webhook whose deliveries fail for good 5 times in a row is turned off.
 */
export async function deliverDue(deps: Pick<AppDeps, "db" | "now" | "webhooks">): Promise<{ delivered: number; failed: number; retrying: number }> {
  const { db } = deps;
  const now = deps.now();
  const due = db
    .select({ id: webhookDeliveries.id })
    .from(webhookDeliveries)
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.seq))
    .limit(BATCH)
    .for("update", { skipLocked: true });
  const claimed = await db
    .update(webhookDeliveries)
    .set({ nextAttemptAt: new Date(now.getTime() + CLAIM_MS) })
    .where(inArray(webhookDeliveries.id, due))
    .returning();

  const outcome = { delivered: 0, failed: 0, retrying: 0 };
  for (const d of claimed.sort((a, b) => a.seq - b.seq)) {
    const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, d.webhookId));
    if (!hook || !hook.enabled) {
      await db
        .update(webhookDeliveries)
        .set({ status: "failed", nextAttemptAt: null, error: "The webhook is turned off." })
        .where(eq(webhookDeliveries.id, d.id));
      outcome.failed++;
      continue;
    }

    const body = JSON.stringify(d.payload);
    const sentAt = deps.now();
    let status: number | null = null;
    let error: string | null = null;
    try {
      ({ status } = await deps.webhooks.send({
        url: hook.url,
        body,
        headers: {
          "content-type": "application/json",
          "user-agent": "FH-Match-Centre-Webhooks/1.0",
          "x-fh-event": d.event,
          "x-fh-delivery": d.id,
          "x-fh-signature": signature(hook.secret, body, sentAt),
        },
      }));
      if (status < 200 || status > 299) error = `The receiver answered ${status}.`;
    } catch (err) {
      error = (err instanceof Error ? err.message : String(err)).slice(0, 300) || "Couldn't reach the receiver.";
    }

    const attempts = d.attempts + 1;
    if (!error) {
      await db.transaction(async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({ status: "delivered", attempts, responseStatus: status, error: null, nextAttemptAt: null, deliveredAt: sentAt })
          .where(eq(webhookDeliveries.id, d.id));
        await tx.update(webhooks).set({ failures: 0 }).where(and(eq(webhooks.id, hook.id), ne(webhooks.failures, 0)));
      });
      outcome.delivered++;
    } else if (attempts <= RETRY_DELAYS_MS.length) {
      const next = new Date(sentAt.getTime() + RETRY_DELAYS_MS[attempts - 1]!);
      await db.update(webhookDeliveries).set({ attempts, responseStatus: status, error, nextAttemptAt: next }).where(eq(webhookDeliveries.id, d.id));
      outcome.retrying++;
    } else {
      await db.transaction(async (tx) => {
        await tx
          .update(webhookDeliveries)
          .set({ status: "failed", attempts, responseStatus: status, error, nextAttemptAt: null })
          .where(eq(webhookDeliveries.id, d.id));
        await tx
          .update(webhooks)
          .set({ failures: sql`${webhooks.failures} + 1`, enabled: sql`${webhooks.failures} + 1 < ${MAX_FAILURES}` })
          .where(eq(webhooks.id, hook.id));
      });
      outcome.failed++;
    }
  }
  return outcome;
}

/** Deletes deliveries over 30 days old that are done with. */
export async function purgeOldDeliveries(deps: Pick<AppDeps, "db" | "now">): Promise<{ deliveries: number }> {
  const cutoff = new Date(deps.now().getTime() - DELIVERY_RETENTION_MS);
  const purged = await deps.db
    .delete(webhookDeliveries)
    .where(and(lt(webhookDeliveries.createdAt, cutoff), ne(webhookDeliveries.status, "pending")))
    .returning({ id: webhookDeliveries.id });
  return { deliveries: purged.length };
}

/** Fake for tests: records what was sent, and answers with `respond` (200 unless changed). */
export function memoryWebhookSender() {
  const sent: WebhookRequest[] = [];
  const sender = {
    sent,
    respond: (_req: WebhookRequest): number | Error => 200,
    async send(req: WebhookRequest) {
      sent.push(req);
      const answer = sender.respond(req);
      if (answer instanceof Error) throw answer;
      return { status: answer };
    },
  };
  return sender;
}
