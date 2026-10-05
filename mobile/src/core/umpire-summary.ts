import { type CardColor, type CardReason, type MatchDocument, activeEvents, summarizeMatch } from "@fh/shared";
import type { Fitness } from "./fitness";

/**
 * The umpire's own numbers, from the matches on this phone: how many, the cards they
 * gave and why, shootouts and results, the teams they see most, and how far they ran.
 */

export type Period = "season" | "lastSeason" | "all";

/** Seasons run from 1 September to 31 August, as English club hockey does. */
export function seasonStart(d: Date): Date {
  const year = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(year, 8, 1);
}

/** "2026–27" for the season a date falls in. */
export function seasonLabel(d: Date): string {
  const y = seasonStart(d).getFullYear();
  return `${y}–${String((y + 1) % 100).padStart(2, "0")}`;
}

/** Whether a match started in the period, counted from `today`. */
export function inPeriod(startedAt: string, period: Period, today: Date): boolean {
  if (period === "all") return true;
  const t = Date.parse(startedAt);
  const thisSeason = seasonStart(today);
  if (period === "season") return t >= thisSeason.getTime();
  const lastSeason = new Date(thisSeason.getFullYear() - 1, 8, 1);
  return t >= lastSeason.getTime() && t < thisSeason.getTime();
}

export interface UmpireSummary {
  matches: number;
  goals: number;
  cards: Record<CardColor, number>;
  /** Every card, by reason, most first; cards with no reason under null. */
  reasons: { reason: CardReason | null; count: number }[];
  /** Matches that went to a shootout. */
  shootouts: number;
  results: { home: number; draw: number; away: number };
  /** The teams in the most matches, most first (ties by name), up to five. */
  teams: { name: string; matches: number }[];
  /** From the watch's workouts, where it recorded one. */
  distanceM: number | null;
  workouts: number;
}

export function umpireSummary(matches: readonly { document: MatchDocument; fitness?: Pick<Fitness, "distanceM"> }[]): UmpireSummary {
  const cards = { green: 0, yellow: 0, red: 0 };
  const reasons = new Map<CardReason | null, number>();
  const teams = new Map<string, { name: string; matches: number }>();
  const results = { home: 0, draw: 0, away: 0 };
  let goals = 0;
  let shootouts = 0;
  let distanceM = 0;
  let workouts = 0;

  for (const { document: doc, fitness } of matches) {
    const s = summarizeMatch(doc);
    goals += s.score.home + s.score.away;
    for (const color of ["green", "yellow", "red"] as const) cards[color] += s.cards.home[color] + s.cards.away[color];
    for (const e of activeEvents(doc)) if (e.type === "card") reasons.set(e.reason ?? null, (reasons.get(e.reason ?? null) ?? 0) + 1);
    if (s.shootout) shootouts++;
    results[s.result.winner ?? "draw"]++;
    for (const side of ["home", "away"] as const) {
      const name = doc.teams[side].name.trim();
      const key = name.toLowerCase();
      teams.set(key, { name: teams.get(key)?.name ?? name, matches: (teams.get(key)?.matches ?? 0) + 1 });
    }
    if (fitness?.distanceM !== undefined) {
      distanceM += fitness.distanceM;
      workouts++;
    }
  }

  return {
    matches: matches.length,
    goals,
    cards,
    reasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
    shootouts,
    results,
    teams: [...teams.values()].sort((a, b) => b.matches - a.matches || a.name.localeCompare(b.name)).slice(0, 5),
    distanceM: workouts > 0 ? distanceM : null,
    workouts,
  };
}
