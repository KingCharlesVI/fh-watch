import type { AvailabilityDay } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { calendarWeeks, dayStatus, nextMark, readHours, withMark } from "../src/core/availability";

const free: AvailabilityDay = { date: "2026-10-17", available: true, from: null, to: null };
const busy: AvailabilityDay = { date: "2026-10-17", available: false, from: null, to: null };

describe("availability", () => {
  it("shows 12 weeks, Monday first, from this week", () => {
    const weeks = calendarWeeks("2026-10-11"); // a Sunday
    expect(weeks).toHaveLength(12);
    expect(weeks[0]![0]).toBe("2026-10-05");
    expect(weeks[0]![6]).toBe("2026-10-11");
    expect(weeks[11]![6]).toBe("2026-12-27");
  });

  it("moves a day from not said, to free, to not free, and back", () => {
    expect(nextMark(undefined)).toBe("available");
    expect(nextMark(free)).toBe("unavailable");
    expect(nextMark(busy)).toBe("clear");
  });

  it("reads a marked day first, then weekdays you're never free", () => {
    expect(dayStatus(free, true)).toEqual({ tone: "free", label: "Free" });
    expect(dayStatus({ ...free, from: "10:00", to: "16:00" }, false).label).toBe("10:00–16:00");
    expect(dayStatus(busy, false)).toEqual({ tone: "busy", label: "Not free" });
    expect(dayStatus(undefined, true)).toEqual({ tone: "usually-busy", label: "Not free" });
    expect(dayStatus(undefined, false)).toEqual({ tone: "unknown", label: "" });
  });

  it("marks and unmarks days, keeping hours only on a free day", () => {
    const days = new Map([[free.date, free]]);
    expect(withMark(days, free.date, "clear").size).toBe(0);
    expect(withMark(days, "2026-10-18", "available", { from: "10:00", to: null }).get("2026-10-18")).toMatchObject({ available: true, from: "10:00" });
    expect(withMark(days, free.date, "unavailable", { from: "10:00", to: "12:00" }).get(free.date)).toEqual(busy);
    expect(days.size).toBe(1);
  });

  it("reads hours, either end left open", () => {
    expect(readHours("10:00", "")).toEqual({ from: "10:00", to: null });
    expect(readHours(" ", "16:00")).toEqual({ from: null, to: "16:00" });
    expect(readHours("", "")).toHaveProperty("error");
    expect(readHours("9:00", "")).toHaveProperty("error");
    expect(readHours("16:00", "10:00")).toEqual({ error: "The hours must end after they start." });
  });
});
