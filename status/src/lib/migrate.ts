import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

/**
 * Applies the migrations in drizzle/ to the database in TURSO_DATABASE_URL, or to
 * the local file when that isn't set. Run it from your own machine:
 *
 *   pnpm --filter @fh/status db:migrate
 *
 * Vercel never runs it: a serverless function shouldn't be migrating anything.
 */
const url = process.env.TURSO_DATABASE_URL ?? "file:./status.db";
const db = drizzle(createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN }));
await migrate(db, { migrationsFolder: "./drizzle" });
console.log(`Migrated ${url}`);
