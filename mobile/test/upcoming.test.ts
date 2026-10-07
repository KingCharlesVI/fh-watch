import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP } from "../src/core/setup";
import {
  type UpcomingMatch,
  clockTime,
  dayLabel,
  isPast,
  pickerStart,
  playedUpcoming,
  readUpcoming,
  removeUpcoming,
  saveUpcoming,
  sortUpcoming,
  upcomingStore,
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

  it("names days the way people say them", () => {
    expect(dayLabel("2026-10-09", today)).toBe("Today");
    expect(dayLabel("2026-10-10", today)).toBe("Tomorrow");
    expect(dayLabel("2026-11-01", today)).toBe("Sun 1 Nov");
    expect(dayLabel("2027-01-09", today)).toBe("Sat 9 Jan 2027");
  });

  it("says when, and whether the day has gone", () => {
    expect(whenLabel({ date: "2026-10-10", time: "14:00" }, today)).toBe("Tomorrow, 14:00");
    expect(whenLabel({ date: "2026-10-12", time: null }, today)).toBe("Mon 12 Oct");
    expect(whenLabel({ date: null, time: "14:00" }, today)).toBeNull();
    expect(isPast({ date: "2026-10-08" }, today)).toBe(true);
    expect(isPast({ date: "2026-10-09" }, today)).toBe(false);
    expect(isPast({ date: null }, today)).toBe(false);
  });

  it("starts the pickers at the match's day and kick-off, or today at 14:00", () => {
    expect(pickerStart({ date: null, time: null }, today)).toEqual(new Date(2026, 9, 9, 14, 0));
    expect(pickerStart({ date: "2026-10-17", time: "09:30" }, today)).toEqual(new Date(2026, 9, 17, 9, 30));
    expect(clockTime(new Date(2026, 9, 17, 9, 5))).toBe("09:05");
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

describe("the upcoming matches kept on the phone", () => {
  /** expo-sqlite's key-value store, in memory. */
  const memory = (saved: Record<string, string> = {}) => {
    const values = new Map(Object.entries(saved));
    return {
      values,
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
  };
  const ids = (list: UpcomingMatch[] | null) => list?.map((u) => u.id).sort();

  it("keeps every match saved, however many, across restarts", async () => {
    const storage = memory({ upcomingMatches: JSON.stringify([match("a"), match("b")]) });
    const store = upcomingStore(storage);
    for (const id of ["c", "d", "e", "f"]) await store.save(match(id));
    expect(ids(store.current())).toEqual(["a", "b", "c", "d", "e", "f"]);
    // Opened again: all six are there.
    expect(ids(await upcomingStore(storage).load())).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("keeps deleted matches deleted and edits made", async () => {
    const storage = memory({ upcomingMatches: JSON.stringify([match("a"), match("b")]) });
    const store = upcomingStore(storage);
    await store.remove("a");
    await store.save(match("b", { date: "2026-10-11" }));
    await store.save(match("c"));
    const reopened = await upcomingStore(storage).load();
    expect(ids(reopened)).toEqual(["b", "c"]);
    expect(reopened.find((u) => u.id === "b")!.date).toBe("2026-10-11");
  });

  it("loses neither of two saves made at once", async () => {
    const store = upcomingStore(memory());
    await Promise.all([store.save(match("a")), store.save(match("b")), store.removeAll([])]);
    expect(ids(store.current())).toEqual(["a", "b"]);
  });

  it("starts empty when nothing's saved, or it can't be read", async () => {
    expect(await upcomingStore(memory()).load()).toEqual([]);
    expect(await upcomingStore(memory({ upcomingMatches: "not json" })).load()).toEqual([]);
    const broken = { getItem: () => Promise.reject(new Error("disk")), setItem: async () => {} };
    expect(await upcomingStore(broken).load()).toEqual([]);
  });

  it("tells the screens when the list changes", async () => {
    const store = upcomingStore(memory());
    let told = 0;
    const off = store.subscribe(() => told++);
    await store.save(match("a"));
    off();
    await store.save(match("b"));
    // Once when it was read, once for the save; nothing after unsubscribing.
    expect(told).toBe(2);
  });
});
