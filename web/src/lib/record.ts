import type { Match } from "./types";

export type Outcome = "W" | "D" | "L";

export interface TeamRecord {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  /** The most recent results first, at most five. */
  form: { outcome: Outcome; match: Match }[];
}

/**
 * A team's record from its matches (newest first, as the API lists them). A match level
 * at full time counts as a draw, whatever a shootout decided, as in league tables.
 */
export function teamRecord(teamId: string, matches: Match[]): TeamRecord {
  const record: TeamRecord = { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, form: [] };
  for (const m of matches) {
    const side = m.home.teamId === teamId ? "home" : m.away.teamId === teamId ? "away" : null;
    if (!side) continue;
    const us = m[side].score;
    const them = m[side === "home" ? "away" : "home"].score;
    const outcome: Outcome = us > them ? "W" : us < them ? "L" : "D";
    record.played++;
    record.goalsFor += us;
    record.goalsAgainst += them;
    if (outcome === "W") record.won++;
    else if (outcome === "D") record.drawn++;
    else record.lost++;
    if (record.form.length < 5) record.form.push({ outcome, match: m });
  }
  return record;
}
