import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { marked } from "marked";

/**
 * The blog: one Markdown file per post in landing/blog/, read when the site is built.
 * The file name is the address (blog/first-match.md is /blog/first-match), and a few
 * lines of front matter at the top say the rest:
 *
 *   ---
 *   title: Our first match on the watch
 *   date: 2026-10-23
 *   summary: One or two sentences for the list of posts and for search engines.
 *   author: The FH Match Centre team
 *   draft: true
 *   ---
 *
 * `title` and `date` are needed; `summary`, `author` and `draft` aren't. A draft is left
 * out of the built site, so a post can be committed before it's finished.
 */

export interface PostMeta {
  slug: string;
  title: string;
  /** ISO date, e.g. 2026-10-23. */
  date: string;
  summary?: string;
  author?: string;
}

export interface Post extends PostMeta {
  /** The post's body, as HTML. */
  html: string;
}

/** Where the posts are, built from this folder or from the repository root. */
const CANDIDATES = [join(process.cwd(), "blog"), join(process.cwd(), "landing", "blog")];

/** Simple `key: value` lines between two `---` lines; quotes around a value are optional. */
function parseFrontMatter(source: string): { data: Record<string, string>; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(source);
  if (!match) return { data: {}, body: source };
  const data: Record<string, string> = {};
  for (const line of match[1]!.split(/\r?\n/)) {
    const pair = /^([A-Za-z]+):\s*(.*?)\s*$/.exec(line);
    if (pair) data[pair[1]!.toLowerCase()] = pair[2]!.replace(/^(["'])(.*)\1$/, "$2");
  }
  return { data, body: source.slice(match[0].length) };
}

function parsePost(slug: string, source: string): Post | null {
  const { data, body } = parseFrontMatter(source);
  if (data.draft === "true") return null;
  if (!data.title || !/^\d{4}-\d{2}-\d{2}$/.test(data.date ?? "")) {
    throw new Error(`blog/${slug}.md needs a title and a date (YYYY-MM-DD) in its front matter.`);
  }
  return {
    slug,
    title: data.title,
    date: data.date!,
    summary: data.summary || undefined,
    author: data.author || undefined,
    html: marked.parse(body, { async: false }),
  };
}

/** Every published post, newest first; an empty list when there's no blog folder. */
export function readPosts(): Post[] {
  for (const dir of CANDIDATES) {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md");
    } catch {
      continue; // Try the next place.
    }
    return files
      .map((f) => parsePost(f.slice(0, -3), readFileSync(join(dir, f), "utf8")))
      .filter((p): p is Post => p !== null)
      .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
  }
  return [];
}

export const readPost = (slug: string) => readPosts().find((p) => p.slug === slug);

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export const showPostDate = (iso: string) => DATE.format(new Date(`${iso}T00:00:00Z`));
