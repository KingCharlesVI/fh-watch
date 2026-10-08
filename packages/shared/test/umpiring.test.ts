import { describe, expect, it } from "vitest";
import { localDay, readDay, readTime } from "../src/umpiring.js";

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
