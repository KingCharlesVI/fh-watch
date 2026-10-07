import { canEditTeams } from "@fh/shared";
import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireActor, requireRole } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { LOGO_TYPES, clubLogos, clubRequests, clubs, teams, users, venues } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, conflict, forbidden, isUniqueViolation, notFound } from "../lib/errors.js";
import { slugify } from "../lib/slug.js";
import { containsPattern } from "../lib/sql.js";
import { audit } from "../services/audit.js";
import { ClubRequestInput } from "./auth.js";

const Name = z.string().trim().min(2).max(100);
const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower-case letters, digits and single hyphens.")
  .max(60);
/** As long as a match document's venue can be. */
const VenueName = z.string().trim().min(2).max(120);
const ClubParams = z.object({ id: z.uuid() });
const TeamParams = z.object({ id: z.uuid(), teamId: z.uuid() });
const VenueParams = z.object({ id: z.uuid(), venueId: z.uuid() });

function slugFor(name: string, slug?: string) {
  const s = slug ?? slugify(name);
  if (!s) throw badRequest("invalid_slug", "Name needs at least one letter or digit.");
  return s;
}

/** Runs a write, turning a unique-constraint clash into a 409. */
async function unique<T>(slug: string, message: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(slug, message);
    throw err;
  }
}

type ClubRow = typeof clubs.$inferSelect;
type TeamRow = typeof teams.$inferSelect;
type VenueRow = typeof venues.$inferSelect;
const clubDto = (c: ClubRow) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  logoUrl: c.logoUpdatedAt ? `/v1/clubs/${c.id}/logo?v=${c.logoUpdatedAt.getTime()}` : null,
});
const teamDto = (t: TeamRow) => ({ id: t.id, clubId: t.clubId, name: t.name, slug: t.slug });
const venueDto = (v: VenueRow) => ({ id: v.id, clubId: v.clubId, name: v.name });

type RequestRow = typeof clubRequests.$inferSelect;
const requestDto = (r: RequestRow, user?: { displayName: string; email: string }) => ({
  id: r.id,
  userId: r.userId,
  ...(user ? { user } : {}),
  clubId: r.clubId,
  clubName: r.clubName,
  wantsAdmin: r.wantsAdmin,
  status: r.status,
  createdAt: r.createdAt.toISOString(),
  reviewedAt: r.reviewedAt?.toISOString() ?? null,
});

/** Logos fit in a server action's 1 MB body on the website, with room to spare. */
export const MAX_LOGO_BYTES = 512 * 1024;

/** The image type from its first bytes, so a logo is only ever served as what it really is. */
function sniffLogo(data: Buffer): (typeof LOGO_TYPES)[number] | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (data.toString("latin1", 0, 4) === "RIFF" && data.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

async function requireClub(db: DbOrTx, id: string) {
  const [club] = await db.select().from(clubs).where(eq(clubs.id, id));
  if (!club) throw notFound("Club not found.");
  return club;
}

export const clubRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    // Logos are uploaded as the raw image, not JSON.
    app.addContentTypeParser([...LOGO_TYPES], { parseAs: "buffer", bodyLimit: MAX_LOGO_BYTES }, (_request, body, done) =>
      done(null, body),
    );

    // ---- Clubs ----

    app.get(
      "/clubs",
      { schema: { tags: ["clubs"], querystring: z.object({ q: z.string().trim().max(100).optional() }) } },
      async (request) => {
        const { q } = request.query;
        const rows = await db
          .select()
          .from(clubs)
          .where(q ? ilike(clubs.name, containsPattern(q)) : undefined)
          .orderBy(asc(clubs.name))
          .limit(500);
        return { items: rows.map(clubDto) };
      },
    );

    app.get(
      "/clubs/:idOrSlug",
      { schema: { tags: ["clubs"], params: z.object({ idOrSlug: z.string().max(60) }) } },
      async (request) => {
        const key = request.params.idOrSlug;
        const isId = z.uuid().safeParse(key).success;
        const [club] = await db
          .select()
          .from(clubs)
          .where(isId ? eq(clubs.id, key) : eq(clubs.slug, key));
        if (!club) throw notFound("Club not found.");
        const [clubTeams, clubVenues] = await Promise.all([
          db.select().from(teams).where(eq(teams.clubId, club.id)).orderBy(asc(teams.name)),
          db.select().from(venues).where(eq(venues.clubId, club.id)).orderBy(asc(venues.name)),
        ]);
        return { ...clubDto(club), teams: clubTeams.map(teamDto), venues: clubVenues.map(venueDto) };
      },
    );

    app.post(
      "/clubs",
      { schema: { tags: ["clubs"], body: z.strictObject({ name: Name, slug: Slug.optional() }) } },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const { name } = request.body;
        const slug = slugFor(name, request.body.slug);
        const club = await unique("club_exists", "A club with that name or slug already exists.", () =>
          db.transaction(async (tx) => {
            const [row] = await tx.insert(clubs).values({ name, slug }).returning();
            await audit(tx, actor.id, "create", "club", row!.id, { name, slug });
            return row!;
          }),
        );
        return reply.code(201).send(clubDto(club));
      },
    );

    app.patch(
      "/clubs/:id",
      {
        schema: {
          tags: ["clubs"],
          params: ClubParams,
          body: z.strictObject({ name: Name.optional(), slug: Slug.optional() }),
        },
      },
      async (request) => {
        const actor = requireRole(request, "admin");
        const club = await requireClub(db, request.params.id);
        const updated = await unique("club_exists", "A club with that name or slug already exists.", () =>
          db.transaction(async (tx) => {
            const [row] = await tx.update(clubs).set(request.body).where(eq(clubs.id, club.id)).returning();
            await audit(tx, actor.id, "update", "club", club.id, { before: clubDto(club), after: request.body });
            return row!;
          }),
        );
        return clubDto(updated);
      },
    );

    app.delete(
      "/clubs/:id",
      {
        schema: {
          tags: ["clubs"],
          summary: "Delete a club and its teams. Its club admins lose that role; matches keep their team names.",
          params: ClubParams,
        },
      },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const club = await requireClub(db, request.params.id);
        await db.transaction(async (tx) => {
          await tx
            .update(users)
            .set({ roles: sql`array_remove(${users.roles}, 'club_admin')`, clubId: null, updatedAt: deps.now() })
            .where(eq(users.clubId, club.id));
          await tx.delete(clubs).where(eq(clubs.id, club.id));
          await audit(tx, actor.id, "delete", "club", club.id, clubDto(club));
        });
        return reply.code(204).send();
      },
    );

    app.get(
      "/clubs/:id/logo",
      { schema: { tags: ["clubs"], summary: "The club's logo image. Its URL changes when the logo does.", params: ClubParams } },
      async (request, reply) => {
        const [logo] = await db.select().from(clubLogos).where(eq(clubLogos.clubId, request.params.id));
        if (!logo) throw notFound("This club has no logo.");
        return reply
          .type(logo.contentType)
          .header("cache-control", "public, max-age=31536000, immutable")
          .header("content-security-policy", "default-src 'none'")
          .send(logo.data);
      },
    );

    app.put(
      "/clubs/:id/logo",
      {
        schema: {
          tags: ["clubs"],
          summary: `Set the club's logo: the PNG, JPEG or WebP image as the body, up to ${MAX_LOGO_BYTES / 1024} KB.`,
          params: ClubParams,
        },
      },
      async (request) => {
        const actor = requireRole(request, "admin");
        const club = await requireClub(db, request.params.id);
        const data = request.body;
        if (!Buffer.isBuffer(data) || data.length === 0) throw badRequest("invalid_logo", "Send the logo as a PNG, JPEG or WebP image.");
        const contentType = sniffLogo(data);
        if (!contentType) throw badRequest("invalid_logo", "The logo must be a PNG, JPEG or WebP image.");
        const updated = await db.transaction(async (tx) => {
          await tx
            .insert(clubLogos)
            .values({ clubId: club.id, contentType, data })
            .onConflictDoUpdate({ target: clubLogos.clubId, set: { contentType, data } });
          const [row] = await tx.update(clubs).set({ logoUpdatedAt: deps.now() }).where(eq(clubs.id, club.id)).returning();
          await audit(tx, actor.id, "set_logo", "club", club.id, { contentType, bytes: data.length });
          return row!;
        });
        return clubDto(updated);
      },
    );

    app.delete(
      "/clubs/:id/logo",
      { schema: { tags: ["clubs"], summary: "Remove the club's logo; its initials show instead.", params: ClubParams } },
      async (request) => {
        const actor = requireRole(request, "admin");
        const club = await requireClub(db, request.params.id);
        const updated = await db.transaction(async (tx) => {
          await tx.delete(clubLogos).where(eq(clubLogos.clubId, club.id));
          const [row] = await tx.update(clubs).set({ logoUpdatedAt: null }).where(eq(clubs.id, club.id)).returning();
          await audit(tx, actor.id, "remove_logo", "club", club.id);
          return row!;
        });
        return clubDto(updated);
      },
    );

    // ---- Teams ----

    app.get("/clubs/:id/teams", { schema: { tags: ["clubs"], params: ClubParams } }, async (request) => {
      const club = await requireClub(db, request.params.id);
      const rows = await db.select().from(teams).where(eq(teams.clubId, club.id)).orderBy(asc(teams.name));
      return { items: rows.map(teamDto) };
    });

    app.post(
      "/clubs/:id/teams",
      { schema: { tags: ["clubs"], params: ClubParams, body: z.strictObject({ name: Name, slug: Slug.optional() }) } },
      async (request, reply) => {
        const actor = requireActor(request);
        const club = await requireClub(db, request.params.id);
        if (!canEditTeams(actor, club.id)) throw forbidden();
        const { name } = request.body;
        const slug = slugFor(name, request.body.slug);
        const team = await unique("team_exists", "This club already has a team with that slug.", () =>
          db.transaction(async (tx) => {
            const [row] = await tx.insert(teams).values({ clubId: club.id, name, slug }).returning();
            await audit(tx, actor.id, "create", "team", row!.id, { clubId: club.id, name, slug });
            return row!;
          }),
        );
        return reply.code(201).send(teamDto(team));
      },
    );

    app.patch(
      "/clubs/:id/teams/:teamId",
      {
        schema: {
          tags: ["clubs"],
          params: TeamParams,
          body: z.strictObject({ name: Name.optional(), slug: Slug.optional() }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        if (!canEditTeams(actor, request.params.id)) throw forbidden();
        const [team] = await db
          .select()
          .from(teams)
          .where(and(eq(teams.id, request.params.teamId), eq(teams.clubId, request.params.id)));
        if (!team) throw notFound("Team not found.");
        const updated = await unique("team_exists", "This club already has a team with that slug.", () =>
          db.transaction(async (tx) => {
            const [row] = await tx.update(teams).set(request.body).where(eq(teams.id, team.id)).returning();
            await audit(tx, actor.id, "update", "team", team.id, { before: teamDto(team), after: request.body });
            return row!;
          }),
        );
        return teamDto(updated);
      },
    );

    app.delete(
      "/clubs/:id/teams/:teamId",
      {
        schema: {
          tags: ["clubs"],
          summary: "Delete a team. Its matches keep the team name but lose the link.",
          params: TeamParams,
        },
      },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const [team] = await db
          .select()
          .from(teams)
          .where(and(eq(teams.id, request.params.teamId), eq(teams.clubId, request.params.id)));
        if (!team) throw notFound("Team not found.");
        await db.transaction(async (tx) => {
          await tx.delete(teams).where(eq(teams.id, team.id));
          await audit(tx, actor.id, "delete", "team", team.id, teamDto(team));
        });
        return reply.code(204).send();
      },
    );

    app.get(
      "/teams",
      {
        schema: {
          tags: ["clubs"],
          summary: "Search teams by club and team name, e.g. 'hawks m1', for linking a match.",
          querystring: z.object({ q: z.string().trim().min(1).max(100) }),
        },
      },
      async (request) => {
        const words = request.query.q.split(/\s+/).slice(0, 5);
        const label = sql`${clubs.name} || ' ' || ${teams.name}`;
        const rows = await db
          .select({ team: teams, club: clubs })
          .from(teams)
          .innerJoin(clubs, eq(clubs.id, teams.clubId))
          .where(and(...words.map((w) => ilike(label, containsPattern(w)))))
          .orderBy(asc(clubs.name), asc(teams.name))
          .limit(50);
        return { items: rows.map((r) => ({ ...teamDto(r.team), club: clubDto(r.club) })) };
      },
    );

    // ---- Venues ----
    // Managed like teams: by admins, and by club admins for their own club.

    async function requireVenue(db: DbOrTx, clubId: string, venueId: string) {
      const [venue] = await db
        .select()
        .from(venues)
        .where(and(eq(venues.id, venueId), eq(venues.clubId, clubId)));
      if (!venue) throw notFound("Venue not found.");
      return venue;
    }

    app.get("/clubs/:id/venues", { schema: { tags: ["clubs"], params: ClubParams } }, async (request) => {
      const club = await requireClub(db, request.params.id);
      const rows = await db.select().from(venues).where(eq(venues.clubId, club.id)).orderBy(asc(venues.name));
      return { items: rows.map(venueDto) };
    });

    app.post(
      "/clubs/:id/venues",
      { schema: { tags: ["clubs"], params: ClubParams, body: z.strictObject({ name: VenueName }) } },
      async (request, reply) => {
        const actor = requireActor(request);
        const club = await requireClub(db, request.params.id);
        if (!canEditTeams(actor, club.id)) throw forbidden();
        const { name } = request.body;
        const venue = await unique("venue_exists", "This club already has a venue with that name.", () =>
          db.transaction(async (tx) => {
            const [row] = await tx.insert(venues).values({ clubId: club.id, name }).returning();
            await audit(tx, actor.id, "create", "venue", row!.id, { clubId: club.id, name });
            return row!;
          }),
        );
        return reply.code(201).send(venueDto(venue));
      },
    );

    app.patch(
      "/clubs/:id/venues/:venueId",
      { schema: { tags: ["clubs"], params: VenueParams, body: z.strictObject({ name: VenueName }) } },
      async (request) => {
        const actor = requireActor(request);
        if (!canEditTeams(actor, request.params.id)) throw forbidden();
        const venue = await requireVenue(db, request.params.id, request.params.venueId);
        const updated = await unique("venue_exists", "This club already has a venue with that name.", () =>
          db.transaction(async (tx) => {
            const [row] = await tx.update(venues).set(request.body).where(eq(venues.id, venue.id)).returning();
            await audit(tx, actor.id, "update", "venue", venue.id, { before: venueDto(venue), after: request.body });
            return row!;
          }),
        );
        return venueDto(updated);
      },
    );

    app.delete(
      "/clubs/:id/venues/:venueId",
      {
        schema: {
          tags: ["clubs"],
          summary: "Delete a venue. Matches played there keep its name.",
          params: VenueParams,
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        if (!canEditTeams(actor, request.params.id)) throw forbidden();
        const venue = await requireVenue(db, request.params.id, request.params.venueId);
        await db.transaction(async (tx) => {
          await tx.delete(venues).where(eq(venues.id, venue.id));
          await audit(tx, actor.id, "delete", "venue", venue.id, venueDto(venue));
        });
        return reply.code(204).send();
      },
    );

    app.get(
      "/venues",
      {
        schema: {
          tags: ["clubs"],
          summary: "Search venues by club and venue name, e.g. 'hawks pitch', for setting up a match.",
          querystring: z.object({ q: z.string().trim().min(1).max(100) }),
        },
      },
      async (request) => {
        const words = request.query.q.split(/\s+/).slice(0, 5);
        const label = sql`${clubs.name} || ' ' || ${venues.name}`;
        const rows = await db
          .select({ venue: venues, club: clubs })
          .from(venues)
          .innerJoin(clubs, eq(clubs.id, venues.clubId))
          .where(and(...words.map((w) => ilike(label, containsPattern(w)))))
          .orderBy(asc(clubs.name), asc(venues.name))
          .limit(50);
        return { items: rows.map((r) => ({ ...venueDto(r.venue), club: clubDto(r.club) })) };
      },
    );

    // ---- Club requests ----

    app.post(
      "/club-requests",
      {
        schema: {
          tags: ["clubs"],
          summary: "Ask to administer an existing club, or for a missing club to be added.",
          body: ClubRequestInput,
        },
      },
      async (request, reply) => {
        const actor = requireActor(request);
        const body = request.body;
        if ("clubId" in body) await requireClub(db, body.clubId);
        const row = await db.transaction(async (tx) => {
          const [r] = await tx
            .insert(clubRequests)
            .values(
              "clubId" in body
                ? { userId: actor.id, clubId: body.clubId, wantsAdmin: true }
                : { userId: actor.id, clubName: body.clubName, wantsAdmin: body.wantsAdmin },
            )
            .returning();
          await audit(tx, actor.id, "create", "club_request", r!.id, body);
          return r!;
        });
        return reply.code(201).send(requestDto(row));
      },
    );

    app.get(
      "/club-requests",
      {
        schema: {
          tags: ["clubs"],
          summary: "Admins see every request; everyone else sees their own.",
          querystring: z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() }),
        },
      },
      async (request) => {
        const actor = requireActor(request);
        const isAdmin = actor.roles.includes("admin");
        const rows = await db
          .select({ request: clubRequests, user: { displayName: users.displayName, email: users.email } })
          .from(clubRequests)
          .innerJoin(users, eq(users.id, clubRequests.userId))
          .where(
            and(
              isAdmin ? undefined : eq(clubRequests.userId, actor.id),
              request.query.status ? eq(clubRequests.status, request.query.status) : undefined,
            ),
          )
          .orderBy(desc(clubRequests.createdAt))
          .limit(500);
        return { items: rows.map((r) => requestDto(r.request, isAdmin ? r.user : undefined)) };
      },
    );

    async function pendingRequest(tx: DbOrTx, id: string) {
      const [row] = await tx.select().from(clubRequests).where(eq(clubRequests.id, id)).for("update");
      if (!row) throw notFound("Request not found.");
      if (row.status !== "pending") throw conflict("already_reviewed", `This request was already ${row.status}.`);
      return row;
    }

    app.post(
      "/club-requests/:id/approve",
      {
        schema: {
          tags: ["clubs"],
          summary: "Create the requested club and/or make the requester its club admin.",
          params: ClubParams,
        },
      },
      async (request) => {
        const actor = requireRole(request, "admin");
        const now = deps.now();
        const row = await unique("club_exists", "A club with that name already exists. Reject this request instead.", () =>
          db.transaction(async (tx) => {
            const req = await pendingRequest(tx, request.params.id);

            let clubId = req.clubId;
            if (!clubId) {
              const [club] = await tx
                .insert(clubs)
                .values({ name: req.clubName!, slug: slugFor(req.clubName!) })
                .returning();
              clubId = club!.id;
              await audit(tx, actor.id, "create", "club", clubId, { name: club!.name, fromRequest: req.id });
            }

            if (req.wantsAdmin) {
              const [user] = await tx.select().from(users).where(eq(users.id, req.userId));
              if (user!.clubId && user!.clubId !== clubId) {
                throw conflict("already_club_admin", "This user already administers another club.");
              }
              const roles = user!.roles.includes("club_admin") ? user!.roles : [...user!.roles, "club_admin" as const];
              await tx.update(users).set({ roles, clubId, updatedAt: now }).where(eq(users.id, user!.id));
            }

            const [updated] = await tx
              .update(clubRequests)
              .set({ status: "approved", clubId, reviewedBy: actor.id, reviewedAt: now })
              .where(eq(clubRequests.id, req.id))
              .returning();
            await audit(tx, actor.id, "approve", "club_request", req.id);
            return updated!;
          }),
        );
        return requestDto(row);
      },
    );

    app.post(
      "/club-requests/:id/reject",
      { schema: { tags: ["clubs"], params: ClubParams } },
      async (request) => {
        const actor = requireRole(request, "admin");
        const row = await db.transaction(async (tx) => {
          const req = await pendingRequest(tx, request.params.id);
          const [updated] = await tx
            .update(clubRequests)
            .set({ status: "rejected", reviewedBy: actor.id, reviewedAt: deps.now() })
            .where(eq(clubRequests.id, req.id))
            .returning();
          await audit(tx, actor.id, "reject", "club_request", req.id);
          return updated!;
        });
        return requestDto(row);
      },
    );
  };

