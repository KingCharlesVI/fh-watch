import type { CardColor, MatchDocument, MatchEvent, TeamSide } from "./schema.js";

type PerTeam<T> = Record<TeamSide, T>;

export interface MatchSummary {
  /** Goals in normal play. A shootout never changes this. */
  score: PerTeam<number>;
  /** One entry per configured period, including periods with no goals. */
  periodScores: { period: number; home: number; away: number }[];
  shootout: { home: number; away: number; rounds: number } | null;
  result: {
    winner: TeamSide | null;
    decidedBy: "regulation" | "shootout" | null;
  };
  penaltyCorners: PerTeam<number>;
  penaltyStrokes: PerTeam<{ awarded: number; scored: number }>;
  cards: PerTeam<Record<CardColor, number>>;
  /** Events that still count, in match order. Voids and voided events are removed. */
  timeline: MatchEvent[];
}

/**
 * Events that still count: drops `void` events, the events they cancel, and
 * `card_end` events whose card was cancelled. Keeps log (seq) order.
 */
export function activeEvents(match: MatchDocument): MatchEvent[] {
  const voided = new Set<number>();
  for (const e of match.events) if (e.type === "void") voided.add(e.refSeq);
  return match.events.filter(
    (e) => e.type !== "void" && !voided.has(e.seq) && !(e.type === "card_end" && voided.has(e.refSeq)),
  );
}

/**
 * Sort events into match order: by period and clock, then the shootout (attempts
 * and cards) in the order it was recorded, then untimed notes. Ties keep log order.
 */
export function sortChronologically<T extends MatchEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => {
    const ka = sortKey(a);
    const kb = sortKey(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || a.seq - b.seq;
  });
}

function sortKey(e: MatchEvent): [number, number] {
  if (e.type === "shootout_attempt" || (e.type === "card" && e.shootout)) return [Number.MAX_SAFE_INTEGER - 1, 0];
  if ("period" in e && e.period !== undefined && "clockMs" in e && e.clockMs !== undefined) return [e.period, e.clockMs];
  if ("period" in e && e.period !== undefined) return [e.period, Number.MAX_SAFE_INTEGER];
  return [Number.MAX_SAFE_INTEGER, 0];
}

/**
 * Which team takes shoot-out number `taken + 1`, given who took the first. The teams
 * alternate, and the team that took first in a series of five defends first in the
 * next (FIH shoot-out competition, articles 21c and 22b).
 */
export function shootoutTaker(first: TeamSide, taken: number): TeamSide {
  const other: TeamSide = first === "home" ? "away" : "home";
  const starter = Math.floor(taken / 10) % 2 === 0 ? first : other;
  return taken % 2 === 0 ? starter : starter === "home" ? "away" : "home";
}

export function summarizeMatch(match: MatchDocument): MatchSummary {
  const active = activeEvents(match);

  const score = { home: 0, away: 0 };
  const periodScores = Array.from({ length: match.settings.periods }, (_, i) => ({ period: i + 1, home: 0, away: 0 }));
  const penaltyCorners = { home: 0, away: 0 };
  const penaltyStrokes = { home: { awarded: 0, scored: 0 }, away: { awarded: 0, scored: 0 } };
  const cards = { home: { green: 0, yellow: 0, red: 0 }, away: { green: 0, yellow: 0, red: 0 } };
  const shootoutGoals = { home: 0, away: 0 };
  let shootoutRounds = 0;

  for (const e of active) {
    switch (e.type) {
      case "goal": {
        score[e.team]++;
        const p = periodScores[e.period - 1];
        if (p) p[e.team]++;
        break;
      }
      case "penalty_corner":
        penaltyCorners[e.team]++;
        break;
      case "penalty_stroke":
        penaltyStrokes[e.team].awarded++;
        if (e.scored) penaltyStrokes[e.team].scored++;
        break;
      case "card":
        cards[e.team][e.color]++;
        break;
      case "shootout_attempt":
        if (e.scored) shootoutGoals[e.team]++;
        shootoutRounds = Math.max(shootoutRounds, e.round);
        break;
    }
  }

  const shootout = shootoutRounds > 0 ? { ...shootoutGoals, rounds: shootoutRounds } : null;

  let result: MatchSummary["result"];
  if (score.home !== score.away) {
    result = { winner: score.home > score.away ? "home" : "away", decidedBy: "regulation" };
  } else if (shootout && shootout.home !== shootout.away) {
    result = { winner: shootout.home > shootout.away ? "home" : "away", decidedBy: "shootout" };
  } else {
    result = { winner: null, decidedBy: null };
  }

  return {
    score,
    periodScores,
    shootout,
    result,
    penaltyCorners,
    penaltyStrokes,
    cards,
    timeline: sortChronologically(active),
  };
}

/**
 * When the final whistle blew: `endedAt` if set, otherwise the wall time of the
 * last recorded `period_end`. Null if neither is known.
 */
export function finalWhistle(match: MatchDocument): string | null {
  if (match.endedAt) return match.endedAt;
  const ends = activeEvents(match).filter((e) => e.type === "period_end" && e.wallTime !== undefined);
  return ends.at(-1)?.wallTime ?? null;
}

/** Format match-clock milliseconds as `m:ss`, e.g. 412000 → `6:52`. */
export function formatClock(clockMs: number): string {
  const totalSec = Math.floor(clockMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
}
