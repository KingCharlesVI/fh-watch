import { describe, expect, it } from "vitest";
import { activeEvents, finalWhistle, formatClock, shootoutTaker, summarizeMatch } from "../src/summary.js";
import { leagueMatch, shootoutMatch } from "./fixtures.js";

describe("summarizeMatch", () => {
  it("works out the league match", () => {
    const s = summarizeMatch(leagueMatch());
    expect(s.score).toEqual({ home: 2, away: 1 });
    expect(s.periodScores).toEqual([
      { period: 1, home: 2, away: 0 },
      { period: 2, home: 0, away: 1 },
      { period: 3, home: 0, away: 0 },
      { period: 4, home: 0, away: 0 },
    ]);
    expect(s.result).toEqual({ winner: "home", decidedBy: "regulation" });
    expect(s.shootout).toBeNull();
    expect(s.penaltyCorners).toEqual({ home: 1, away: 1 });
    expect(s.penaltyStrokes).toEqual({ home: { awarded: 0, scored: 0 }, away: { awarded: 1, scored: 1 } });
    expect(s.cards).toEqual({
      home: { green: 1, yellow: 0, red: 1 },
      away: { green: 0, yellow: 1, red: 0 },
    });
  });

  it("decides a drawn match on the shootout, including sudden death", () => {
    const s = summarizeMatch(shootoutMatch());
    expect(s.score).toEqual({ home: 1, away: 1 });
    expect(s.shootout).toEqual({ home: 2, away: 3, rounds: 4 });
    expect(s.result).toEqual({ winner: "away", decidedBy: "shootout" });
  });

  it("reports a draw with no winner when there's no shootout", () => {
    const m = shootoutMatch();
    m.events = m.events.filter((e) => e.type !== "shootout_attempt");
    expect(summarizeMatch(m).result).toEqual({ winner: null, decidedBy: null });
  });

  it("drops voided events, the voids, and card_end for a voided card", () => {
    const m = leagueMatch();
    m.events.push({ seq: 25, type: "void", refSeq: 3 });
    const seqs = activeEvents(m).map((e) => e.seq);
    expect(seqs).not.toContain(11); // voided goal
    expect(seqs).not.toContain(12); // the void itself
    expect(seqs).not.toContain(3); // voided yellow card
    expect(seqs).not.toContain(6); // its card_end
    expect(summarizeMatch(m).cards.away.yellow).toBe(0);
  });

  it("puts events added later on the phone in match order", () => {
    const m = leagueMatch();
    m.events.push({ seq: 25, type: "goal", team: "away", player: 3, period: 1, clockMs: 100000 });
    const s = summarizeMatch(m);
    expect(s.score).toEqual({ home: 2, away: 2 });
    const order = s.timeline.map((e) => e.seq);
    expect(order.indexOf(25)).toBe(order.indexOf(1) + 1);
  });

  it("orders the timeline: periods by clock, then the shootout as recorded, then untimed notes", () => {
    const m = shootoutMatch();
    m.events.push({ seq: 15, type: "note", text: "Shootout taken at the clubhouse end." });
    const types = summarizeMatch(m).timeline.map((e) => e.type);
    expect(types.slice(0, 6)).toEqual(["period_start", "goal", "period_end", "period_start", "goal", "period_end"]);
    expect(types.slice(6, 14).every((t) => t === "shootout_attempt")).toBe(true);
    expect(types.at(-1)).toBe("note");
  });
});

describe("finalWhistle", () => {
  it("uses endedAt when present", () => {
    expect(finalWhistle(leagueMatch())).toBe("2026-09-19T14:14:02Z");
  });

  it("falls back to the last period_end wall time", () => {
    const m = leagueMatch();
    delete m.endedAt;
    m.events.find((e) => e.seq === 23)!.wallTime = "2026-09-19T14:15:00Z";
    expect(finalWhistle(m)).toBe("2026-09-19T14:15:00Z");
  });

  it("is null when nothing records the end", () => {
    const m = leagueMatch();
    m.endedAt = null;
    for (const e of m.events) delete e.wallTime;
    expect(finalWhistle(m)).toBeNull();
  });
});

describe("formatClock", () => {
  it.each([
    [0, "0:00"],
    [412000, "6:52"],
    [530500, "8:50"],
    [2100000, "35:00"],
  ])("%i ms → %s", (ms, text) => {
    expect(formatClock(ms)).toBe(text);
  });

  it("puts the shootout's cards among its attempts, in the order recorded", () => {
    const m = shootoutMatch();
    m.events = m.events.filter((e) => e.seq <= 9);
    m.events.push(
      { seq: 10, type: "card", team: "away", player: 3, color: "yellow", period: 2, clockMs: 2100000, shootout: true },
      { seq: 11, type: "shootout_attempt", team: "away", round: 2, scored: false, forfeit: true },
    );
    expect(summarizeMatch(m).timeline.slice(-5).map((e) => e.seq)).toEqual([7, 8, 9, 10, 11]);
  });
});

describe("shootoutTaker", () => {
  it("alternates, and the team that went first in a series goes second in the next", () => {
    const order = Array.from({ length: 24 }, (_, i) => (shootoutTaker("home", i) === "home" ? "H" : "A")).join("");
    expect(order).toBe("HAHAHAHAHA" + "AHAHAHAHAH" + "HAHA");
    expect(shootoutTaker("away", 0)).toBe("away");
    expect(shootoutTaker("away", 10)).toBe("home");
  });
});
