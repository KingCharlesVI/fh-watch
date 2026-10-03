import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

/**
 * The SQLite connection. In development that's a file beside the app; in production
 * it's Turso over HTTPS (hosted libSQL), because Vercel's filesystem doesn't last.
 *
 *   TURSO_DATABASE_URL=libsql://something.turso.io
 *   TURSO_AUTH_TOKEN=...
 *
 * Unset, it falls back to ./status.db, which is right for `pnpm dev` and harmless
 * on Vercel: the page then shows live checks and says there's no history, rather
 * than failing. Everything that reads it goes through `read()` below.
 */

const url = process.env.TURSO_DATABASE_URL ?? "file:./status.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

/** Whether a real database is configured, as opposed to the development file. */
export const hasDatabase = Boolean(process.env.TURSO_DATABASE_URL) || url.startsWith("file:");

// casing: the same snake_case mapping drizzle-kit used to write the migrations.
export const db = drizzle(createClient({ url, authToken }), { schema, casing: "snake_case" });

/**
 * Runs a query, and on any failure returns the fallback and says so. A status page
 * that 500s because its own database is down is worse than one with a gap in it.
 */
export async function read<T>(query: () => Promise<T>, fallback: T): Promise<{ data: T; ok: boolean }> {
  try {
    return { data: await query(), ok: true };
  } catch (err) {
    console.error("status: database read failed", err);
    return { data: fallback, ok: false };
  }
}
