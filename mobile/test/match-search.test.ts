import type { Match } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { matchesSearch } from "../src/core/match-search";
import { matchDoc } from "./helpers";

describe("finding a match in the list", () => {
  const doc = { ...matchDoc(), competition: "South Men's Division 2", venue: "Iffley Road" };
  const local = { document: doc, server: null };

  it("finds it by team, club, competition or venue, in any capitals", () => {
    for (const q of ["reading", "OXFORD HAWKS", "division 2", "iffley"]) expect(matchesSearch(local, q)).toBe(true);
    expect(matchesSearch(local, "witney")).toBe(false);
  });

  it("needs every word, wherever each one is", () => {
    expect(matchesSearch(local, "hawks iffley")).toBe(true);
    expect(matchesSearch(local, "hawks cup")).toBe(false);
  });

  it("shows everything when nothing's typed", () => {
    expect(matchesSearch(local, "  ")).toBe(true);
  });

  it("uses the server's list for a match the phone hasn't opened yet", () => {
    const server = { home: { name: "Witney M1" }, away: { name: "Banbury M2" }, venue: null, competition: "Hampshire Cup" } as unknown as Match;
    expect(matchesSearch({ document: null, server }, "witney cup")).toBe(true);
    expect(matchesSearch({ document: null, server }, "oxford")).toBe(false);
  });
});
