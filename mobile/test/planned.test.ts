import type { PlannedMatch } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { afterPlanning, applyPlanned, needsPlanning, plannedBody, plannedIdOf, plannedUpcomingId } from "../src/core/planned";
import { DEFAULT_SETUP } from "../src/core/setup";
import { type UpcomingMatch, saveUpcoming } from "../src/core/upcoming";

const NOW = "2026-09-19T12:00:00Z";
const TODAY = "2026-09-19";

function planned(over: Partial<PlannedMatch> = {}): PlannedMatch {
  return {
    id: "p1",
    date: "2026-09-26",
    time: "14:00",
    home: { name: "Reading M1", color: "#16A34A", captain: 7 },
    away: { name: "Oxford M2", color: "#FFFFFF", captain: null },
    venue: "Palmer Park",
    competition: null,
    format: { periods: 2, periodMinutes: 35, breakMinutes: 10, halfTimeMinutes: 5, shootoutIfDrawn: true },
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

const mine: UpcomingMatch = { id: "u-own", setup: DEFAULT_SETUP, date: "2026-09-27", time: null, createdAt: NOW, sentAt: null };
const lastSent = { ...DEFAULT_SETUP, periods: 2, periodMinutes: 30, breakMinutes: 5 };

describe("planned matches in Upcoming", () => {
  it("adds each one, set up as planned, once", () => {
    const { list, added } = applyPlanned([mine], new Set(), [planned()], lastSent, TODAY, NOW);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ id: plannedUpcomingId("p1"), date: "2026-09-26", time: "14:00", sentAt: null, plannedAt: NOW });
    expect(list[1]!.setup).toMatchObject({
      homeName: "Reading M1",
      homeColor: "#16A34A",
      homeCaptain: 7,
      awayName: "Oxford M2",
      awayCaptain: null,
      venue: "Palmer Park",
      periods: 2,
      periodMinutes: 35,
      shootoutIfDrawn: true,
    });
    expect([...added]).toEqual(["p1"]);

    // Deleted from Upcoming, it isn't added back.
    expect(applyPlanned([mine], added, [planned()], lastSent, TODAY, NOW).list).toEqual([mine]);
  });

  it("takes the format from the last setup sent when the plan leaves it out", () => {
    const { list } = applyPlanned([], new Set(), [planned({ format: null })], lastSent, TODAY, NOW);
    expect(list[0]!.setup).toMatchObject({ periods: 2, periodMinutes: 30, breakMinutes: 5, homeName: "Reading M1" });
  });

  it("takes in changes made on the website, until it's sent", () => {
    const first = applyPlanned([], new Set(), [planned()], lastSent, TODAY, NOW);
    // Changed on the phone since: kept, while the website's hasn't changed.
    const edited = { ...first.list[0]!, setup: { ...first.list[0]!.setup, homeCaptain: 9 } };
    expect(applyPlanned([edited], first.added, [planned()], lastSent, TODAY, NOW).list).toEqual([edited]);

    const moved = planned({ time: "15:30", updatedAt: "2026-09-20T09:00:00Z" });
    const after = applyPlanned([edited], first.added, [moved], lastSent, TODAY, NOW).list[0]!;
    expect(after).toMatchObject({ time: "15:30", plannedAt: "2026-09-20T09:00:00Z" });

    const sent = { ...edited, sentAt: NOW };
    expect(applyPlanned([sent], first.added, [moved], lastSent, TODAY, NOW).list).toEqual([sent]);
  });

  it("goes when it's deleted on the website, unless it's been sent or its day has gone", () => {
    const { list, added } = applyPlanned([mine], new Set(), [planned()], lastSent, TODAY, NOW);
    expect(applyPlanned(list, added, [], lastSent, TODAY, NOW).list).toEqual([mine]);

    const sent = list.map((u) => ({ ...u, sentAt: NOW }));
    expect(applyPlanned(sent, added, [], lastSent, TODAY, NOW).list).toHaveLength(2);
    expect(applyPlanned(list, added, [], lastSent, "2026-09-27", NOW).list).toHaveLength(2);
  });
});

describe("matches set up on the phone, on the website", () => {
  const club = { ...mine, id: "appt-a1" };

  it("go once they have a day from today and are ready to send", () => {
    expect(needsPlanning(mine, TODAY)).toBe(true);
    expect(needsPlanning({ ...mine, date: null }, TODAY)).toBe(false);
    expect(needsPlanning({ ...mine, date: "2026-09-18" }, TODAY)).toBe(false);
    expect(needsPlanning({ ...mine, setup: { ...DEFAULT_SETUP, homeName: " " } }, TODAY)).toBe(false);
    // Appointments are the club's.
    expect(needsPlanning(club, TODAY)).toBe(false);
  });

  it("go again only when they're changed on the phone", () => {
    const there = { ...mine, plannedId: "p9", plannedAt: NOW, unsynced: false };
    expect(needsPlanning(there, TODAY)).toBe(false);
    expect(needsPlanning({ ...there, unsynced: true }, TODAY)).toBe(true);
    const fromWebsite = { ...mine, id: plannedUpcomingId("p1"), plannedAt: NOW };
    expect(needsPlanning(fromWebsite, TODAY)).toBe(false);
    expect(needsPlanning({ ...fromWebsite, unsynced: true }, TODAY)).toBe(true);
    expect(plannedIdOf(fromWebsite)).toBe("p1");
  });

  it("go up as the watch gets them", () => {
    const u = { ...mine, date: "2026-09-27", time: "10:30", setup: { ...DEFAULT_SETUP, homeName: " Reading M1 ", venue: "  ", competition: "League" } };
    expect(plannedBody(u)).toEqual({
      date: "2026-09-27",
      time: "10:30",
      home: { name: "Reading M1", color: DEFAULT_SETUP.homeColor, captain: null },
      away: { name: "Away", color: DEFAULT_SETUP.awayColor, captain: null },
      venue: null,
      competition: "League",
      format: { periods: 4, periodMinutes: 15, breakMinutes: 2, halfTimeMinutes: 5, shootoutIfDrawn: false },
    });
  });

  it("keep their id on the website, and changes made meanwhile still to go", () => {
    const p = planned({ id: "p9" });
    const done = afterPlanning([mine], mine, p);
    expect(done).toEqual({ list: [{ ...mine, plannedId: "p9", plannedAt: NOW, unsynced: false }], kept: true });

    const changed = { ...mine, time: "11:00" };
    expect(afterPlanning([changed], mine, p).list[0]).toMatchObject({ time: "11:00", plannedId: "p9", unsynced: true });
    expect(afterPlanning([], mine, p).kept).toBe(false);

    // Saved from a screen opened before it went up, it keeps its id there.
    expect(saveUpcoming(done.list, { ...mine, time: "12:00", unsynced: true })[0]).toMatchObject({ plannedId: "p9", time: "12:00" });
  });

  it("aren't added again when fetched, and changes on the phone win until they've gone up", () => {
    const there = { ...mine, plannedId: "p9", plannedAt: NOW, unsynced: false };
    const p = planned({ id: "p9", time: "16:00", updatedAt: "2026-09-20T09:00:00Z" });
    const [fetched, ...more] = applyPlanned([there], new Set(), [p], lastSent, TODAY, NOW).list;
    expect(more).toEqual([]);
    expect(fetched).toMatchObject({ id: mine.id, plannedId: "p9", date: "2026-09-26", time: "16:00", plannedAt: p.updatedAt });

    const edited = { ...there, unsynced: true };
    expect(applyPlanned([edited], new Set(), [p], lastSent, TODAY, NOW).list).toEqual([edited]);

    // Deleted on the website: it goes, as one planned there would.
    expect(applyPlanned([there], new Set(["p9"]), [], lastSent, TODAY, NOW).list).toEqual([]);
  });
});
