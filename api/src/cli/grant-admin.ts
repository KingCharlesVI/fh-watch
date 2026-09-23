import { existsSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { loadConfig } from "../config.js";
import { createDb } from "../db/client.js";
import { users } from "../db/schema.js";
import { audit } from "../services/audit.js";

/**
 * Makes a registered user an admin: the only way to create the first one.
 *
 *   node dist/cli/grant-admin.js someone@example.com [--verify]
 *
 * --verify also marks their email confirmed, for when email isn't set up yet.
 */

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith("--"))?.trim().toLowerCase();
const verify = args.includes("--verify");
if (!email) {
  console.error("Usage: grant-admin <email> [--verify]");
  process.exit(2);
}

if (existsSync(".env")) process.loadEnvFile(".env");
const { db, close } = createDb(loadConfig().databaseUrl, { max: 1 });
try {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    console.error(`No account for ${email}. Register on the website first, then run this again.`);
    process.exitCode = 1;
  } else {
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({
          roles: sql`(select array_agg(distinct r) from unnest(array_append(${users.roles}, 'admin')) as r)`,
          ...(verify && !user.emailVerifiedAt ? { emailVerifiedAt: new Date() } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      await audit(tx, null, "grant_admin", "user", user.id, { via: "cli", verify });
    });
    console.log(`${email} is now an admin${verify ? " (email marked as confirmed)" : ""}.`);
    if (!user.emailVerifiedAt && !verify) console.log("Their email isn't confirmed yet, so they can't sign in. Add --verify to confirm it now.");
  }
} finally {
  await close();
}
