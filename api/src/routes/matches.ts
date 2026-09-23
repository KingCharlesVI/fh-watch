import {
  type MatchDocument as MatchDoc,
  MatchDocument,
  canOnMatch,
  canUploadMatch,
  checkSemantics,
  finalWhistle,
  hasRole,
  matchEventsToCsv,
  matchListToCsv,
  summarizeMatch,
} from "@fh/shared";
import { type SQL, and, desc, eq, exists, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { type AuthUser, requireActor, requireRole } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { matchRevisions, matchUmpires, matches, teams, users } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { decodeCursor, page } from "../lib/cursor.js";
import { HttpError, badRequest, forbidden, notFound } from "../lib/errors.js";
import { parseIfMatch, revisionEtag } from "../lib/etag.js";
import { Limit, containsPattern } from "../lib/sql.js";
import { audit } from "../services/audit.js";
import {
  AUTO_PUBLISH_DELAY_MS,
  type MatchRow,
  type UmpireRow,
  accessFor,
  autoPublishDue,
  denormalize,
  matchDto,
  publishMatch,
  umpiresFor,
} from "../services/matches.js";

const IdParams = z.object({ id: z.uuid() });

const ListFilters = z.object({
  clubId: z.uuid().optional(),
  teamId: z.uuid().optional(),
  umpireId: z.uuid().optional(),
  from: z.iso.datetime({ offset: true }).optional().describe("Played at or after (inclusive)."),
  to: z.iso.datetime({ offset: true }).optional().describe("Played before (exclusive)."),
  competition: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["draft", "published"]).optional(),
});

const BULK_EXPORT_MAX = 5000;

/** Matches involving a club: its team is home or away. */
const involvesClub = (db: DbOrTx, clubId: string) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(teams)
      .where(and(eq(teams.clubId, clubId), or(eq(teams.id, matches.homeTeamId), eq(teams.id, matches.awayTeamId)))),
  );

const umpiredBy = (db: DbOrTx, userId: string) =>
  exists(
    db
      .select({ one: sql`1` })
      .from(matchUmpires)
      .where(and(eq(matchUmpires.matchId, matches.id), eq(matchUmpires.userId, userId))),
  );

/** Non-public matches the actor may still see: as an umpire on it, or as its club's admin. */
function ownMatches(db: DbOrTx, actor: AuthUser): SQL | undefined {
  const parts: SQL[] = [];
  if (hasRole(actor, "umpire")) parts.push(umpiredBy(db, actor.id));
  if (hasRole(actor, "club_admin") && actor.clubId) parts.push(involvesClub(db, actor.clubId));
  return parts.length ? or(...parts) : undefined;
}

/** SQL mirror of `canOnMatch(actor, "view", …)` for lists. */
function visibleTo(db: DbOrTx, actor: AuthUser | null): SQL | undefined {
  if (hasRole(actor, "admin")) return undefined;
  const published = eq(matches.status, "published");
  const own = actor ? ownMatches(db, actor) : undefined;
  return own ? or(published, own) : published;
}

function filterConditions(db: DbOrTx, f: z.infer<typeof ListFilters>): (SQL | undefined)[] {
  return [
    f.clubId ? involvesClub(db, f.clubId) : undefined,
    f.teamId ? or(eq(matches.homeTeamId, f.teamId), eq(matches.awayTeamId, f.teamId)) : undefined,
    f.umpireId ? umpiredBy(db, f.umpireId) : undefined,
    f.from ? gte(matches.playedAt, new Date(f.from)) : undefined,
    f.to ? lt(matches.playedAt, new Date(f.to)) : undefined,
    f.competition ? ilike(matches.competition, containsPattern(f.competition)) : undefined,
    f.status ? eq(matches.status, f.status) : undefined,
  ];
}

function attachment(reply: FastifyReply, filename: string, contentType: string) {
  return reply.header("content-type", contentType).header("content-disposition", `attachment; filename="${filename}"`);
}

/** UTF-8 byte-order mark, so Excel reads accented team names correctly. */
const BOM = "\uFEFF";

export const matchRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db, config } = deps;

    async function currentDocument(match: MatchRow): Promise<MatchDoc> {
      const [rev] = await db
        .select({ document: matchRevisions.document })
        .from(matchRevisions)
        .where(and(eq(matchRevisions.matchId, match.id), eq(matchRevisions.revision, match.currentRevision)));
      return rev!.document;
    }

    /**
     * Loads a live match the actor may act on. A match they can't even view is
     * a 404, so hidden drafts can't be discovered; one they can view but not
     * act on is a 403.
     */
    async function loadForAction(
      where: SQL,
      actor: AuthUser | null,
      action: "view" | "edit" | "publish" | "delete" | "view_history",
    ) {
      const [match] = await db
        .select()
        .from(matches)
        .where(and(where, isNull(matches.deletedAt)));
      if (!match) throw notFound("Match not found.");
      const umpires = (await umpiresFor(db, [match.id])).get(match.id) ?? [];
      const access = await accessFor(db, match, umpires);
      if (!canOnMatch(actor, "view", access)) throw notFound("Match not found.");
      if (!canOnMatch(actor, action, access)) throw forbidden();
      return { match, umpires };
    }

    async function dtoFor(id: string) {
      const [match] = await db.select().from(matches).where(eq(matches.id, id));
      const umpires = (await umpiresFor(db, [id])).get(id) ?? [];
      return matchDto(match!, umpires, config.webUrl);
    }

    async function fullMatch(match: MatchRow, umpires: UmpireRow[], reply: FastifyReply) {
      const document = await currentDocument(match);
      reply.header("etag", revisionEtag(match.currentRevision));
      return { match: matchDto(match, umpires, config.webUrl), document, summary: summarizeMatch(document) };
    }

    // ---- Upload and edit ----

    app.put(
      "/matches/:id",
      {
        schema: {
          tags: ["matches"],
          summary: "Create a match, or save a new revision of one.",
          description:
            "Idempotent: re-sending the current document changes nothing. Changing an existing match needs `If-Match: \"<revision>\"`; a stale revision gets 412.",
          params: IdParams,
          body: z.strictObject({ source: z.enum(["watch", "mobile", "web"]), document: MatchDocument }),
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        const { source, document } = request.body;
        const id = request.params.id;
        if (document.id !== id) throw badRequest("id_mismatch", "The document's id must match the URL.");

        const issues = checkSemantics(document);
        const errors = issues.filter((i) => i.severity === "error");
        const warnings = issues.filter((i) => i.severity === "warning");
        if (errors.length) throw new HttpError(422, "invalid_match", "The match document has errors.", { errors, warnings });

        const teamIds = [document.teams.home.teamId, document.teams.away.teamId].filter((t): t is string => t !== null);
        if (teamIds.length) {
          const found = await db.select({ id: teams.id }).from(teams).where(inArray(teams.id, teamIds));
          if (found.length !== new Set(teamIds).size) throw new HttpError(422, "unknown_team", "A linked team doesn't exist.");
        }

        const now = deps.now();
        const whistle = finalWhistle(document);
        const autoPublishFrom = whistle ? Date.parse(whistle) : now.getTime();
        const columns = denormalize(document);

        const outcome = await db.transaction(async (tx) => {
          const [existing] = await tx.select().from(matches).where(eq(matches.id, id)).for("update");

          if (!existing) {
            if (!canUploadMatch(actor)) throw forbidden();
            await tx.insert(matches).values({
              id,
              ...columns,
              currentRevision: 1,
              autoPublishAt: new Date(autoPublishFrom + AUTO_PUBLISH_DELAY_MS),
              createdBy: actor.id,
              createdAt: now,
              updatedAt: now,
            });
            await tx.insert(matchRevisions).values({ matchId: id, revision: 1, document, createdBy: actor.id, source, createdAt: now });
            await tx.insert(matchUmpires).values({ matchId: id, slot: 1, userId: actor.id, name: actor.displayName });
            await audit(tx, actor.id, "create", "match", id, { revision: 1, source });
            return { status: 201 as const, revision: 1 };
          }

          if (existing.deletedAt) throw new HttpError(410, "match_deleted", "This match was deleted.");
          const access = await accessFor(tx, existing);
          if (!canOnMatch(actor, "edit", access)) throw forbidden();

          const [current] = await tx
            .select({ same: sql<boolean>`${matchRevisions.document} = ${JSON.stringify(document)}::jsonb` })
            .from(matchRevisions)
            .where(and(eq(matchRevisions.matchId, id), eq(matchRevisions.revision, existing.currentRevision)));
          if (current?.same) return { status: 200 as const, revision: existing.currentRevision };

          const ifMatch = parseIfMatch(request.headers["if-match"]);
          if (ifMatch === null) {
            throw new HttpError(428, "precondition_required", 'Send If-Match: "<revision>" to change an existing match.', {
              currentRevision: existing.currentRevision,
            });
          }
          if (ifMatch !== existing.currentRevision) {
            throw new HttpError(412, "revision_conflict", "The match changed since you last loaded it.", {
              currentRevision: existing.currentRevision,
            });
          }

          const revision = existing.currentRevision + 1;
          await tx
            .update(matches)
            .set({
              ...columns,
              currentRevision: revision,
              // A pending timer follows a corrected final whistle; a cancelled one stays cancelled.
              autoPublishAt: existing.autoPublishAt ? new Date(autoPublishFrom + AUTO_PUBLISH_DELAY_MS) : null,
              updatedAt: now,
            })
            .where(eq(matches.id, id));
          await tx.insert(matchRevisions).values({ matchId: id, revision, document, createdBy: actor.id, source, createdAt: now });
          await audit(tx, actor.id, "update", "match", id, { revision, source });
          return { status: 200 as const, revision };
        });

        // Uploaded after the 2-hour window: publish on arrival.
        await autoPublishDue(deps, request.log, { matchId: id });

        const match = await dtoFor(id);
        return reply
          .code(outcome.status)
          .header("etag", revisionEtag(match.currentRevision))
          .send({ match, warnings });
      },
    );

    app.put(
      "/matches/:id/umpires/2",
      {
        schema: {
          tags: ["matches"],
          summary: "Set the second umpire: a registered umpire by id, or a name for someone not on the system.",
          params: IdParams,
          body: z.union([z.strictObject({ userId: z.uuid() }), z.strictObject({ name: z.string().trim().min(1).max(80) })]),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const { match, umpires } = await loadForAction(eq(matches.id, request.params.id), actor, "edit");
        let value: { userId: string | null; name: string };
        if ("userId" in request.body) {
          const [user] = await db.select().from(users).where(eq(users.id, request.body.userId));
          if (!user || !user.roles.includes("umpire")) throw badRequest("not_an_umpire", "That user isn't a registered umpire.");
          if (umpires.some((u) => u.slot === 1 && u.userId === user.id)) {
            throw badRequest("same_umpire", "Umpire 2 must be a different person from umpire 1.");
          }
          value = { userId: user.id, name: user.displayName };
        } else {
          value = { userId: null, name: request.body.name };
        }
        await db.transaction(async (tx) => {
          await tx
            .insert(matchUmpires)
            .values({ matchId: match.id, slot: 2, ...value })
            .onConflictDoUpdate({ target: [matchUmpires.matchId, matchUmpires.slot], set: value });
          await tx.update(matches).set({ updatedAt: deps.now() }).where(eq(matches.id, match.id));
          await audit(tx, actor.id, "set_umpire_2", "match", match.id, value);
        });
        return { match: await dtoFor(match.id) };
      },
    );

    app.delete("/matches/:id/umpires/2", { schema: { tags: ["matches"], params: IdParams } }, async (request) => {
      const actor = requireActor(request);
      const { match } = await loadForAction(eq(matches.id, request.params.id), actor, "edit");
      await db.transaction(async (tx) => {
        await tx.delete(matchUmpires).where(and(eq(matchUmpires.matchId, match.id), eq(matchUmpires.slot, 2)));
        await audit(tx, actor.id, "remove_umpire_2", "match", match.id);
      });
      return { match: await dtoFor(match.id) };
    });

    app.post("/matches/:id/publish", { schema: { tags: ["matches"], params: IdParams } }, async (request) => {
      const actor = requireActor(request);
      const { match } = await loadForAction(eq(matches.id, request.params.id), actor, "publish");
      if (match.status !== "published") {
        await db.transaction(async (tx) => {
          await publishMatch(tx, match, deps.now());
          await audit(tx, actor.id, "publish", "match", match.id);
        });
      }
      return { match: await dtoFor(match.id) };
    });

    app.post(
      "/matches/:id/unpublish",
      {
        schema: {
          tags: ["matches"],
          summary: "Hide a match again. Cancels its auto-publish timer; the share code is kept for republishing.",
          params: IdParams,
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const { match } = await loadForAction(eq(matches.id, request.params.id), actor, "publish");
        await db.transaction(async (tx) => {
          await tx
            .update(matches)
            .set({ status: "draft", publishedAt: null, autoPublishAt: null, updatedAt: deps.now() })
            .where(eq(matches.id, match.id));
          await audit(tx, actor.id, "unpublish", "match", match.id);
        });
        return { match: await dtoFor(match.id) };
      },
    );

    app.delete(
      "/matches/:id",
      { schema: { tags: ["matches"], summary: "Soft delete; purged after 30 days.", params: IdParams } },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const { match } = await loadForAction(eq(matches.id, request.params.id), actor, "delete");
        await db.transaction(async (tx) => {
          await tx.update(matches).set({ deletedAt: deps.now() }).where(eq(matches.id, match.id));
          await audit(tx, actor.id, "delete", "match", match.id);
        });
        return reply.code(204).send();
      },
    );

    // ---- Reading ----

    app.get(
      "/matches",
      {
        schema: {
          tags: ["matches"],
          summary: "Matches the caller can see, newest first. The public sees published matches only.",
          querystring: ListFilters.extend({
            cursor: z.string().optional(),
            limit: z.coerce.number().int().min(Limit.min).max(Limit.max).default(Limit.default),
          }),
        },
      },
      async (request) => {
        const { cursor, limit, ...filters } = request.query;
        const c = cursor ? decodeCursor(cursor) : null;
        const rows = await db
          .select()
          .from(matches)
          .where(
            and(
              isNull(matches.deletedAt),
              visibleTo(db, request.actor),
              ...filterConditions(db, filters),
              c ? sql`(${matches.playedAt}, ${matches.id}) < (${c.sortValue}::timestamptz, ${c.id}::uuid)` : undefined,
            ),
          )
          .orderBy(desc(matches.playedAt), desc(matches.id))
          .limit(limit + 1);
        const { items, nextCursor } = page(rows, limit, (m) => [m.playedAt, m.id]);
        const umpires = await umpiresFor(
          db,
          items.map((m) => m.id),
        );
        return { items: items.map((m) => matchDto(m, umpires.get(m.id) ?? [], config.webUrl)), nextCursor };
      },
    );

    app.get(
      "/matches/export.csv",
      {
        schema: {
          tags: ["matches"],
          summary: `Bulk CSV, one row per match (at most ${BULK_EXPORT_MAX}). Umpires get their matches, club admins their club's, admins all.`,
          querystring: ListFilters,
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        const scope = hasRole(actor, "admin") ? undefined : ownMatches(db, actor);
        if (!hasRole(actor, "admin") && !scope) throw forbidden();
        const rows = await db
          .select({ document: matchRevisions.document })
          .from(matches)
          .innerJoin(
            matchRevisions,
            and(eq(matchRevisions.matchId, matches.id), eq(matchRevisions.revision, matches.currentRevision)),
          )
          .where(and(isNull(matches.deletedAt), scope, ...filterConditions(db, request.query)))
          .orderBy(desc(matches.playedAt), desc(matches.id))
          .limit(BULK_EXPORT_MAX);
        attachment(reply, "matches.csv", "text/csv; charset=utf-8");
        return BOM + matchListToCsv(rows.map((r) => r.document));
      },
    );

    app.get("/matches/:id", { schema: { tags: ["matches"], params: IdParams } }, async (request, reply) => {
      const { match, umpires } = await loadForAction(eq(matches.id, request.params.id), request.actor, "view");
      return fullMatch(match, umpires, reply);
    });

    app.get(
      "/m/:shareCode",
      {
        schema: {
          tags: ["matches"],
          summary: "A match by its share code.",
          params: z.object({ shareCode: z.string().regex(/^[2-9A-HJ-NP-Z]{6}$/i) }),
        },
      },
      async (request, reply) => {
        const code = request.params.shareCode.toUpperCase();
        const { match, umpires } = await loadForAction(eq(matches.shareCode, code), request.actor, "view");
        return fullMatch(match, umpires, reply);
      },
    );

    app.get(
      "/matches/:id/export.:format",
      { schema: { tags: ["matches"], params: IdParams.extend({ format: z.enum(["json", "csv"]) }) } },
      async (request, reply) => {
        const { match } = await loadForAction(eq(matches.id, request.params.id), request.actor, "view");
        const document = await currentDocument(match);
        const name = `match-${match.shareCode ?? match.id}`;
        if (request.params.format === "csv") {
          attachment(reply, `${name}.csv`, "text/csv; charset=utf-8");
          return BOM + matchEventsToCsv(document);
        }
        attachment(reply, `${name}.json`, "application/json; charset=utf-8");
        return JSON.stringify({ document, summary: summarizeMatch(document) }, null, 2);
      },
    );

    app.get(
      "/matches/:id/revisions",
      { schema: { tags: ["matches"], summary: "Edit history, newest first.", params: IdParams } },
      async (request) => {
        const { match } = await loadForAction(eq(matches.id, request.params.id), request.actor, "view_history");
        const rows = await db
          .select({
            revision: matchRevisions.revision,
            source: matchRevisions.source,
            createdAt: matchRevisions.createdAt,
            createdById: matchRevisions.createdBy,
            createdByName: users.displayName,
          })
          .from(matchRevisions)
          .leftJoin(users, eq(users.id, matchRevisions.createdBy))
          .where(eq(matchRevisions.matchId, match.id))
          .orderBy(desc(matchRevisions.revision));
        return {
          items: rows.map((r) => ({
            revision: r.revision,
            source: r.source,
            createdAt: r.createdAt.toISOString(),
            createdBy: r.createdById ? { id: r.createdById, displayName: r.createdByName } : null,
          })),
        };
      },
    );

    app.get(
      "/matches/:id/revisions/:revision",
      { schema: { tags: ["matches"], params: IdParams.extend({ revision: z.coerce.number().int().min(1) }) } },
      async (request) => {
        const { match } = await loadForAction(eq(matches.id, request.params.id), request.actor, "view_history");
        const [rev] = await db
          .select()
          .from(matchRevisions)
          .where(and(eq(matchRevisions.matchId, match.id), eq(matchRevisions.revision, request.params.revision)));
        if (!rev) throw notFound("Revision not found.");
        return { revision: rev.revision, source: rev.source, createdAt: rev.createdAt.toISOString(), document: rev.document };
      },
    );
  };
