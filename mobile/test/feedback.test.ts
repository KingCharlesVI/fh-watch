import { describe, expect, it } from "vitest";
import { bugReportUrl, featureRequestUrl } from "../src/core/feedback";

const fields = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("feedback links", () => {
  it("fills in the bug report with the app, the phone and the watch", () => {
    const url = bugReportUrl({
      platform: "android",
      appVersion: "1.1.2 (18)",
      phone: "Pixel 8 (Android 16)",
      watches: ["Galaxy Watch7 (watch app 1.1.2, build 18)"],
    });
    expect(url.startsWith("https://github.com/KingCharlesVI/fh-watch/issues/new?")).toBe(true);
    expect(fields(url)).toEqual({
      template: "bug_report.yml",
      where: "Phone app (Android)",
      version: "1.1.2 (18)",
      devices: "Galaxy Watch7 (watch app 1.1.2, build 18), Pixel 8 (Android 16)",
    });
  });

  it("leaves out what the phone doesn't know", () => {
    const url = bugReportUrl({ platform: "ios", appVersion: "1.1.2 (18)", phone: null, watches: [] });
    expect(fields(url)).toEqual({ template: "bug_report.yml", where: "Phone app (iPhone)", version: "1.1.2 (18)" });
  });

  it("opens the feature request form", () => {
    expect(fields(featureRequestUrl())).toEqual({ template: "feature_request.yml", where: "Phone app" });
  });
});
