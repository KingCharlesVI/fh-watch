import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { newSince, parseChangelog } from "../src/core/changelog";

const SAMPLE = `## [1.2.0-beta.21] - 2026-10-09

### 🚀 Features

- *(mobile)* One switch in Settings for all notifications
- *(api)* Generous rate limits on every request
- *(deploy)* Keep the services' logs for 30 days
- A 10-minute half-time in the 2 × 35 min preset

### 🐛 Bug Fixes

- *(watch)* [**breaking**] the clock no longer drifts

### ⚡ Performance

- *(web)* Cache the public lists for a minute

### 📚 Documentation

- Rate limits

### ⚙️ Miscellaneous Tasks

- *(release)* V1.2.0 build 21
## [1.1.4-beta.20] - 2026-10-08

### ⚙️ Miscellaneous Tasks

- *(release)* V1.1.4 build 20
## [1.1.3-beta.19] - 2026-10-07

### 🚀 Features

- *(web)* Competitions to manage
### 💼 Other

- Merge pull request #39 from KingCharlesVI/main

minor changes
`;

describe("parseChangelog", () => {
  it("keeps what umpires notice, labelled by app, and leaves out the rest", () => {
    const [latest, ...rest] = parseChangelog(SAMPLE);
    expect(latest).toEqual({
      version: "1.2.0-beta.21",
      date: "2026-10-09",
      sections: [
        {
          title: "New",
          items: [
            { area: "Phone", text: "One switch in Settings for all notifications" },
            { area: "Server", text: "Generous rate limits on every request" },
            { area: null, text: "A 10-minute half-time in the 2 × 35 min preset" },
          ],
        },
        { title: "Fixed", items: [{ area: "Watch", text: "The clock no longer drifts" }] },
        { title: "Faster", items: [{ area: "Website", text: "Cache the public lists for a minute" }] },
      ],
    });
    // 1.1.4-beta.20 was only a release chore, so it's left out.
    expect(rest.map((e) => e.version)).toEqual(["1.1.3-beta.19"]);
    expect(rest[0]!.sections).toEqual([{ title: "New", items: [{ area: "Website", text: "Competitions to manage" }] }]);
  });

  it("reads the real changelog", () => {
    const entries = parseChangelog(readFileSync(join(__dirname, "..", "..", "CHANGELOG.md"), "utf8"));
    expect(entries.length).toBeGreaterThan(3);
    for (const e of entries) {
      expect(e.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(e.sections.length).toBeGreaterThan(0);
    }
  });
});

describe("newSince", () => {
  const entries = parseChangelog(SAMPLE);

  it("shows nothing on a fresh install, or when the newest was already shown", () => {
    expect(newSince(entries, null)).toEqual([]);
    expect(newSince(entries, "1.2.0-beta.21")).toEqual([]);
  });

  it("shows every entry newer than the one last shown", () => {
    expect(newSince(entries, "1.1.3-beta.19").map((e) => e.version)).toEqual(["1.2.0-beta.21"]);
  });

  it("shows just the newest when the last one shown is no longer listed", () => {
    expect(newSince(entries, "0.1.0").map((e) => e.version)).toEqual(["1.2.0-beta.21"]);
  });
});
