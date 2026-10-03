import { defineConfig } from "drizzle-kit";

// SQLite through libSQL: a local file in development, Turso in production.
export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  casing: "snake_case",
  dbCredentials: {
    url: process.env.TURSO_DATABASE_URL ?? "file:./status.db",
    authToken: process.env.TURSO_AUTH_TOKEN,
  },
});
