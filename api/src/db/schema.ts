import { ROLES, type MatchDocument } from "@fh/shared";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Column names are camelCase here and snake_case in Postgres (`casing: "snake_case"`).

const tstz = () => timestamp({ withTimezone: true, mode: "date" });
const createdAt = () => tstz().notNull().defaultNow();

export const clubs = pgTable("clubs", {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  slug: text().notNull().unique(),
  createdAt: createdAt(),
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
    index().on(t.playedAt.desc(), t.id.desc()),
    index().on(t.homeTeamId),
    index().on(t.awayTeamId),
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
