import { describe, expect, it } from "vitest";
import { addDays, availabilityFor, localDay, readDay, readTime, weekdayOf } from "../src/umpiring.js";

describe("localDay", () => {
  it("is the day in the UK, not UTC", () => {
    // 23:30 UTC in summer is already the next day in London.
    expect(localDay(new Date("2026-07-11T23:30:00Z"))).toBe("2026-07-12");
    expect(localDay(new Date("2026-12-11T23:30:00Z"))).toBe("2026-12-11");
  });
});

describe("readDay", () => {
  it("reads ISO and UK day-first dates", () => {
    expect(readDay("2026-10-11")).toBe("2026-10-11");
    expect(readDay("11/10/2026")).toBe("2026-10-11");
    expect(readDay("1/9/26")).toBe("2026-09-01");
    expect(readDay(" 11.10.2026 ")).toBe("2026-10-11");
  });

  it("refuses dates that don't exist, and anything else", () => {
    expect(readDay("31/09/2026")).toBeNull();
    expect(readDay("2026-02-30")).toBeNull();
    expect(readDay("next Saturday")).toBeNull();
    expect(readDay("")).toBeNull();
  });
});

describe("readTime", () => {
  it("reads 24-hour and am/pm times", () => {
    expect(readTime("14:00")).toBe("14:00");
    expect(readTime("9:30")).toBe("09:30");
    expect(readTime("14.30")).toBe("14:30");
    expect(readTime("1430")).toBe("14:30");
    expect(readTime("2pm")).toBe("14:00");
    expect(readTime("12:15 am")).toBe("00:15");
    expect(readTime("12pm")).toBe("12:00");
  });

  it("refuses what isn't a time", () => {
    expect(readTime("25:00")).toBeNull();
    expect(readTime("14")).toBeNull();
    expect(readTime("13pm")).toBeNull();
    expect(readTime("tbc")).toBeNull();
  });
});

describe("availabilityFor", () => {
  // 2026-10-10 is a Saturday, 2026-10-11 a Sunday.
  it("goes by a marked day, and its hours", () => {
    expect(availabilityFor("2026-10-10", "14:00", { available: true, from: null, to: null }, [])).toBe("available");
    expect(availabilityFor("2026-10-10", "14:00", { available: false, from: null, to: null }, [])).toBe("unavailable");
    expect(availabilityFor("2026-10-10", "14:00", { available: true, from: "10:00", to: "13:00" }, [])).toBe("unavailable");
    expect(availabilityFor("2026-10-10", "12:00", { available: true, from: "10:00", to: "13:00" }, [])).toBe("available");
    // Without a kick-off, a day with hours still counts.
    expect(availabilityFor("2026-10-10", null, { available: true, from: "10:00", to: "13:00" }, [])).toBe("available");
  });

  it("falls back to weekdays never free, then to unknown", () => {
    expect(availabilityFor("2026-10-11", "14:00", undefined, [0])).toBe("unavailable");
    expect(availabilityFor("2026-10-10", "14:00", undefined, [0])).toBe("unknown");
    // A marked day overrides the weekday.
    expect(availabilityFor("2026-10-11", "14:00", { available: true, from: null, to: null }, [0])).toBe("available");
  });
});

describe("days", () => {
  it("have weekdays, and add up across months", () => {
    expect(weekdayOf("2026-10-10")).toBe(6);
    expect(weekdayOf("2026-10-11")).toBe(0);
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
