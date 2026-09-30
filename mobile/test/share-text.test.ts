import { describe, expect, it } from "vitest";
import { reportShareText } from "../src/core/share-text";
import { matchDoc, withVenue } from "./helpers";

describe("shared report text", () => {
  it("gives the result and date", () => {
    expect(reportShareText(matchDoc())).toEqual({
      subject: "Match report: Oxford Hawks M1 2–1 Reading M1, 19 Sep 2026",
      text: "Match report: Oxford Hawks M1 2–1 Reading M1, 19 Sep 2026.",
    });
  });

  it("adds the venue to the message", () => {
    expect(reportShareText(withVenue(matchDoc(), "Iffley Road")).text).toBe("Match report: Oxford Hawks M1 2–1 Reading M1, 19 Sep 2026 at Iffley Road.");
  });
});
