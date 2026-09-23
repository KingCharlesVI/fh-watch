import { type MatchAccess, type MatchDocument, summarizeMatch } from "@fh/shared";
import { and, asc, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type { DbOrTx } from "../db/client.js";
import { emailTokens, matchUmpires, matches, pushTokens, refreshTokens, teams } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { shareCode } from "../lib/crypto.js";
import { audit } from "./audit.js";
import type { PushMessage } from "./push.js";

export const AUTO_PUBLISH_DELAY_MS = 2 * 60 * 60 * 1000;
export const SOFT_DELETE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export type MatchRow = typeof matches.$inferSelect;
export type UmpireRow = typeof matchUmpires.$inferSelect;

/** Columns copied out of the document so matches can be listed and filtered without reading JSON. */
export function denormalize(doc: MatchDocument) {
  const s = summarizeMatch(doc);
  return {
    homeName: doc.teams.home.name,
    awayName: doc.teams.away.name,
    homeTeamId: doc.teams.home.teamId,
    awayTeamId: doc.teams.away.teamId,
    homeScore: s.score.home,
    awayScore: s.score.away,
    shootoutHome: s.shootout?.home ?? null,
    shootoutAway: s.shootout?.away ?? null,
    venue: doc.venue ?? null,
    competition: doc.competition ?? null,
    playedAt: new Date(doc.startedAt),
    endedAt: doc.endedAt ? new Date(doc.endedAt) : null,
  };
}

export async function umpiresFor(db: DbOrTx, matchIds: string[]): Promise<Map<string, UmpireRow[]>> {
  const map = new Map<string, UmpireRow[]>();
  if (matchIds.length === 0) return map;
  const rows = await db
    .select()
    .from(matchUmpires)
    .where(inArray(matchUmpires.matchId, matchIds))
    .orderBy(asc(matchUmpires.slot));
  for (const r of rows) map.set(r.matchId, [...(map.get(r.matchId) ?? []), r]);
  return map;
}

/** The facts the shared policy needs about one match. */
export async function accessFor(db: DbOrTx, match: MatchRow, umpires?: UmpireRow[]): Promise<MatchAccess> {
  const teamIds = [match.homeTeamId, match.awayTeamId].filter((t): t is string => t !== null);
  const clubRows = teamIds.length
    ? await db.selectDistinct({ clubId: teams.clubId }).from(teams).where(inArray(teams.id, teamIds))
    : [];
  const ump = umpires ?? (await umpiresFor(db, [match.id])).get(match.id) ?? [];
  return {
    status: match.status,
    umpireUserIds: ump.map((u) => u.userId).filter((u): u is string => u !== null),
    clubIds: clubRows.map((c) => c.clubId),
  };
}

export function matchDto(m: MatchRow, umpires: UmpireRow[], webUrl: string) {
  return {
    id: m.id,
    status: m.status,
    playedAt: m.playedAt.toISOString(),
    endedAt: m.endedAt?.toISOString() ?? null,
    home: { name: m.homeName, teamId: m.homeTeamId, score: m.homeScore, shootout: m.shootoutHome },
    away: { name: m.awayName, teamId: m.awayTeamId, score: m.awayScore, shootout: m.shootoutAway },
    venue: m.venue,
    competition: m.competition,
    umpires: umpires.map((u) => ({ slot: u.slot, userId: u.userId, name: u.name })),
    currentRevision: m.currentRevision,
    shareCode: m.shareCode,
    shareUrl: m.shareCode ? `${webUrl}/m/${m.shareCode}` : null,
    publishedAt: m.publishedAt?.toISOString() ?? null,
    autoPublishAt: m.autoPublishAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

async function freshShareCode(db: DbOrTx): Promise<string> {
  for (;;) {
    const code = shareCode();
    const [taken] = await db.select({ id: matches.id }).from(matches).where(eq(matches.shareCode, code));
    if (!taken) return code;
  }
}

/** Publishes a match, giving it a share code the first time. Keeps the code across unpublish/republish. */
export async function publishMatch(db: DbOrTx, match: MatchRow, now: Date): Promise<MatchRow> {
  const [row] = await db
    .update(matches)
    .set({
      status: "published",
      publishedAt: now,
      autoPublishAt: null,
      shareCode: match.shareCode ?? (await freshShareCode(db)),
      updatedAt: now,
    })
    .where(eq(matches.id, match.id))
    .returning();
  return row!;
}

/**
 * Publishes drafts whose 2-hour window has passed, then pushes a notification
 * to their registered umpires. `FOR UPDATE SKIP LOCKED` means two runs at once
 * never publish or notify for the same match twice.
 */
export async function autoPublishDue(
  deps: Pick<AppDeps, "db" | "push" | "now">,
  log: FastifyBaseLogger,
  options: { matchId?: string } = {},
): Promise<string[]> {
  const now = deps.now();
  const published = await deps.db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(matches)
      .where(
        and(
          eq(matches.status, "draft"),
          isNull(matches.deletedAt),
          lte(matches.autoPublishAt, now),
          options.matchId ? eq(matches.id, options.matchId) : undefined,
        ),
      )
      .limit(200)
      .for("update", { skipLocked: true });
    const rows: MatchRow[] = [];
    for (const m of due) {
      rows.push(await publishMatch(tx, m, now));
      await audit(tx, null, "auto_publish", "match", m.id);
    }
    return rows;
  });

  if (published.length > 0) {
    await notifyAutoPublished(deps, log, published).catch((err: unknown) =>
      log.error({ err }, "Failed to send auto-publish notifications"),
    );
  }
  return published.map((m) => m.id);
}

async function notifyAutoPublished(deps: Pick<AppDeps, "db" | "push">, log: FastifyBaseLogger, published: MatchRow[]) {
  const umpires = await umpiresFor(
    deps.db,
    published.map((m) => m.id),
  );
  const userIds = [...new Set([...umpires.values()].flat().flatMap((u) => (u.userId ? [u.userId] : [])))];
  if (userIds.length === 0) return;
  const tokens = await deps.db.select().from(pushTokens).where(inArray(pushTokens.userId, userIds));

  const messages: PushMessage[] = [];
  for (const m of published) {
    const needsLinking = m.homeTeamId === null || m.awayTeamId === null;
    const title = `${m.homeName} v ${m.awayName} published`;
    const body = needsLinking
      ? "Your match was published automatically. Link the teams so it shows on club pages."
      : "Your match was published automatically.";
    const recipients = new Set((umpires.get(m.id) ?? []).map((u) => u.userId));
    for (const t of tokens) {
      if (recipients.has(t.userId)) {
        messages.push({ to: t.token, title, body, data: { matchId: m.id, action: needsLinking ? "link_teams" : "view" } });
      }
    }
  }
  if (messages.length === 0) return;

  const { invalidTokens } = await deps.push.send(messages);
  if (invalidTokens.length > 0) {
    await deps.db.delete(pushTokens).where(inArray(pushTokens.token, invalidTokens));
    log.info({ count: invalidTokens.length }, "Removed invalid push tokens");
  }
}

/** Permanently removes matches soft-deleted over 30 days ago, and spent or expired tokens. */
export async function purgeExpired(deps: Pick<AppDeps, "db" | "now">): Promise<{ matches: number }> {
  const now = deps.now();
  const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);
  const purged = await deps.db
    .delete(matches)
    .where(and(isNotNull(matches.deletedAt), lt(matches.deletedAt, cutoff)))
    .returning({ id: matches.id });
  // Revoked refresh tokens stay until they expire, so reuse of a stolen one is still detected.
  await deps.db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now));
  await deps.db.delete(emailTokens).where(or(lt(emailTokens.expiresAt, now), isNotNull(emailTokens.usedAt)));
  return { matches: purged.length };
}
