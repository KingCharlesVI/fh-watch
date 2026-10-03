export const SITE_NAME = "FH Match Centre";
export const SITE_DESCRIPTION = "Field hockey results, straight from the umpire's watch.";

/**
 * The project's other sites. This website is app.fhmatchcentre.com; the landing page
 * (the apps, the roadmap, the privacy policy) is the main domain, and the documentation
 * is docs.fhmatchcentre.com. Each can be overridden, e.g. for a test deployment.
 */
export const LANDING_URL = process.env.LANDING_URL ?? "https://fhmatchcentre.com";
export const DOCS_URL = process.env.DOCS_URL ?? "https://docs.fhmatchcentre.com";
export const GITHUB_URL = "https://github.com/KingCharlesVI/fh-watch";
/** Where problems are reported, in the open. */
export const ISSUES_URL = `${GITHUB_URL}/issues`;
/** The issue forms in .github/ISSUE_TEMPLATE, so a link opens the right one already chosen. */
export const BUG_REPORT_URL = `${ISSUES_URL}/new?template=bug_report.yml`;
export const FEATURE_REQUEST_URL = `${ISSUES_URL}/new?template=feature_request.yml`;
