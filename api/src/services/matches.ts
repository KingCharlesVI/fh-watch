import { type Match, type MatchAccess, type MatchDocument, summarizeMatch } from "@fh/shared";
import { type SQL, and, asc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { emailTokens, matchRevisions, matchUmpires, matches, refreshTokens, teams } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { shareCode } from "../lib/crypto.js";
import { audit } from "./audit.js";

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

/**
 * Saves a new revision of each match `where` picks, with `change` made to its document: for
 * an admin merging duplicates in the directory. A new revision, not history rewritten, so
 * phones fetch it, and an edit made from an older copy is caught as a conflict. Deleted
 * matches are changed too. Call inside a transaction. Returns how many changed.
 */
export async function reviseMatches(
  tx: DbOrTx,
  actorId: string,
  where: SQL,
  change: (doc: MatchDocument) => MatchDocument,
  now: Date,
  reason: string,
): Promise<number> {
  const rows = await tx
    .select({ id: matches.id, currentRevision: matches.currentRevision, document: matchRevisions.document })
    .from(matches)
    .innerJoin(matchRevisions, and(eq(matchRevisions.matchId, matches.id), eq(matchRevisions.revision, matches.currentRevision)))
    .where(where)
    .for("update", { of: matches });
  let changed = 0;
  for (const row of rows) {
    const document = change(row.document);
    if (JSON.stringify(document) === JSON.stringify(row.document)) continue;
    const revision = row.currentRevision + 1;
    await tx
      .update(matches)
      .set({ ...denormalize(document), currentRevision: revision, updatedAt: now })
      .where(eq(matches.id, row.id));
    await tx.insert(matchRevisions).values({ matchId: row.id, revision, document, createdBy: actorId, source: "web", createdAt: now });
    await audit(tx, actorId, "update", "match", row.id, { revision, source: "web", reason });
    changed++;
  }
  return changed;
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

export function matchDto(m: MatchRow, umpires: UmpireRow[], webUrl: string): Match {
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
      shareCode: match.shareCode ?? (await freshShareCode(db)),
      updatedAt: now,
    })
    .where(eq(matches.id, match.id))
    .returning();
  return row!;
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
