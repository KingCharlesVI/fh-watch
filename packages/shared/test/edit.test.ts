import { describe, expect, it } from "vitest";
import { addEvent, buildEvent, cancelEvent, nextSeq, parseClock, restoreEvent, voidedSeqs } from "../src/edit.js";
import { summarizeMatch } from "../src/summary.js";
import { parseMatch } from "../src/validate.js";
import { leagueMatch } from "./fixtures.js";

describe("event edits", () => {
  it("adds events with the next seq, leaving the input unchanged", () => {
    const doc = leagueMatch();
    const next = addEvent(doc, { type: "goal", team: "away", period: 4, clockMs: 60000 });
    expect(next.events.at(-1)).toMatchObject({ seq: 25, type: "goal" });
    expect(doc.events).toHaveLength(24);
    expect(summarizeMatch(next).score).toEqual({ home: 2, away: 2 });
    expect(parseMatch(next).ok).toBe(true);
  });

  it("voids a saved event but removes an unsaved one outright", () => {
    const doc = leagueMatch();
    const saved = new Set(doc.events.map((e) => e.seq));

    const voided = cancelEvent(doc, 2, saved);
    expect(voided.events.at(-1)).toEqual({ seq: 25, type: "void", refSeq: 2 });
    expect(voidedSeqs(voided).has(2)).toBe(true);
    expect(summarizeMatch(voided).score.home).toBe(1);

    const added = addEvent(doc, { type: "note", text: "Typo" });
    const removed = cancelEvent(added, 25, saved);
    expect(removed.events).toEqual(doc.events);
  });

  it("restores a cancelled event", () => {
    const doc = leagueMatch();
    const restored = restoreEvent(doc, 11);
    expect(voidedSeqs(restored).has(11)).toBe(false);
    expect(summarizeMatch(restored).score.home).toBe(3);
  });

  it("finds the next seq after gaps", () => {
    const doc = leagueMatch();
    doc.events.at(-1)!.seq = 40;
    expect(nextSeq(doc)).toBe(41);
  });
});

describe("parseClock", () => {
  it.each([
    ["12:30", 750000],
    ["0:05", 5000],
    [" 7 ", 420000],
    ["70:00", 4200000],
  ])("%s → %i ms", (text, ms) => {
    expect(parseClock(text)).toBe(ms);
  });

  it.each(["", "12:3", "12:60", "abc", "-1"])("rejects %j", (text) => {
    expect(parseClock(text)).toBeNull();
  });
});

describe("buildEvent", () => {
  const settings = leagueMatch().settings;
  const base = { team: "home" as const, period: 2, clock: "10:00", player: "" };

  it("builds a goal with its method", () => {
    expect(buildEvent({ ...base, type: "goal", player: "9", method: "pc" }, settings)).toEqual({
      event: { type: "goal", team: "home", period: 2, clockMs: 600000, player: 9, method: "pc" },
    });
  });

  it("uses the match's card lengths", () => {
    const card = (color: "green" | "yellow" | "red", yellowLong = false) =>
      buildEvent({ ...base, type: "card", player: "4", color, yellowLong }, settings);
    expect(card("green")).toMatchObject({ event: { color: "green", durationSec: 120 } });
    expect(card("yellow")).toMatchObject({ event: { color: "yellow", durationSec: 300 } });
    expect(card("yellow", true)).toMatchObject({ event: { color: "yellow", durationSec: 600 } });
    const red = card("red");
    expect("event" in red && "durationSec" in red.event).toBe(false);
  });

  it("allows untimed notes", () => {
    expect(buildEvent({ ...base, type: "note", clock: "", text: " Pitch flooded " }, settings)).toEqual({
      event: { type: "note", text: "Pitch flooded" },
    });
  });

  it("explains what's missing", () => {
    expect(buildEvent({ ...base, type: "goal", clock: "" }, settings)).toHaveProperty("error");
    expect(buildEvent({ ...base, type: "card", color: "green" }, settings)).toEqual({ error: "Cards need the player's shirt number." });
    expect(buildEvent({ ...base, type: "goal", player: "1.5" }, settings)).toHaveProperty("error");
    expect(buildEvent({ ...base, type: "goal", period: 5 }, settings)).toHaveProperty("error");
    expect(buildEvent({ ...base, type: "note", text: "  " }, settings)).toHaveProperty("error");
  });
});
