import { ROLES, type MatchDocument } from "@fh/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Column names are camelCase here and snake_case in Postgres (`casing: "snake_case"`).

const tstz = () => timestamp({ withTimezone: true, mode: "date" });
const createdAt = () => tstz().notNull().defaultNow();
const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const clubs = pgTable("clubs", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  /** When its logo was last set, or null for none; versions the logo's URL so it can be cached. */
  logoUpdatedAt: tstz(),
  createdAt: createdAt(),
});

/** A club's logo, kept apart from `clubs` so listing clubs doesn't read the images. */
export const clubLogos = pgTable("club_logos", {
  clubId: uuid()
    .primaryKey()
    .references(() => clubs.id, { onDelete: "cascade" }),
  contentType: text({ enum: LOGO_TYPES }).notNull(),
  data: bytea().notNull(),
});

export const teams = pgTable(
  "teams",
  {
    id: uuid().primaryKey().defaultRandom(),
    clubId: uuid()
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    name: text().notNull(),
    slug: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique().on(t.clubId, t.slug)],
);

/**
 * A list of names admins keep and umpires pick from: venues and competitions. A match keeps
 * the name as text, so changing a list never changes a match. Typed with a plain string
 * name so every such table has the same type, and the routes serve any of them.
 */
const namedList = (name: string) =>
  pgTable(name, {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull().unique(),
    createdAt: createdAt(),
  });
export type NamedListTable = ReturnType<typeof namedList>;

/** Where matches are played, e.g. "Banbury Road, Oxford": not tied to any club, as clubs share grounds. */
export const venues = namedList("venues");

/** What a match is played in, e.g. "South Men's Division 2" or "Hampshire Cup". */
export const competitions = namedList("competitions");

export const users = pgTable(
  "users",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Stored trimmed and lower-cased. */
    email: text().notNull().unique(),
    passwordHash: text().notNull(),
    displayName: text().notNull(),
    roles: text({ enum: ROLES })
      .array()
      .notNull()
      .default(sql`'{umpire}'::text[]`),
    /** The club this user administers; set exactly when roles include club_admin. */
    clubId: uuid().references(() => clubs.id),
    emailVerifiedAt: tstz(),
    deletionRequestedAt: tstz(),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    check("users_roles_valid", sql`${t.roles} <@ array['admin','umpire','club_admin']::text[]`),
    check("users_club_admin_club", sql`('club_admin' = any(${t.roles})) = (${t.clubId} is not null)`),
  ],
);

export const clubRequests = pgTable(
  "club_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The club to administer; for a new-club request, set to the created club on approval. */
    clubId: uuid().references(() => clubs.id, { onDelete: "cascade" }),
    /** Name of a club to add. Null for a request to administer an existing club. */
    clubName: text(),
    wantsAdmin: boolean().notNull(),
    status: text({ enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [check("club_requests_target", sql`${t.clubId} is not null or ${t.clubName} is not null`)],
);

/**
 * Someone asking to join a test, from the landing page's form. There's no account
 * behind it, so the email address is all we have to reply to and to recognise a
 * repeat request by.
 */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Which test: the Google Play one or the TestFlight one. */
    kind: text({ enum: ["google-play", "testflight"] }).notNull(),
    name: text().notNull(),
    email: text().notNull(),
    /** Their watch and phone, as they described them. */
    devices: text().notNull(),
    notes: text(),
    status: text({ enum: ["pending", "approved", "denied"] })
      .notNull()
      .default("pending"),
    /** What the umpire was told when it was approved or denied, if anything was added. */
    decisionNote: text(),
    reviewedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    reviewedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [
    index("access_requests_status").on(t.status, t.createdAt),
    // One pending request per address and test, so asking twice doesn't make two.
    uniqueIndex("access_requests_pending").on(t.email, t.kind).where(sql`${t.status} = 'pending'`),
  ],
);

export const matches = pgTable(
  "matches",
  {
    /** The UUIDv7 the watch created. */
    id: uuid().primaryKey(),
    // Denormalised from the current revision's document, for listing and filtering.
    homeTeamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    awayTeamId: uuid().references(() => teams.id, { onDelete: "set null" }),
    homeName: text().notNull(),
    awayName: text().notNull(),
    homeScore: integer().notNull(),
    awayScore: integer().notNull(),
    shootoutHome: integer(),
    shootoutAway: integer(),
    venue: text(),
    competition: text(),
    playedAt: tstz().notNull(),
    endedAt: tstz(),
    status: text({ enum: ["draft", "published"] })
      .notNull()
      .default("draft"),
    currentRevision: integer().notNull(),
    shareCode: text().unique(),
    publishedAt: tstz(),
    /** Soft delete; purged 30 days later. */
    deletedAt: tstz(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: createdAt(),
  },
  (t) => [
    index().on(t.playedAt.desc().nullsFirst(), t.id.desc().nullsFirst()),
    // The public results list, newest first.
    index("matches_published_played_at_id_index")
      .on(t.playedAt.desc().nullsFirst(), t.id.desc().nullsFirst())
      .where(sql`${t.status} = 'published' and ${t.deletedAt} is null`),
    index().on(t.homeTeamId),
    index().on(t.awayTeamId),
    // Competition, venue and text search filters match any part of a name (ILIKE '%…%'), which needs trigrams.
    index("matches_competition_trgm_index").using("gin", t.competition.op("gin_trgm_ops")),
    index("matches_venue_trgm_index").using("gin", t.venue.op("gin_trgm_ops")),
    index("matches_home_name_trgm_index").using("gin", t.homeName.op("gin_trgm_ops")),
    index("matches_away_name_trgm_index").using("gin", t.awayName.op("gin_trgm_ops")),
  ],
);

export const matchUmpires = pgTable(
  "match_umpires",
  {
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    slot: integer().notNull(),
    /** Null for an umpire who isn't registered, or whose account was deleted. */
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.slot] }), index().on(t.userId), check("match_umpires_slot", sql`${t.slot} in (1, 2)`)],
);

export const matchRevisions = pgTable(
  "match_revisions",
  {
    matchId: uuid()
      .notNull()
      .references(() => matches.id, { onDelete: "cascade" }),
    revision: integer().notNull(),
    document: jsonb().$type<MatchDocument>().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    source: text({ enum: ["watch", "mobile", "web"] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.revision] })],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Every token issued from one sign-in shares a family; reuse of a spent token revokes the family. */
    familyId: uuid().notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: tstz().notNull(),
    revokedAt: tstz(),
    /** Set when the token was spent on a refresh (rather than revoked by logout or reuse). */
    rotatedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId), index().on(t.familyId)],
);

export const emailTokens = pgTable(
  "email_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text({ enum: ["verify_email", "reset_password"] }).notNull(),
    tokenHash: text().notNull().unique(),
    expiresAt: tstz().notNull(),
    usedAt: tstz(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

export const pushTokens = pgTable(
  "push_tokens",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    platform: text({ enum: ["ios", "android"] }).notNull(),
    createdAt: createdAt(),
    lastUsedAt: createdAt(),
  },
  (t) => [index().on(t.userId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    actorId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text().notNull(),
    at: createdAt(),
    diff: jsonb(),
  },
  (t) => [index().on(t.entity, t.entityId)],
);
