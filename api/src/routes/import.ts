import type { ImportResult } from "@fh/shared";
import { and, eq, or, sql } from "drizzle-orm";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireRole } from "../auth.js";
import type { DbOrTx } from "../db/client.js";
import { type NamedListTable, clubs, competitions, teams, venues } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { maybeDryRun } from "../lib/dry-run.js";
import { slugify } from "../lib/slug.js";
import { audit } from "../services/audit.js";

/**
 * Bulk import for admins: clubs with their teams, venues or competitions, from the rows of a
 * spreadsheet. Anything already there (by name in any capitals, or by the same slug) is left
 * as it is, and so are rows repeated within the import. A dry run previews it (lib/dry-run.ts).
 */

const MAX_ROWS = 2000;
const Cell = z.string().max(500);

const Body = z.strictObject({
  kind: z.enum(["clubs", "venues", "competitions"]),
  /** The spreadsheet's rows without its heading: [club, team?] for clubs, [name] for venues and competitions. */
  rows: z.array(z.array(Cell).max(10)).min(1).max(MAX_ROWS),
  dryRun: z.boolean().default(false),
});

/** Spaces tidied, as the API stores names. */
const tidy = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

function nameProblem(name: string, what: string, max: number): string | null {
  if (name.length < 2) return `The ${what} needs a name of at least 2 characters.`;
  if (name.length > max) return `The ${what}'s name is longer than ${max} characters.`;
  if (!slugify(name)) return `The ${what}'s name needs at least one letter or digit.`;
  return null;
}

export const importRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;

    async function importClubs(tx: DbOrTx, actorId: string, rows: string[][]): Promise<ImportResult> {
      const result: ImportResult = { added: [], existing: 0, errors: [] };
      // By lower-case name and by slug, so neither a new club nor a team clashes with one already there.
      const clubIds = new Map<string, string>();
      const teamKeys = new Set<string>();

      async function findClub(name: string) {
        const slug = slugify(name);
        const key = name.toLowerCase();
        const known = clubIds.get(key) ?? clubIds.get(`slug:${slug}`);
        if (known) return { id: known, added: false };
        const [row] = await tx
          .select({ id: clubs.id })
          .from(clubs)
          .where(or(sql`lower(${clubs.name}) = ${key}`, eq(clubs.slug, slug)));
        let id = row?.id;
        const added = !id;
        if (!id) {
          const [created] = await tx.insert(clubs).values({ name, slug }).returning({ id: clubs.id });
          id = created!.id;
          await audit(tx, actorId, "create", "club", id, { name, slug, imported: true });
          result.added.push(name);
        }
        clubIds.set(key, id);
        clubIds.set(`slug:${slug}`, id);
        return { id, added };
      }

      for (const [i, cells] of rows.entries()) {
        const clubName = tidy(cells[0]);
        const teamName = tidy(cells[1]);
        const problem = nameProblem(clubName, "club", 100) ?? (teamName ? nameProblem(teamName, "team", 100) : null);
        if (problem) {
          result.errors.push({ row: i, message: problem });
          continue;
        }
        const club = await findClub(clubName);
        if (!teamName) {
          if (!club.added) result.existing++;
          continue;
        }
        const slug = slugify(teamName);
        const key = `${club.id}:${slug}`;
        if (teamKeys.has(key)) {
          result.existing++;
          continue;
        }
        teamKeys.add(key);
        const [found] = await tx
          .select({ id: teams.id })
          .from(teams)
          .where(and(eq(teams.clubId, club.id), or(eq(teams.slug, slug), sql`lower(${teams.name}) = ${teamName.toLowerCase()}`)));
        if (found) {
          result.existing++;
          continue;
        }
        const [created] = await tx.insert(teams).values({ clubId: club.id, name: teamName, slug }).returning({ id: teams.id });
        await audit(tx, actorId, "create", "team", created!.id, { clubId: club.id, name: teamName, slug, imported: true });
        result.added.push(`${clubName} ${teamName}`);
      }
      return result;
    }

    async function importList(tx: DbOrTx, actorId: string, table: NamedListTable, entity: string, rows: string[][]): Promise<ImportResult> {
      const result: ImportResult = { added: [], existing: 0, errors: [] };
      const seen = new Set<string>();
      for (const [i, cells] of rows.entries()) {
        const name = tidy(cells[0]);
        const problem = nameProblem(name, entity, 120);
        if (problem) {
          result.errors.push({ row: i, message: problem });
          continue;
        }
        const key = name.toLowerCase();
        if (seen.has(key)) {
          result.existing++;
          continue;
        }
        seen.add(key);
        const [found] = await tx.select({ id: table.id }).from(table).where(sql`lower(${table.name}) = ${key}`);
        if (found) {
          result.existing++;
          continue;
        }
        const [created] = await tx.insert(table).values({ name }).returning({ id: table.id });
        await audit(tx, actorId, "create", entity, created!.id, { name, imported: true });
        result.added.push(name);
      }
      return result;
    }

    app.post(
      "/import",
      {
        schema: {
          tags: ["admin"],
          summary: "Add clubs and teams, venues or competitions from a spreadsheet's rows (admins). dryRun previews it.",
          body: Body,
        },
      },
      async (request) => {
        const actor = requireRole(request, "admin");
        const { kind, rows, dryRun } = request.body;
        return maybeDryRun(db, dryRun, (tx) =>
          kind === "clubs"
            ? importClubs(tx, actor.id, rows)
            : importList(tx, actor.id, kind === "venues" ? venues : competitions, kind === "venues" ? "venue" : "competition", rows),
        );
      },
    );
  };
