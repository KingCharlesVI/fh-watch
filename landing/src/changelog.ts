import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The repository's CHANGELOG.md, read when the site is built and parsed into releases.
 * git-cliff writes it (see cliff.toml), so the shape is known:
 *
 *   ## [1.0.0-beta.12] - 2026-10-03
 *   ### 🚀 Features
 *   - *(web)* [**breaking**] A front page, with the results on their own page
 *
 * Parsing it here rather than rendering the markdown keeps the page styled like the
 * rest of the site, and means no markdown library for one page.
 */

export interface Change {
  /** The part of the project it touched, e.g. "wear" or "api". */
  scope?: string;
  breaking: boolean;
  text: string;
}

export interface ChangeGroup {
  /** The git-cliff group, emoji and all, e.g. "🚀 Features". */
  title: string;
  changes: Change[];
}

export interface Release {
  version: string;
  /** ISO date, or undefined for the unreleased section. */
  date?: string;
  groups: ChangeGroup[];
}

/** Umpires care about these two; the rest follow in the order they appear. */
const FIRST = ["features", "bug fixes"];

const rank = (title: string) => {
  const i = FIRST.findIndex((f) => title.toLowerCase().includes(f));
  return i === -1 ? FIRST.length : i;
};

export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  let release: Release | undefined;
  let group: ChangeGroup | undefined;

  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (heading) {
      release = { version: heading[1]!, date: heading[2], groups: [] };
      group = undefined;
      releases.push(release);
      continue;
    }
    const groupHeading = /^###\s+(.+?)\s*$/.exec(line);
    if (groupHeading && release) {
      group = { title: groupHeading[1]!, changes: [] };
      release.groups.push(group);
      continue;
    }
    const item = /^[-*]\s+(.*)$/.exec(line);
    if (item && group) {
      let text = item[1]!;
      const scope = /^\*\(([^)]+)\)\*\s*/.exec(text);
      if (scope) text = text.slice(scope[0].length);
      const breaking = /^\[\*\*breaking\*\*\]\s*/.test(text);
      if (breaking) text = text.replace(/^\[\*\*breaking\*\*\]\s*/, "");
      group.changes.push({ scope: scope?.[1], breaking, text: text.trim() });
    }
  }

  for (const r of releases) {
    r.groups = r.groups.filter((g) => g.changes.length > 0).sort((a, b) => rank(a.title) - rank(b.title));
  }
  return releases.filter((r) => r.groups.length > 0);
}

/** Where CHANGELOG.md is, built from this folder or from the repository root. */
const CANDIDATES = [join(process.cwd(), "..", "CHANGELOG.md"), join(process.cwd(), "CHANGELOG.md")];

/** The parsed changelog, or an empty list when the file isn't there (so the build never fails for it). */
export function readChangelog(): Release[] {
  for (const path of CANDIDATES) {
    try {
      return parseChangelog(readFileSync(path, "utf8"));
    } catch {
      // Try the next place.
    }
  }
  return [];
}

/** A pre-release is one with a stage and a build, e.g. 1.0.0-beta.12. */
export const isPreRelease = (version: string) => /-[a-z]+\.\d+$/.test(version);
