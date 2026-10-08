import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MatchDocument, Role } from "@fh/shared";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach } from "vitest";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { createDb } from "../src/db/client.js";
import { clubs, teams, users } from "../src/db/schema.js";
import type { AppDeps } from "../src/deps.js";
import { hashPassword, signAccessToken } from "../src/services/auth-tokens.js";
import { memoryMailer } from "../src/services/mailer.js";
import { fakePdfRenderer } from "../src/services/pdf.js";
import { memoryPushSender } from "../src/services/push.js";
import { testDatabaseUrl } from "./env.js";

export const PASSWORD = "correct horse battery";

/**
 * One app per test file, on the shared test database, with fake email, push
 * and a clock tests can move. Tables are emptied before each test.
 */
export async function setupTestApp(
  options: { authRateLimitMax?: number; apiRateLimitMax?: number; exportRateLimitMax?: number; env?: Record<string, string> } = {},
) {
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: testDatabaseUrl(),
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    WEB_URL: "https://hockey.test",
    PDF_CACHE_DIR: mkdtempSync(join(tmpdir(), "fh-pdf-test-")),
    ...options.env,
  });
  const { db, close } = createDb(config.databaseUrl, { max: 5 });
  const clock = { now: new Date("2026-09-19T12:00:00Z") };
  const mailer = memoryMailer();
  const push = memoryPushSender();
  const pdf = fakePdfRenderer();
  const deps: AppDeps = {
    config,
    db,
    mailer,
    push,
    pdf,
    now: () => clock.now,
    authRateLimit: { max: options.authRateLimitMax ?? 1000, windowMs: 15 * 60 * 1000 },
    apiRateLimit: { max: options.apiRateLimitMax ?? 100_000, windowMs: 60 * 1000 },
    exportRateLimit: { max: options.exportRateLimitMax ?? 100_000, windowMs: 60 * 1000 },
  };
  const app = await buildApp(deps);

  beforeEach(async () => {
    await db.execute(
      sql`truncate table audit_log, fixtures, club_umpires, competition_umpire_levels, push_tokens, email_tokens, refresh_tokens, match_revisions, match_umpires, matches, club_requests, access_requests, users, teams, clubs, venues, competitions restart identity cascade`,
    );
    mailer.sent.length = 0;
    push.sent.length = 0;
    push.invalid.clear();
    pdf.rendered.length = 0;
    clock.now = new Date("2026-09-19T12:00:00Z");
  });

  afterAll(async () => {
    await app.close();
    await close();
  });

  /** Moves the clock forward. */
  const advance = (ms: number) => {
    clock.now = new Date(clock.now.getTime() + ms);
  };

  async function createUser(opts: { email?: string; name?: string; roles?: Role[]; clubId?: string | null; verified?: boolean } = {}) {
    const email = opts.email ?? `${randomUUID().slice(0, 8)}@example.com`;
    const [user] = await db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword(PASSWORD),
        displayName: opts.name ?? email.split("@")[0]!,
        roles: opts.roles ?? ["umpire"],
        clubId: opts.clubId ?? null,
        emailVerifiedAt: opts.verified === false ? null : clock.now,
      })
      .returning();
    const token = await signAccessToken(config, user!.id, clock.now);
    return { user: user!, token, headers: { authorization: `Bearer ${token}` } };
  }

  async function createClub(name: string, teamNames: string[] = []) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const [club] = await db.insert(clubs).values({ name, slug }).returning();
    const clubTeams = [];
    for (const t of teamNames) {
      const [team] = await db
        .insert(teams)
        .values({ clubId: club!.id, name: t, slug: t.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
        .returning();
      clubTeams.push(team!);
    }
    return { club: club!, teams: clubTeams };
  }

  return { app, deps, db, mailer, push, pdf, clock, advance, createUser, createClub };
}

/** Pulls the token out of the link in the last email sent to `to`. */
export function tokenFromMail(sent: { to: string; text: string }[], to: string): string {
  const mail = sent.filter((m) => m.to === to).at(-1);
  const token = mail && /token=([A-Za-z0-9_-]+)/.exec(mail.text)?.[1];
  if (!token) throw new Error(`No token emailed to ${to}`);
  return token;
}

/** A valid two-half match: home 2–1 away, starting 90 minutes before `endedAt`. */
export function matchDoc(
  opts: { id?: string; endedAt?: string | null; homeTeamId?: string | null; awayTeamId?: string | null } = {},
): MatchDocument {
  const endedAt = opts.endedAt === undefined ? "2026-09-19T11:30:00Z" : opts.endedAt;
  return {
    schemaVersion: 1,
    id: opts.id ?? randomUUID(),
    createdOn: "wear",
    settings: {
      periods: 2,
      periodLengthSec: 2100,
      breakLengthsSec: [600],
      cardDurationsSec: { green: 120, yellowShort: 300, yellowLong: 600 },
      shootoutIfDrawn: false,
    },
    teams: {
      home: { name: "Oxford Hawks M1", teamId: opts.homeTeamId ?? null, color: "#1E40AF" },
      away: { name: "Reading M1", teamId: opts.awayTeamId ?? null, color: "#B91C1C" },
    },
    startedAt: new Date(Date.parse(endedAt ?? "2026-09-19T11:30:00Z") - 90 * 60 * 1000).toISOString().replace(".000Z", "Z"),
    endedAt,
    events: [
      { seq: 1, type: "period_start", period: 1, clockMs: 0 },
      { seq: 2, type: "goal", team: "home", player: 9, period: 1, clockMs: 600000 },
      { seq: 3, type: "period_end", period: 1, clockMs: 2100000 },
      { seq: 4, type: "period_start", period: 2, clockMs: 0 },
      { seq: 5, type: "goal", team: "away", player: 7, period: 2, clockMs: 300000 },
      { seq: 6, type: "goal", team: "home", player: 11, period: 2, clockMs: 900000 },
      { seq: 7, type: "period_end", period: 2, clockMs: 2100000 },
    ],
  };
}
