import { describe, expect, it } from "vitest";
import { resetTokenFrom } from "../src/core/reset-link";

const TOKEN = "Zm9vYmFy-_123";

describe("resetTokenFrom", () => {
  it("takes the token out of the emailed link", () => {
    expect(resetTokenFrom(`https://app.fhmatchcentre.com/reset-password?token=${TOKEN}`)).toBe(TOKEN);
  });

  it("copes with what else gets pasted: spare whitespace, the query alone, or just the token", () => {
    expect(resetTokenFrom(`  https://app.fhmatchcentre.com/reset-password?token=${TOKEN}\n`)).toBe(TOKEN);
    expect(resetTokenFrom(`?token=${TOKEN}`)).toBe(TOKEN);
    expect(resetTokenFrom(`token=${TOKEN}`)).toBe(TOKEN);
    expect(resetTokenFrom(TOKEN)).toBe(TOKEN);
  });

  it("stops at the end of the token when the link carries more", () => {
    expect(resetTokenFrom(`https://app.fhmatchcentre.com/reset-password?token=${TOKEN}&from=email`)).toBe(TOKEN);
    expect(resetTokenFrom(`https://app.fhmatchcentre.com/reset-password?from=email&token=${TOKEN}`)).toBe(TOKEN);
  });
});
