/**
 * What's new, from the repository's CHANGELOG.md (git-cliff writes it at each release, and
 * app.config.ts bakes the latest entries into the app). Only what an umpire would notice is
 * kept: new features, fixes and speed-ups, not docs, refactors or release chores.
 */

export interface ChangeItem {
  /** Which app it's about, from the commit's scope; null for all of them. */
  area: "Phone" | "Watch" | "Website" | "Server" | null;
  text: string;
}

export interface ChangeSection {
  title: "New" | "Fixed" | "Faster";
  items: ChangeItem[];
}

export interface ChangelogEntry {
  /** As in the heading, e.g. "1.2.0-beta.21". */
  version: string;
  date: string | null;
  sections: ChangeSection[];
}

/** git-cliff's groups (without their emoji) that umpires see, and what to call them. */
const GROUPS: Record<string, ChangeSection["title"]> = {
  features: "New",
  "bug fixes": "Fixed",
  performance: "Faster",
};

const AREAS: Record<string, ChangeItem["area"]> = {
  mobile: "Phone",
  phone: "Phone",
  watch: "Watch",
  wear: "Watch",
  watchos: "Watch",
  web: "Website",
  api: "Server",
};

/** Scopes that are nothing an umpire would notice, so their items are left out. */
const HIDDEN_SCOPES = new Set(["deploy", "docs", "release", "ci", "landing", "status", "docs-site"]);

/** The entries, newest first as the file has them. Entries with nothing to show are left out. */
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let entry: ChangelogEntry | null = null;
  let section: ChangeSection | null = null;

  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    const heading = /^## \[([^\]]+)\](?: - (\d{4}-\d{2}-\d{2}))?/.exec(line);
    if (heading) {
      entry = { version: heading[1]!, date: heading[2] ?? null, sections: [] };
      entries.push(entry);
      section = null;
      continue;
    }
    const group = /^### (.+)$/.exec(line);
    if (group && entry) {
      // "🚀 Features" → "features"
      const title = GROUPS[group[1]!.replace(/^[^\p{L}]+/u, "").toLowerCase()];
      section = title ? (entry.sections.find((s) => s.title === title) ?? { title, items: [] }) : null;
      if (section && !entry.sections.includes(section)) entry.sections.push(section);
      continue;
    }
    const item = /^- (?:\*\(([^)]+)\)\* )?(.+)$/.exec(line);
    if (item && section) {
      const scope = item[1]?.toLowerCase() ?? null;
      if (scope && HIDDEN_SCOPES.has(scope)) continue;
      const text = item[2]!.replace(/^\[\*\*breaking\*\*\] /, "");
      section.items.push({ area: scope ? (AREAS[scope] ?? null) : null, text: text.charAt(0).toUpperCase() + text.slice(1) });
    }
  }

  return entries
    .map((e) => ({ ...e, sections: e.sections.filter((s) => s.items.length > 0) }))
    .filter((e) => e.sections.length > 0 && e.version !== "unreleased");
}

/**
 * What to show after an update: the entries newer than the one last shown. Nothing on a
 * fresh install (none shown yet), or when the newest is the one already seen. When the last
 * one shown isn't in the list any more, just the newest.
 */
export function newSince(entries: ChangelogEntry[], lastShown: string | null): ChangelogEntry[] {
  if (lastShown === null || entries.length === 0) return [];
  const seen = entries.findIndex((e) => e.version === lastShown);
  return seen === -1 ? entries.slice(0, 1) : entries.slice(0, seen);
}
