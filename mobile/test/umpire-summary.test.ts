import type { MatchDocument } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { inPeriod, seasonLabel, seasonStart, umpireSummary } from "../src/core/umpire-summary";
import { matchDoc } from "./helpers";

const withEvents = (doc: MatchDocument, events: MatchDocument["events"]): MatchDocument => ({ ...doc, events: [...doc.events, ...events] });

describe("the umpire's summary", () => {
  it("counts matches, goals, cards by colour and reason, and results", () => {
    // Hawks win 2–1.
    const won = withEvents(matchDoc(), [
      { seq: 8, type: "card", team: "away", player: 4, color: "green", durationSec: 120, reason: "dissent", period: 2, clockMs: 1_000_000 },
      { seq: 9, type: "card", team: "home", player: 5, color: "yellow", durationSec: 300, reason: "dissent", period: 2, clockMs: 1_100_000 },
      { seq: 10, type: "card", team: "home", player: 6, color: "red", period: 2, clockMs: 1_200_000 },
      // Cancelled: doesn't count.
      { seq: 11, type: "card", team: "home", player: 7, color: "red", reason: "physical", period: 2, clockMs: 1_300_000 },
      { seq: 12, type: "void", refSeq: 11 },
    ]);
    // A 1–1 draw against someone else.
    const drawn = matchDoc();
    drawn.teams.away.name = "Bath Buccaneers M1";
    drawn.events = drawn.events.filter((e) => e.seq !== 6);

    const s = umpireSummary([{ document: won, fitness: { distanceM: 7400 } }, { document: drawn }]);
    expect(s).toMatchObject({ matches: 2, goals: 5, cards: { green: 1, yellow: 1, red: 1 }, shootouts: 0, distanceM: 7400, workouts: 1 });
    expect(s.results).toEqual({ home: 1, draw: 1, away: 0 });
    expect(s.reasons).toEqual([
      { reason: "dissent", count: 2 },
      { reason: null, count: 1 },
    ]);
    expect(s.teams).toEqual([
      { name: "Oxford Hawks M1", matches: 2 },
      { name: "Bath Buccaneers M1", matches: 1 },
      { name: "Reading M1", matches: 1 },
    ]);
  });

  it("counts a shootout, and its winner", () => {
    const doc = matchDoc();
    doc.settings.shootoutIfDrawn = true;
    doc.events = doc.events.filter((e) => e.seq !== 6);
    doc.events.push({ seq: 8, type: "shootout_attempt", team: "home", round: 1, scored: false }, { seq: 9, type: "shootout_attempt", team: "away", round: 1, scored: true });
    expect(umpireSummary([{ document: doc }])).toMatchObject({ shootouts: 1, results: { home: 0, draw: 0, away: 1 } });
  });

  it("has nothing to say about no matches", () => {
    expect(umpireSummary([])).toMatchObject({ matches: 0, goals: 0, reasons: [], teams: [], distanceM: null });
  });
});

describe("seasons", () => {
  it("run from September to August", () => {
    expect(seasonStart(new Date(2026, 9, 5))).toEqual(new Date(2026, 8, 1));
    expect(seasonStart(new Date(2027, 7, 31))).toEqual(new Date(2026, 8, 1));
    expect(seasonLabel(new Date(2026, 9, 5))).toBe("2026–27");
    expect(seasonLabel(new Date(2026, 5, 1))).toBe("2025–26");
  });

  it("put a match in this season, last season, or neither", () => {
    const today = new Date(2026, 9, 5);
    expect(inPeriod("2026-09-19T10:00:00Z", "season", today)).toBe(true);
    expect(inPeriod("2026-04-19T10:00:00Z", "season", today)).toBe(false);
    expect(inPeriod("2026-04-19T10:00:00Z", "lastSeason", today)).toBe(true);
    expect(inPeriod("2025-04-19T10:00:00Z", "lastSeason", today)).toBe(false);
    expect(inPeriod("2019-04-19T10:00:00Z", "all", today)).toBe(true);
  });
});
