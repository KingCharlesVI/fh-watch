import type { AvailabilityDay } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { addMonths, dayStatus, lastDay, monthGrid, monthLabel, nextMark, readHours, withMark } from "../src/core/availability";

const free: AvailabilityDay = { date: "2026-10-17", available: true, from: null, to: null };
const busy: AvailabilityDay = { date: "2026-10-17", available: false, from: null, to: null };

describe("availability", () => {
  it("lays a month out a week to a row, Monday first", () => {
    const october = monthGrid("2026-10"); // starts on a Thursday, ends on a Saturday
    expect(october).toHaveLength(5);
    expect(october[0]).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(october[4]).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(monthGrid("2026-06")[0]![0]).toBe("2026-06-01"); // starts on a Monday
    expect(monthGrid("2027-02").flat().filter(Boolean)).toHaveLength(28);
  });

  it("moves between months, across years", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(lastDay("2028-02")).toBe("2028-02-29");
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
