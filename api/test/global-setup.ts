import { sql } from "drizzle-orm";
import { createDb } from "../src/db/client.js";
import { runMigrations } from "../src/db/migrate.js";
import { testDatabaseUrl } from "./env.js";

/** Rebuilds the test database from the migrations once per run. */
export default async function setup() {
  const { db, close } = createDb(testDatabaseUrl(), { max: 1 });
  try {
    await db.execute(sql`drop schema if exists drizzle cascade`);
    await db.execute(sql`drop schema if exists public cascade`);
    await db.execute(sql`create schema public`);
    await runMigrations(db);
  } finally {
    await close();
  }
}
