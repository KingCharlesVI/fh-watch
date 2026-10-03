/**
 * Everything on the landing page that changes as the project moves on: the
 * stage, the download links and the questions. Edit here and redeploy.
 *
 * A link left as null shows as "Coming soon".
 */

export const SITE = {
  name: "FH Match Centre",
  url: "https://fhmatchcentre.com",
  description: "A field hockey umpiring app for Wear OS and Apple Watch, with a phone app for match reports and, soon, published results for clubs.",
  /** Where people ask to join a test. Null hides the request buttons. */
  contactEmail: null as string | null,
  /** The public GitHub repository whose releases hold the APKs (see `pnpm release:github`). */
  githubRepo: "KingCharlesVI/fh-watch",
  /** The website (results, accounts, clubs), from 1.0. Null hides the links to it. */
  appUrl: "https://app.fhmatchcentre.com" as string | null,
  /** The user guide and technical documentation (docs-site/). */
  docsUrl: "https://docs.fhmatchcentre.com",
};

export const GITHUB_URL = `https://github.com/${SITE.githubRepo}`;

/** The GitHub project board, for anyone who wants to follow the work. */
export const PROJECT_BOARD_URL = `${GITHUB_URL}/projects/11/views/1`;
export const ISSUES_URL = `${GITHUB_URL}/issues`;
/** The issue forms in .github/ISSUE_TEMPLATE, so a link opens the right one already chosen. */
export const BUG_REPORT_URL = `${ISSUES_URL}/new?template=bug_report.yml`;
export const FEATURE_REQUEST_URL = `${ISSUES_URL}/new?template=feature_request.yml`;

/**
 * Where the "join the testing" forms send what's typed into them.
 *
 * - `endpoint`: a URL that takes a JSON POST of { kind, name, email, devices, notes }.
 *   The project's own API answers that at `/v1/access-requests`, which emails the
 *   umpire straight away and the admins' decision later (api/src/routes/access-requests.ts).
 *   The API only accepts it from this site's address, set as LANDING_URL there.
 *   A form service (Formspree, Tally and the like) would work here too.
 * - otherwise `SITE.contactEmail`: the form opens the umpire's own email app with
 *   everything filled in, which needs nothing hosted at all.
 *
 * With neither, the forms say invitations aren't open through them yet and point at
 * the support page, so the page is never a dead end.
 */
export const ACCESS_FORM = { endpoint: SITE.appUrl ? `${SITE.appUrl}/v1/access-requests` : (null as string | null) };

/** The three stages the apps go through, in order. */
export type Stage = "alpha" | "beta" | "public release";
export const STAGE_ORDER: Stage[] = ["alpha", "beta", "public release"];

/** Where the project is now. The stepper, the hero and the download cards all follow this. */
export const CURRENT_STAGE: Stage = "beta";

/** A stage's place in the stepper: finished, the one we're in, or still to come. */
export function stageStatus(stage: Stage): "done" | "now" | "next" {
  const here = STAGE_ORDER.indexOf(stage);
  const now = STAGE_ORDER.indexOf(CURRENT_STAGE);
  return here < now ? "done" : here === now ? "now" : "next";
}

export interface StoreLink {
  label: string;
  store: "google-play" | "app-store" | "testflight" | "apk";
  href: string | null;
  /** Shown beside the label, e.g. an APK's version and size: "0.2.0 · 112 MB". */
  detail?: string;
  /** For an APK: that app's file from the newest GitHub release, found when the page opens. Replaces `href` and `detail`. */
  latest?: "phone" | "watch";
}

export interface Download {
  stage: Stage;
  title: string;
  /** One line for the stepper: what this stage adds. */
  step: string;
  summary: string;
  /** Who can get it. */
  audience: string;
  links: StoreLink[];
}

export const DOWNLOADS: Download[] = [
  {
    stage: "alpha",
    title: "Alpha",
    step: "",
    summary: "The watch and phone apps on their own: umpire on a Wear OS watch, review and export matches on your Android phone. Nothing leaves your phone unless you send it.",
    audience: "Invited umpires. Ask to join, then use the Google Play link on your phone with the same Google account, or install the APKs directly.",
    links: [
      // Play Console → Internal testing → Testers → "Join on Android" link.
      { label: "Android and Wear OS", store: "google-play", href: null },
      // From the newest GitHub release, so a new release needs no change here.
      { label: "Phone app (APK)", store: "apk", href: null, latest: "phone" },
      { label: "Watch app (APK)", store: "apk", href: null, latest: "watch" },
    ],
  },
  {
    stage: "beta",
    title: "Beta",
    step: "",
    summary:
      "Everything the alpha does, and then your account: upload a match, correct it, publish the result and share it by link or QR code. Apple Watch and iPhone join through TestFlight.",
    audience: "Invited umpires, on Android and Wear OS or on iPhone and Apple Watch. Ask to join, then install from Google Play or TestFlight, or install the APKs directly.",
    links: [
      // Play Console -> Internal testing -> Testers -> "Join on Android" link.
      { label: "Android and Wear OS", store: "google-play", href: null },
      { label: "iPhone and Apple Watch", store: "testflight", href: null },
      // From the newest GitHub release, so a new release needs no change here.
      { label: "Phone app (APK)", store: "apk", href: null, latest: "phone" },
      { label: "Watch app (APK)", store: "apk", href: null, latest: "watch" },
    ],
  },
  {
    stage: "public release",
    title: "Public Release",
    step: "",
    summary: "The finished apps and website for everyone: no invitation, published results for players and clubs, and club pages kept up to date by the clubs themselves.",
    audience: "Every umpire and club.",
    links: [
      { label: "Google Play", store: "google-play", href: null },
      { label: "App Store", store: "app-store", href: null },
    ],
  },
];

/**
 * What umpires say. Only real, attributable quotes go here, with the umpire's
 * permission; while it's empty the page says the testing is still private
 * instead of showing anything made up.
 */
export interface Testimonial {
  quote: string;
  /** Who said it, as they want to be credited, e.g. "Sam, L2 umpire". */
  name: string;
  detail?: string;
}

export const TESTIMONIALS: Testimonial[] = [];

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: Faq[] = [
  {
    question: "What do I need to use it?",
    answer:
      "A Wear OS 3 watch or later (Samsung Galaxy Watch 4 and newer, or a Google Pixel Watch) with an Android phone. The Apple Watch app needs watchOS 10 (Series 4 and newer) with an iPhone, and is in testing through TestFlight.",
  },
  {
    question: "Does it need a signal at the ground?",
    answer:
      "No. The watch runs the whole match offline, and the finished match moves to your phone over the watch's own connection to it. Nothing is uploaded unless you ask, and if there's no signal it goes as soon as there is.",
  },
  {
    question: "What does it cost?",
    answer: "Nothing to take part in the testing, and nothing to pay for the apps while they're in it.",
  },
  {
    question: "My watch's buttons don't work with apps. Can I still use it?",
    answer:
      "Yes. Turn on Start/stop on screen in the watch app's settings and the Timing page gets its own button, which is how a Pixel Watch is used. On an Apple Watch the button is always on screen, and a double-tap presses it on a Series 9, Ultra 2 or later.",
  },
  {
    question: "Who can see the matches I record?",
    answer:
      "They stay on your watch and your phone until you upload one. An uploaded match is a draft that only you and your fellow umpire can see; it becomes public when you publish it, and you can share it with a link or a QR code. There's no advertising and no tracking.",
  },
  {
    question: "Is this an official England Hockey or FIH app?",
    answer:
      "No. It's an independent project, built with umpires. It follows the FIH rules for cards and suspensions, and the red card report is laid out so you can copy it into England Hockey's own form.",
  },
  {
    question: "How do I follow what's being built?",
    answer:
      "The project board on GitHub shows what's in progress and what's next, the repository has every change, and the documentation covers each app in detail. All three are linked from this page.",
  },
];
