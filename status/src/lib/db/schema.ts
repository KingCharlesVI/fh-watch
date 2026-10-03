import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import type { ComponentId } from "../components";
import type { IncidentState, Level } from "../status";

/**
 * SQLite, through libSQL: a file in development, Turso in production. Small enough
 * that the whole page is three tables, and nothing here depends on the API or its
 * database — the point of a status page is to still be there when they aren't.
 */

const now = () => integer({ mode: "timestamp" }).notNull().default(sql`(unixepoch())`);

export const incidents = sqliteTable(
  "incidents",
  {
    /** A readable id from the title and date, e.g. "2026-10-04-uploads-timing-out". */
    id: text().primaryKey(),
    /** An incident happened; maintenance was planned. */
    kind: text().$type<"incident" | "maintenance">().notNull().default("incident"),
    title: text().notNull(),
    /** How bad it is for the components it affects. */
    level: text().$type<Level>().notNull(),
    state: text().$type<IncidentState>().notNull().default("investigating"),
    /** The component ids it affects. */
    components: text({ mode: "json" }).$type<ComponentId[]>().notNull(),
    startedAt: integer({ mode: "timestamp" }).notNull(),
    /** When it was fixed, or the maintenance finished. Null while it's still going. */
    resolvedAt: integer({ mode: "timestamp" }),
    /** When planned maintenance is expected to end. */
    endsAt: integer({ mode: "timestamp" }),
    createdAt: now(),
  },
  (t) => [index("incidents_started").on(t.startedAt)],
);

export const incidentUpdates = sqliteTable(
  "incident_updates",
  {
    id: integer().primaryKey({ autoIncrement: true }),
    incidentId: text()
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    state: text().$type<IncidentState>().notNull(),
    body: text().notNull(),
    at: integer({ mode: "timestamp" }).notNull(),
  },
  (t) => [index("incident_updates_incident").on(t.incidentId, t.at)],
);

/**
 * A component's state set by hand: for the ones nothing outside can check (the
 * database, email, the watch connection, the app stores), and to override a
 * check that's lying.
 */
export const componentNotes = sqliteTable("component_notes", {
  /** The component id from src/lib/components.ts. */
  id: text().primaryKey(),
  level: text().$type<Level>().notNull(),
  note: text(),
  at: now(),
});
