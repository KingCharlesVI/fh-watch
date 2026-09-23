import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Db } from "./client.js";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}

// `pnpm db:migrate`: apply pending migrations to DATABASE_URL.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { createDb } = await import("./client.js");
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set.");
  const { db, close } = createDb(url, { max: 1 });
  await runMigrations(db);
  await close();
  console.log("Migrations applied.");
}
