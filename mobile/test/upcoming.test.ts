import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP } from "../src/core/setup";
import {
  type UpcomingMatch,
  dayLabel,
  isPast,
  parseTime,
  playedUpcoming,
  readUpcoming,
  removeUpcoming,
  saveUpcoming,
  sortUpcoming,
  upcomingDays,
  whenLabel,
} from "../src/core/upcoming";

// Thursday 9 October 2026.
const today = new Date(2026, 9, 9, 18, 30);

const match = (id: string, change: Partial<UpcomingMatch> = {}): UpcomingMatch => ({
  id,
  setup: DEFAULT_SETUP,
  date: null,
  time: null,
  createdAt: "2026-10-01T10:00:00Z",
  sentAt: null,
  ...change,
});

describe("upcoming matches", () => {
  it("lists the soonest first, then the undated ones in the order they were made", () => {
    const list = [
      match("undated-later", { createdAt: "2026-10-02T10:00:00Z" }),
      match("sat-3pm", { date: "2026-10-11", time: "15:00" }),
      match("undated-first"),
      match("sat-no-time", { date: "2026-10-11" }),
      match("sat-11am", { date: "2026-10-11", time: "11:00" }),
      match("fri", { date: "2026-10-10", time: "19:30" }),
    ];
    expect(sortUpcoming(list).map((u) => u.id)).toEqual(["fri", "sat-11am", "sat-3pm", "sat-no-time", "undated-first", "undated-later"]);
  });

  it("adds a new match and replaces an edited one", () => {
    let list = saveUpcoming([], match("a"));
    list = saveUpcoming(list, match("b"));
    list = saveUpcoming(list, match("a", { date: "2026-10-11" }));
    expect(list.map((u) => [u.id, u.date])).toEqual([
      ["a", "2026-10-11"],
      ["b", null],
    ]);
    expect(removeUpcoming(list, "a").map((u) => u.id)).toEqual(["b"]);
  });

  it("reads what was saved, filling in setup fields added since", () => {
    const { shootoutIfDrawn: _, ...older } = DEFAULT_SETUP;
    const saved = JSON.stringify([{ id: "a", setup: { ...older, homeName: "Hawks M2" }, createdAt: "2026-10-01T10:00:00Z" }, { nonsense: true }]);
    const [a, ...rest] = readUpcoming(saved);
    expect(rest).toEqual([]);
    expect(a).toMatchObject({ id: "a", date: null, time: null, sentAt: null });
    expect(a!.setup).toEqual({ ...DEFAULT_SETUP, homeName: "Hawks M2" });
    expect(readUpcoming(null)).toEqual([]);
    expect(readUpcoming("not json")).toEqual([]);
    expect(readUpcoming("{}")).toEqual([]);
  });

  it("offers the next two weeks of days, named the way people say them", () => {
    const days = upcomingDays(today);
    expect(days).toHaveLength(14);
    expect(days.slice(0, 3)).toEqual([
      { value: "2026-10-09", label: "Today" },
      { value: "2026-10-10", label: "Tomorrow" },
      { value: "2026-10-11", label: "Sun 11 Oct" },
    ]);
    // Over the end of the month.
    expect(days.at(-1)).toEqual({ value: "2026-10-22", label: "Thu 22 Oct" });
    expect(dayLabel("2026-11-01", today)).toBe("Sun 1 Nov");
  });

  it("says when, and whether the day has gone", () => {
    expect(whenLabel({ date: "2026-10-10", time: "14:00" }, today)).toBe("Tomorrow, 14:00");
    expect(whenLabel({ date: "2026-10-12", time: null }, today)).toBe("Mon 12 Oct");
    expect(whenLabel({ date: null, time: "14:00" }, today)).toBeNull();
    expect(isPast({ date: "2026-10-08" }, today)).toBe(true);
    expect(isPast({ date: "2026-10-09" }, today)).toBe(false);
    expect(isPast({ date: null }, today)).toBe(false);
  });

  it("reads a kick-off time as typed", () => {
    expect(parseTime("14:00")).toBe("14:00");
    expect(parseTime(" 9.30 ")).toBe("09:30");
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("14:60")).toBeNull();
    expect(parseTime("2pm")).toBeNull();
  });

  it("finds the sent matches that have been played since", () => {
    const sent = "2026-10-11T13:30:00Z";
    const list = [
      match("played", { sentAt: sent, setup: { ...DEFAULT_SETUP, homeName: "Hawks M2", awayName: "Reading M3" } }),
      match("not sent", { setup: { ...DEFAULT_SETUP, homeName: "Hawks M2", awayName: "Reading M3" } }),
      match("other teams", { sentAt: sent, setup: { ...DEFAULT_SETUP, homeName: "Hawks M1", awayName: "Reading M3" } }),
      match("played before it was sent", { sentAt: "2026-10-18T13:30:00Z", setup: { ...DEFAULT_SETUP, homeName: "Hawks M2", awayName: "Reading M3" } }),
    ];
    const teams = (home: string, away: string) => ({ home: { name: home, teamId: null, color: "#1D4ED8" }, away: { name: away, teamId: null, color: "#DC2626" } });
    const played = [{ teams: teams(" hawks m2", "Reading M3 "), startedAt: "2026-10-11T14:01:00Z" }];
    expect(playedUpcoming(list, played)).toEqual(["played"]);
  });
});
