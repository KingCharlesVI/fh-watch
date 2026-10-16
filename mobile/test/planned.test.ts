import type { PlannedMatch } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { applyPlanned, plannedUpcomingId } from "../src/core/planned";
import { DEFAULT_SETUP } from "../src/core/setup";
import type { UpcomingMatch } from "../src/core/upcoming";

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
