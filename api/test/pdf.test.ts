import { renderMatchReport } from "@fh/shared";
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";
import { afterAll, describe, expect, it } from "vitest";
import { chromiumPdfRenderer } from "../src/services/pdf.js";
import { matchDoc } from "./helpers.js";

const hasChromium = existsSync(chromium.executablePath());
const renderer = chromiumPdfRenderer();
afterAll(() => renderer.close());

describe.skipIf(!hasChromium)("Chromium PDF rendering", () => {
  it("prints the match report to a one-page PDF", async () => {
    const html = renderMatchReport({
      document: matchDoc(),
      umpires: [{ slot: 1, name: "Sam" }],
      revision: 1,
      shareUrl: "https://hockey.test/m/K7P2QX",
      generatedAt: new Date("2026-09-19T12:00:00Z"),
    });
    const pdf = await renderer.render(html);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    const pages = pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect(pages).toHaveLength(1);
  });
});
