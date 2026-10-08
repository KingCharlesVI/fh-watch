import type { MyAppointment } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { appointmentReminders, applyAppointments, setupFrom, upcomingId } from "../src/core/appointments";
import { DEFAULT_SETUP } from "../src/core/setup";
import type { UpcomingMatch } from "../src/core/upcoming";

const NOW = "2026-09-19T12:00:00Z";
const TODAY = "2026-09-19";

function appointment(over: Partial<MyAppointment> = {}, fixture: Partial<MyAppointment["fixture"]> = {}): MyAppointment {
  return {
    id: "a1",
    fixtureId: "f1",
    userId: "u1",
    displayName: "Sam",
    role: "watch",
    mentoring: false,
    status: "accepted",
    coverRequested: false,
    createdAt: NOW,
    respondedAt: NOW,
    club: { id: "c1", name: "Oxford Hawks", slug: "oxford-hawks" },
    colleague: null,
    ...over,
    fixture: {
      id: "f1",
      clubId: "c1",
      date: "2026-09-26",
      time: "14:00",
      home: { name: "M1", teamId: null },
      away: { name: "Reading M1", teamId: null },
      venue: "Banbury Road",
      competition: "Hampshire Cup",
      format: { periods: 2, periodMinutes: 35, breakMinutes: 10, halfTimeMinutes: 5, shootoutIfDrawn: true },
      umpiresNeeded: 2,
      notes: null,
      createdAt: NOW,
      ...fixture,
    },
  };
}

const mine: UpcomingMatch = { id: "u-own", setup: DEFAULT_SETUP, date: "2026-09-27", time: null, createdAt: NOW, sentAt: null };

describe("appointments in Upcoming", () => {
  it("adds a watch appointment, set up from its fixture, once", () => {
    const { list, added } = applyAppointments([mine], new Set(), [appointment()], TODAY, NOW);
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ id: upcomingId("a1"), date: "2026-09-26", time: "14:00", sentAt: null });
    expect(list[1]!.setup).toMatchObject({ homeName: "M1", awayName: "Reading M1", periods: 2, periodMinutes: 35, venue: "Banbury Road", shootoutIfDrawn: true });
    expect([...added]).toEqual(["a1"]);

    // Deleted from Upcoming, it isn't added back.
    const again = applyAppointments([mine], added, [appointment()], TODAY, NOW);
    expect(again.list).toEqual([mine]);
  });

  it("leaves out second umpires and appointments not accepted", () => {
    const { list } = applyAppointments([], new Set(), [appointment({ role: "second" }), appointment({ id: "a2", status: "offered" })], TODAY, NOW);
    expect(list).toEqual([]);
  });

  it("follows the club's changes until it's sent, keeping the umpire's colours", () => {
    const first = applyAppointments([], new Set(), [appointment()], TODAY, NOW);
    const coloured = first.list.map((u) => ({ ...u, setup: { ...u.setup, homeColor: "#000000" } }));
    const moved = appointment({}, { date: "2026-09-27", time: "11:00", venue: "Sonning Lane" });
    const { list } = applyAppointments(coloured, first.added, [moved], TODAY, NOW);
    expect(list[0]).toMatchObject({ date: "2026-09-27", time: "11:00" });
    expect(list[0]!.setup).toMatchObject({ venue: "Sonning Lane", homeColor: "#000000" });

    const sent = list.map((u) => ({ ...u, sentAt: NOW }));
    const later = applyAppointments(sent, first.added, [appointment({}, { time: "15:00" })], TODAY, NOW);
    expect(later.list[0]!.time).toBe("11:00");
  });

  it("removes one you're no longer on, unless it was sent or has been played", () => {
    const first = applyAppointments([mine], new Set(), [appointment()], TODAY, NOW);
    expect(applyAppointments(first.list, first.added, [], TODAY, NOW).list).toEqual([mine]);
    const sent = first.list.map((u) => (u.id === mine.id ? u : { ...u, sentAt: NOW }));
    expect(applyAppointments(sent, first.added, [], TODAY, NOW).list).toHaveLength(2);
    // Past ones aren't in the fetched list (it's from today), so they stay for the played clean-up.
    expect(applyAppointments(first.list, first.added, [], "2026-09-30", NOW).list).toHaveLength(2);
  });

  it("keeps a fixture's format out when it has none", () => {
    expect(setupFrom(appointment({}, { format: null }))).toMatchObject({ periods: DEFAULT_SETUP.periods, homeName: "M1" });
  });
});

describe("appointment reminders", () => {
  it("are at 6pm the day before each accepted one still to come", () => {
    const reminders = appointmentReminders(
      [
        appointment({ colleague: { displayName: "Alex", role: "second", status: "accepted" } }),
        appointment({ id: "a2", role: "second" }, { date: "2026-10-03", time: null, venue: null }),
        appointment({ id: "a3", status: "offered" }),
        appointment({ id: "a4" }, { date: "2026-09-19" }), // tomorrow's reminder time has gone
      ],
      new Date(2026, 8, 19, 12, 0),
    );
    expect(reminders).toEqual([
      {
        id: "appointment:a1",
        at: new Date(2026, 8, 25, 18, 0),
        title: "Umpiring tomorrow: M1 v Reading M1",
        body: "You're the watch umpire at 14:00 at Banbury Road, with Alex.",
      },
      { id: "appointment:a2", at: new Date(2026, 9, 2, 18, 0), title: "Umpiring tomorrow: M1 v Reading M1", body: "You're the second umpire." },
    ]);
  });
});
