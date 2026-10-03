import { existsSync } from "node:fs";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Applies the migrations in drizzle/ to the database in TURSO_DATABASE_URL, or to the
 * local file when that isn't set. Run it from your own machine, from this folder:
 *
 *   pnpm --filter @fh/status db:migrate
 *
 * It reads status/.env if there's one there (gitignored), so the Turso URL and token
 * don't have to be typed each time. Applying it twice does nothing: drizzle keeps a
 * record of what it has run. Vercel never runs it — a serverless function shouldn't
 * be migrating anything.
 */

if (existsSync(".env")) process.loadEnvFile(".env");

const url = process.env.TURSO_DATABASE_URL ?? "file:./status.db";
const db = drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));
await migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrated ${url}`);
