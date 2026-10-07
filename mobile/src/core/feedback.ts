/**
 * Bug reports and feature requests, as issues on the project's GitHub, through its issue
 * forms (.github/ISSUE_TEMPLATE). The link opens the form with what the phone knows filled
 * in: the form's field ids are the query's keys, and a dropdown takes one of its options.
 */

export const NEW_ISSUE_URL = "https://github.com/KingCharlesVI/fh-watch/issues/new";

export interface FeedbackContext {
  platform: "android" | "ios";
  /** The phone app's version and build, e.g. "1.1.2 (18)". */
  appVersion: string;
  /** The phone, e.g. "Pixel 8 (Android 16)"; null if it isn't known. */
  phone: string | null;
  /** The watches the phone knows about, e.g. "Galaxy Watch7 (watch app 1.1.2, build 18)". */
  watches: string[];
}

/** The bug report form, filled in for this phone and its watch. */
export function bugReportUrl(c: FeedbackContext): string {
  const devices = [...c.watches, ...(c.phone ? [c.phone] : [])].join(", ");
  return issueUrl("bug_report.yml", {
    where: c.platform === "ios" ? "Phone app (iPhone)" : "Phone app (Android)",
    version: c.appVersion,
    devices,
  });
}

/** The feature request form. */
export function featureRequestUrl(): string {
  return issueUrl("feature_request.yml", { where: "Phone app" });
}

/** Built by hand rather than with URLSearchParams, whose React Native version is a partial one. */
function issueUrl(template: string, fields: Record<string, string>): string {
  const query = Object.entries({ template, ...fields })
    .filter(([, v]) => v)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return `${NEW_ISSUE_URL}?${query}`;
}
