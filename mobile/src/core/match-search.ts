import type { LocalMatch } from "./store";

/**
 * Finding a match in the phone's list by its teams, club, competition or venue. A club
 * is found through its teams' names (e.g. "Oxford Hawks M1"). Every word typed has to be
 * in one of them, in any capitals, so "hawks cup" finds Hawks' cup matches.
 */
export function matchesSearch(m: Pick<LocalMatch, "document" | "server">, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const doc = m.document;
  const names = doc
    ? [doc.teams.home.name, doc.teams.away.name, doc.venue, doc.competition]
    : [m.server?.home.name, m.server?.away.name, m.server?.venue, m.server?.competition];
  const text = names.filter(Boolean).join("\n").toLowerCase();
  return words.every((w) => text.includes(w));
}
