import { describe, expect, it } from "vitest";
import { CARD_REASONS, describeEvent, eventTime, formatDuration, periodLabel } from "../src/describe.js";
import { leagueMatch, shootoutMatch } from "./fixtures.js";

describe("periodLabel", () => {
  it.each([
    [4, 2, "Q2"],
    [2, 1, "H1"],
    [3, 3, "P3"],
  ])("%i periods, period %i → %s", (periods, period, label) => {
    expect(periodLabel(periods, period)).toBe(label);
  });
});

describe("formatDuration", () => {
  it("uses minutes when whole", () => {
    expect(formatDuration(300)).toBe("5 min");
    expect(formatDuration(90)).toBe("90 s");
  });
});

describe("describeEvent and eventTime", () => {
  it("describes every event in the league fixture", () => {
    const m = leagueMatch();
    const lines = m.events.map((e) => `${eventTime(e, m.settings)} | ${describeEvent(e, m.settings)}`);
    expect(lines).toEqual([
      "Q1 0:00 | Start of Q1",
      "Q1 6:52 | Goal",
      "Q1 8:50 | Yellow card (5 min)",
      "Q1 10:01 | Penalty corner",
      "Q1 10:05 | Goal (penalty corner)",
      "Q1 13:50 | Suspension ended",
      "Q1 15:00 | End of Q1",
      "Q2 0:00 | Start of Q2",
      "Q2 2:00 | Clock stopped (injury)",
      "Q2 2:00 | Clock restarted",
      "Q2 4:50 | Goal",
      "Q2 4:56 | Cancelled event 11",
      "Q2 8:20 | Penalty stroke scored",
      "Q2 8:20 | Goal (penalty stroke)",
      "Q2 10:00 | Green card (2 min)",
      "Q2 12:00 | Suspension ended",
      "Q2 15:00 | End of Q2",
      "Q3 0:00 | Start of Q3",
      "Q3 3:20 | Red card",
      "Q3 15:00 | End of Q3",
      "Q4 0:00 | Start of Q4",
      "Q4 1:40 | Penalty corner",
      "Q4 15:00 | End of Q4",
      " | Floodlights on pitch 1 failed briefly at half time.",
    ]);
  });

  it("marks shootout attempts", () => {
    const m = shootoutMatch();
    const e = m.events.find((x) => x.seq === 9)!;
    expect([eventTime(e, m.settings), describeEvent(e, m.settings)]).toEqual(["SO", "Shootout round 2: missed"]);
  });
});

describe("card reasons", () => {
  it("adds the reason to a card's description", () => {
    const m = leagueMatch();
    const card = m.events.find((e) => e.type === "card")!;
    expect(describeEvent({ ...card, reason: "dissent" } as typeof card, m.settings)).toBe("Yellow card (5 min): dissent");
    expect(describeEvent({ ...card, color: "red", durationSec: undefined, reason: "physical" } as typeof card, m.settings)).toBe("Red card: physical misconduct");
  });

  it("has a label for every reason", () => {
    expect(Object.keys(CARD_REASONS)).toEqual(["danger", "breakdown", "physical", "dissent", "other"]);
  });
});
