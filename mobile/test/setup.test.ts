import { describe, expect, it } from "vitest";
import { DEFAULT_SETUP, PRESETS, presetOf, readSavedSetup, setupErrors, setupMessage } from "../src/core/setup";

describe("setup on phone", () => {
  it("accepts the defaults and each preset", () => {
    expect(setupErrors(DEFAULT_SETUP)).toEqual({});
    for (const p of PRESETS) expect(setupErrors({ ...DEFAULT_SETUP, ...p })).toEqual({});
    expect(presetOf(DEFAULT_SETUP)?.label).toBe("4 × 15 min");
  });

  it("points out values the watch wouldn't take", () => {
    const errors = setupErrors({ ...DEFAULT_SETUP, periods: 9, periodMinutes: 0, homeName: "  ", awayCaptain: 1000 });
    expect(Object.keys(errors).sort()).toEqual(["awayCaptain", "homeName", "periodMinutes", "periods"]);
  });

  it("takes three-digit shirt numbers", () => {
    expect(setupErrors({ ...DEFAULT_SETUP, homeCaptain: 999, awayCaptain: 100 })).toEqual({});
  });

  it("ignores break lengths that don't apply", () => {
    // One period: no breaks. Two periods: no separate half-time.
    expect(setupErrors({ ...DEFAULT_SETUP, periods: 1, breakMinutes: 99, halfTimeMinutes: 99 })).toEqual({});
    expect(setupErrors({ ...DEFAULT_SETUP, periods: 2, halfTimeMinutes: 99 })).toEqual({});
  });

  it("sends trimmed names and no empty venue", () => {
    const sent = JSON.parse(setupMessage({ ...DEFAULT_SETUP, homeName: "  Hawks M2 ", venue: "  " }));
    expect(sent.homeName).toBe("Hawks M2");
    expect(sent.venue).toBeNull();
    // Every field the watch reads (Setup.fromPhone in watch-wear/.../data/Prefs.kt).
    expect(Object.keys(sent).sort()).toEqual(Object.keys(DEFAULT_SETUP).sort());
  });

  it("starts from the last setup sent, or the defaults", () => {
    expect(readSavedSetup(null)).toEqual(DEFAULT_SETUP);
    expect(readSavedSetup("not json")).toEqual(DEFAULT_SETUP);
    expect(readSavedSetup(JSON.stringify({ homeName: "Hawks M2" })).homeName).toBe("Hawks M2");
  });
});
