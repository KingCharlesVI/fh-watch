import type { MatchDocument, MatchEvent } from "./schema.js";
import { CARD_REASONS, formatDuration } from "./describe.js";
import { formatClock, summarizeMatch } from "./summary.js";

/** A cell: numbers are written as-is, text is escaped and formula-guarded. */
export type CsvCell = string | number | null | undefined;

/**
 * Serialise rows as RFC 4180 CSV with CRLF line endings. Text that a
 * spreadsheet would run as a formula (starting with = + - @ tab or CR) gets a
 * leading apostrophe, because team names and notes come from users.
 */
export function toCsv(rows: readonly (readonly CsvCell[])[]): string {
  return rows.map((row) => row.map(formatCell).join(",")).join("\r\n") + "\r\n";
}

function formatCell(cell: CsvCell): string {
  if (cell === null || cell === undefined) return "";
  if (typeof cell === "number") return String(cell);
  const guarded = /^[=+\-@\t\r]/.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export const EVENT_CSV_HEADER = ["seq", "period", "clock", "team", "type", "player", "detail"] as const;

/** One row per event that still counts, in match order. */
export function matchEventsToCsv(match: MatchDocument): string {
  const { timeline } = summarizeMatch(match);
  const rows: CsvCell[][] = [[...EVENT_CSV_HEADER]];
  for (const e of timeline) {
    rows.push([
      e.seq,
      e.type === "shootout_attempt" ? "SO" : "period" in e ? e.period : null,
      "clockMs" in e && e.clockMs !== undefined ? formatClock(e.clockMs) : null,
      "team" in e ? match.teams[e.team].name : null,
      e.type,
      "player" in e ? e.player : null,
      eventDetail(e),
    ]);
  }
  return toCsv(rows);
}

const GOAL_METHODS = { field: "Field goal", pc: "Penalty corner", ps: "Penalty stroke" } as const;

function eventDetail(e: MatchEvent): string | null {
  switch (e.type) {
    case "goal":
      return e.method ? GOAL_METHODS[e.method] : null;
    case "card": {
      const color = e.color[0]!.toUpperCase() + e.color.slice(1);
      const card = e.durationSec === undefined ? color : `${color}, ${formatDuration(e.durationSec)}`;
      return e.reason ? `${card}, ${CARD_REASONS[e.reason].toLowerCase()}` : card;
    }
    case "card_end":
      return `Suspension ended (card ${e.refSeq})`;
    case "clock_stop":
      return e.reason ?? null;
    case "penalty_stroke":
      return e.scored ? "Scored" : "Missed";
    case "shootout_attempt":
      return `Round ${e.round}, ${e.scored ? "scored" : "missed"}`;
    case "note":
      return e.text;
    default:
      return null;
  }
}

export const MATCH_LIST_CSV_HEADER = [
  "match_id",
  "started_at",
  "competition",
  "venue",
  "home_team",
  "away_team",
  "home_score",
  "away_score",
  "shootout_home",
  "shootout_away",
  "winner",
  "home_penalty_corners",
  "away_penalty_corners",
  "home_green",
  "home_yellow",
  "home_red",
  "away_green",
  "away_yellow",
  "away_red",
] as const;

/** Bulk export: one row per match with the score and totals. */
export function matchListToCsv(matches: readonly MatchDocument[]): string {
  const rows: CsvCell[][] = [[...MATCH_LIST_CSV_HEADER]];
  for (const m of matches) {
    const s = summarizeMatch(m);
    rows.push([
      m.id,
      m.startedAt,
      m.competition,
      m.venue,
      m.teams.home.name,
      m.teams.away.name,
      s.score.home,
      s.score.away,
      s.shootout?.home,
      s.shootout?.away,
      s.result.winner ? m.teams[s.result.winner].name : null,
      s.penaltyCorners.home,
      s.penaltyCorners.away,
      s.cards.home.green,
      s.cards.home.yellow,
      s.cards.home.red,
      s.cards.away.green,
      s.cards.away.yellow,
      s.cards.away.red,
    ]);
  }
  return toCsv(rows);
}
