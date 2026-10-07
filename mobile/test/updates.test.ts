import { describe, expect, it } from "vitest";
import { type GitHubRelease, apkFileName, downloadPercent, findUpdate, readReleases, watchSendOutcome } from "../src/core/updates";

const release = (tag: string, build: number, prerelease: boolean, apps: ("phone" | "watch")[] = ["phone", "watch"]): GitHubRelease => {
  const version = tag.replace(/^v/, "").replace(/-.*/, "");
  const base = `https://github.com/KingCharlesVI/fh-watch/releases/download/${tag}`;
  return {
    tag_name: tag,
    html_url: `https://github.com/KingCharlesVI/fh-watch/releases/tag/${tag}`,
    draft: false,
    prerelease,
    assets: [
      ...(apps.includes("phone") ? [{ name: `fh-match-centre-phone-${version}-${build}-alpha.apk`, browser_download_url: `${base}/phone.apk` }] : []),
      ...(apps.includes("watch") ? [{ name: `fh-match-centre-watch-${version}-${build}.apk`, browser_download_url: `${base}/watch.apk` }] : []),
    ],
  };
};

// Newest first, as GitHub lists them.
const RELEASES = readReleases([release("v0.4.0-alpha.9", 9, true), release("v0.3.0", 7, false), release("v0.3.0-alpha.7", 7, true)]);

describe("update notices", () => {
  it("reads builds from the APK names", () => {
    expect(RELEASES.map((r) => [r.name, r.phone?.build, r.watch?.build])).toEqual([
      ["0.4.0 alpha 9", 9, 9],
      ["0.3.0", 7, 7],
      ["0.3.0 alpha 7", 7, 7],
    ]);
  });

  it("skips drafts, releases without APKs and anything that isn't a release list", () => {
    expect(readReleases([{ ...release("v0.5.0", 10, false), draft: true }, release("v0.4.1", 10, false, [])])).toEqual([]);
    expect(readReleases({ message: "API rate limit exceeded" })).toEqual([]);
  });

  it("offers the newest pre-release when asked for", () => {
    const update = findUpdate(RELEASES, { phone: 7, watches: [7] }, true);
    expect(update?.release.name).toBe("0.4.0 alpha 9");
    expect(update?.phone?.build).toBe(9);
    expect(update?.watch?.build).toBe(9);
  });

  it("offers only full releases otherwise", () => {
    expect(findUpdate(RELEASES, { phone: 7, watches: [7] }, false)).toBeNull();
    expect(findUpdate(RELEASES, { phone: 6, watches: [] }, false)?.release.name).toBe("0.3.0");
  });

  it("says which app is behind", () => {
    const watchOnly = findUpdate(RELEASES, { phone: 9, watches: [9, 7] }, true);
    expect(watchOnly?.phone).toBeNull();
    expect(watchOnly?.watch?.build).toBe(9);
    expect(findUpdate(RELEASES, { phone: 9, watches: [9] }, true)).toBeNull();
  });

  it("never tells a development build about updates", () => {
    expect(findUpdate(RELEASES, { phone: null, watches: [] }, true)).toBeNull();
  });

  it("names a download after its APK", () => {
    expect(apkFileName("https://github.com/KingCharlesVI/fh-watch/releases/download/v1.1.0/fh-match-centre-phone-1.1.0-14-beta.apk")).toBe(
      "fh-match-centre-phone-1.1.0-14-beta.apk",
    );
    expect(() => apkFileName("https://github.com/KingCharlesVI/fh-watch/releases/download/v1.1.0/notes.md")).toThrow();
    expect(() => apkFileName("https://github.com/x/..%2F..%2Fevil.apk")).toThrow();
  });

  it("says how far a download has got", () => {
    expect(downloadPercent(0, 2_000_000)).toBe(0);
    expect(downloadPercent(999_999, 2_000_000)).toBe(49);
    expect(downloadPercent(2_000_000, 2_000_000)).toBe(100);
    expect(downloadPercent(500, -1)).toBeNull();
  });

  it("says how sending the watch app went, from the watches' answers", () => {
    expect(watchSendOutcome({ sent: 1, ready: 1, rejected: 0 })).toBe("ready");
    expect(watchSendOutcome({ sent: 2, ready: 1, rejected: 1 })).toBe("ready");
    expect(watchSendOutcome({ sent: 1, ready: 0, rejected: 1 })).toBe("rejected");
    // A watch app from before build 17 doesn't answer.
    expect(watchSendOutcome({ sent: 1, ready: 0, rejected: 0 })).toBe("unconfirmed");
    expect(watchSendOutcome({ sent: 0, ready: 0, rejected: 0 })).toBe("noWatch");
  });
});
