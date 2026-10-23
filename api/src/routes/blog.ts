import { type BlogPost, type BlogPostSummary, hasRole } from "@fh/shared";
import { and, desc, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { requireRole } from "../auth.js";
import { blogPosts } from "../db/schema.js";
import type { AppDeps } from "../deps.js";
import { badRequest, notFound } from "../lib/errors.js";
import { allowLanding } from "../lib/landing.js";
import { audit } from "../services/audit.js";

/**
 * The landing page's blog. An admin uploads each post as a Markdown file from the website,
 * with a few lines of front matter at the top:
 *
 *   ---
 *   title: Our first match on the watch
 *   date: 2026-10-23
 *   summary: One or two sentences for the list of posts and for search engines.
 *   author: The FH Match Centre team
 *   draft: true
 *   ---
 *
 * `title` and `date` are needed; `summary`, `author` and `draft` aren't. Uploading to a slug
 * that has a post replaces it. The landing page reads the published ones from here as it's
 * visited, so nothing is redeployed.
 */

/** Lower case, with hyphens: "first-match". */
const Slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lower case letters, numbers and hyphens, e.g. first-match.")
  .max(80);
const Params = z.object({ slug: Slug });

const LIMITS = { title: 200, summary: 500, author: 100, body: 200_000 };

type Row = typeof blogPosts.$inferSelect;
const summaryDto = (r: Row): BlogPostSummary => ({
  slug: r.slug,
  title: r.title,
  date: r.date,
  summary: r.summary,
  author: r.author,
  draft: r.draft,
  updatedAt: r.updatedAt.toISOString(),
});
const dto = (r: Row): BlogPost => ({ ...summaryDto(r), body: r.body });

/** Simple `key: value` lines between two `---` lines; quotes around a value are optional. */
function parseFrontMatter(source: string): { data: Record<string, string>; body: string } | null {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(source);
  if (!match) return null;
  const data: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
    if (pair) data[pair[1]!.toLowerCase()] = pair[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return { data, body: source.slice(match[0].length) };
}

/** The post a Markdown file describes, or a 400 saying what's wrong with it. */
function parsePost(markdown: string) {
  const parsed = parseFrontMatter(markdown);
  if (!parsed) {
    throw badRequest("no_front_matter", "Start the file with its front matter: a title and a date (YYYY-MM-DD) between two --- lines.");
  }
  const { data } = parsed;
  const body = parsed.body.trim();
  const date = data.date ?? "";
  if (!data.title) throw badRequest("no_title", "The front matter needs a title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw badRequest("bad_date", "The front matter needs a date, as YYYY-MM-DD.");
  }
  if (!body) throw badRequest("no_body", "There's nothing under the front matter.");
  for (const field of ["title", "summary", "author"] as const) {
    if ((data[field]?.length ?? 0) > LIMITS[field]) throw badRequest("too_long", `The ${field} can be at most ${LIMITS[field]} characters.`);
  }
  if (body.length > LIMITS.body) throw badRequest("too_long", "The post is too long.");
  return { title: data.title, date, summary: data.summary || null, author: data.author || null, draft: data.draft === "true", body };
}

export const blogRoutes =
  (deps: AppDeps): FastifyPluginAsyncZod =>
  async (app) => {
    const { db } = deps;
    const tags = ["blog"];

    /**
     * The landing page reads these from its own domain. What everyone sees is cached for a
     * minute; an admin's view, with the drafts, isn't.
     */
    function publicRead(request: FastifyRequest, reply: FastifyReply, drafts: boolean) {
      allowLanding(deps, request.headers.origin, reply);
      if (!drafts) reply.header("cache-control", "public, max-age=60");
    }

    app.get(
      "/blog/posts",
      {
        schema: {
          tags,
          summary: "The published posts, newest first, without their text. Admins can ask for the drafts too.",
          querystring: z.object({ drafts: z.stringbool().optional() }),
        },
      },
      async (request, reply) => {
        const drafts = !!request.query.drafts;
        if (drafts) requireRole(request, "admin");
        const rows = await db
          .select()
          .from(blogPosts)
          .where(drafts ? undefined : eq(blogPosts.draft, false))
          .orderBy(desc(blogPosts.date), desc(blogPosts.createdAt))
          .limit(500);
        publicRead(request, reply, drafts);
        return { items: rows.map(summaryDto) };
      },
    );

    app.get(
      "/blog/posts/:slug",
      { schema: { tags, summary: "One post, with its Markdown. A draft is only shown to admins.", params: Params } },
      async (request, reply) => {
        const admin = hasRole(request.actor, "admin");
        const [row] = await db
          .select()
          .from(blogPosts)
          .where(and(eq(blogPosts.slug, request.params.slug), admin ? undefined : eq(blogPosts.draft, false)));
        publicRead(request, reply, admin);
        if (!row) throw notFound("No such post.");
        return dto(row);
      },
    );

    app.put(
      "/blog/posts/:slug",
      {
        schema: {
          tags,
          summary: "Upload a post as a Markdown file with front matter (admins). Replaces the post at that slug, if there is one.",
          params: Params,
          body: z.strictObject({ markdown: z.string().max(LIMITS.body + 5_000) }),
        },
      },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        const { slug } = request.params;
        const post = parsePost(request.body.markdown);
        const now = deps.now();
        const { row, replaced } = await db.transaction(async (tx) => {
          const [before] = await tx.select().from(blogPosts).where(eq(blogPosts.slug, slug)).for("update");
          if (before) {
            const [updated] = await tx
              .update(blogPosts)
              .set({ ...post, updatedAt: now })
              .where(eq(blogPosts.id, before.id))
              .returning();
            await audit(tx, actor.id, "update", "blog_post", before.id, { before: summaryDto(before), after: summaryDto(updated!) });
            return { row: updated!, replaced: true };
          }
          const [created] = await tx
            .insert(blogPosts)
            .values({ slug, ...post, createdAt: now, updatedAt: now })
            .returning();
          await audit(tx, actor.id, "create", "blog_post", created!.id, summaryDto(created!));
          return { row: created!, replaced: false };
        });
        return reply.code(replaced ? 200 : 201).send(dto(row));
      },
    );

    app.delete(
      "/blog/posts/:slug",
      { schema: { tags, summary: "Delete a post (admins). Its address stops working.", params: Params } },
      async (request, reply) => {
        const actor = requireRole(request, "admin");
        await db.transaction(async (tx) => {
          const [row] = await tx.delete(blogPosts).where(eq(blogPosts.slug, request.params.slug)).returning();
          if (!row) throw notFound("No such post.");
          await audit(tx, actor.id, "delete", "blog_post", row.id, summaryDto(row));
        });
        return reply.code(204).send();
      },
    );
  };
