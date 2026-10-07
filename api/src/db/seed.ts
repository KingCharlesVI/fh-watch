import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { MatchDocument, Role } from "@fh/shared";
import { eq } from "drizzle-orm";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { hashPassword, signAccessToken } from "../services/auth-tokens.js";
import { memoryMailer } from "../services/mailer.js";
import { fakePdfRenderer } from "../services/pdf.js";
import { memoryPushSender } from "../services/push.js";
import { createDb } from "./client.js";
import { clubs, teams, users, venues } from "./schema.js";

/**
 * `pnpm db:seed`: demo accounts, clubs and matches for development. Matches go
 * through the real API code. Refuses to run in production or twice.
 */

export const DEMO_PASSWORD = "demo-password-123";

if (existsSync(".env")) process.loadEnvFile(".env");
const config = loadConfig();
if (config.env === "production") throw new Error("Refusing to seed a production database.");

const { db, close } = createDb(config.databaseUrl, { max: 2 });
const app = await buildApp({
  config,
  db,
  mailer: memoryMailer(),
  push: memoryPushSender(),
  pdf: fakePdfRenderer(),
  now: () => new Date(),
  authRateLimit: { max: 1000, windowMs: 1000 },
});

try {
  const [existing] = await db.select().from(users).where(eq(users.email, "admin@example.com"));
  if (existing) {
    console.log("Already seeded (admin@example.com exists). Nothing to do.");
  } else {
    await seed();
  }
} finally {
  await app.close();
  await close();
}

async function seed() {
  const clubTeams: Record<string, Record<string, string>> = {};
  for (const [name, teamNames] of [
    ["Oxford Hawks", ["M1", "M2", "L1"]],
    ["Reading", ["M1", "L1"]],
    ["Bath Buccaneers", ["L1"]],
    ["Bristol University", ["L1"]],
  ] as const) {
    const [club] = await db
      .insert(clubs)
      .values({ name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") })
      .returning();
    clubTeams[name] = {};
    for (const t of teamNames) {
      const [team] = await db.insert(teams).values({ clubId: club!.id, name: t, slug: t.toLowerCase() }).returning();
      clubTeams[name]![t] = team!.id;
    }
  }
  const hawksId = (await db.select().from(clubs).where(eq(clubs.name, "Oxford Hawks")))[0]!.id;
  await db
    .insert(venues)
    .values([{ name: "Banbury Road, Oxford" }, { name: "Sonning Lane, Reading" }, { name: "Lambridge, Bath" }, { name: "Coombe Dingle, Bristol" }]);

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const makeUser = async (email: string, displayName: string, roles: Role[], clubId: string | null = null) => {
    const [u] = await db
      .insert(users)
      .values({ email, displayName, roles, clubId, passwordHash, emailVerifiedAt: new Date() })
      .returning();
    return { authorization: `Bearer ${await signAccessToken(config, u!.id, new Date())}` };
  };
  await makeUser("admin@example.com", "Alex Admin", ["admin", "umpire"]);
  const umpire = await makeUser("umpire@example.com", "Sam Taylor", ["umpire"]);
  await makeUser("clubadmin@example.com", "Jo Hawkins", ["club_admin"], hawksId);
  await makeUser("umpire2@example.com", "Priya Shah", ["umpire"]);

  const fixture = (name: string) =>
    JSON.parse(
      readFileSync(fileURLToPath(new URL(`../../../packages/shared/test/fixtures/${name}`, import.meta.url)), "utf8"),
    ) as MatchDocument;

  const upload = async (doc: MatchDocument, publish: boolean) => {
    const res = await app.inject({ method: "PUT", url: `/v1/matches/${doc.id}`, headers: umpire, payload: { source: "watch", document: doc } });
    if (res.statusCode >= 300) throw new Error(`Upload failed: ${res.body}`);
    if (publish) await app.inject({ method: "POST", url: `/v1/matches/${doc.id}/publish`, headers: umpire });
  };

  const league = fixture("league-match.json");
  league.teams.home.teamId = clubTeams["Oxford Hawks"]!.M1!;
  league.teams.away.teamId = clubTeams.Reading!.M1!;
  await upload(league, true);

  const shootout = fixture("shootout-match.json");
  shootout.teams.home.teamId = clubTeams["Bath Buccaneers"]!.L1!;
  shootout.teams.away.teamId = clubTeams["Bristol University"]!.L1!;
  await upload(shootout, true);

  // A match just finished: a draft waiting for its umpire to publish it, teams not yet linked.
  const recent = fixture("league-match.json");
  const start = Date.now() - 80 * 60 * 1000;
  recent.id = crypto.randomUUID();
  recent.teams.home = { name: "Hawks L1", teamId: null, color: "#1E40AF" };
  recent.teams.away = { name: "Reading Ladies", teamId: null, color: "#B91C1C" };
  recent.startedAt = new Date(start).toISOString().replace(/\.\d{3}Z$/, "Z");
  recent.endedAt = new Date(start + 72 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
  recent.venue = "Oxford Hawks, Pitch 2";
  recent.competition = "South League Division 1";
  await upload(recent, false);

  console.log(`Seeded. Sign in with admin@, umpire@, umpire2@ or clubadmin@example.com, password "${DEMO_PASSWORD}".`);
}
