import { marked } from "marked";
import { SITE } from "@/content";

/**
 * The blog. Admins upload each post as a Markdown file on the website (Admin → Blog), and
 * the API keeps them (api/src/routes/blog.ts); these pages read them from it as they're
 * opened, so a post is out without redeploying this site. Only published posts are served
 * here: drafts stay in admin.
 */

export interface PostMeta {
  slug: string;
  title: string;
  /** ISO date, e.g. 2026-10-23. */
  date: string;
  summary: string | null;
  author: string | null;
}

export interface Post extends PostMeta {
  /** The post's body, in Markdown. */
  body: string;
}

const ENDPOINT = SITE.appUrl ? `${SITE.appUrl}/v1/blog/posts` : null;

/** Every published post, newest first. Throws if the API can't be reached. */
export async function fetchPosts(): Promise<PostMeta[]> {
  if (!ENDPOINT) return [];
  const res = await fetch(ENDPOINT);
  if (!res.ok) throw new Error(`The blog answered ${res.status}.`);
  return ((await res.json()) as { items: PostMeta[] }).items;
}

/** One post, or null when there's no such post. Throws if the API can't be reached. */
export async function fetchPost(slug: string): Promise<Post | null> {
  if (!ENDPOINT) return null;
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(slug)}`);
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`The blog answered ${res.status}.`);
  return (await res.json()) as Post;
}

/** Written by the site's admins, so the HTML is theirs to trust. */
export const postHtml = (post: Post) => marked.parse(post.body, { async: false });

/**
 * A post's address. On Vercel, /blog/<slug> is rewritten to the one page that shows any
 * post (vercel.json); `next dev` has no rewrites, so there it's asked for by name.
 */
export const postHref = (slug: string) =>
  process.env.NODE_ENV === "development" ? `/blog/post?slug=${encodeURIComponent(slug)}` : `/blog/${slug}`;

/** Which post the page at this address shows: /blog/<slug>, or /blog/post?slug=<slug>. */
export function slugFromLocation(location: Location): string | null {
  const asked = new URLSearchParams(location.search).get("slug");
  if (asked) return asked;
  const path = /^\/blog\/([^/]+)\/?$/.exec(location.pathname)?.[1];
  return path && path !== "post" ? decodeURIComponent(path) : null;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const showPostDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));
