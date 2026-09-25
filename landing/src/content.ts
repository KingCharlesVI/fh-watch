/**
 * Everything on the landing page that changes as the project moves on: the
 * stage, the download links and the roadmap. Edit here and redeploy.
 *
 * A link left as null shows as "Coming soon".
 */

export const SITE = {
  name: "FH Match Centre",
  url: "https://fhmatchcentre.com",
  description: "A field hockey umpiring app for Wear OS and Apple Watch, with a phone app for match reports and, soon, published results for clubs.",
  /** Where people ask to join a test. Null hides the request buttons. */
  contactEmail: null as string | null,
};

export type Stage = "alpha" | "beta" | "release";

/** Where the project is now. */
export const CURRENT_STAGE: Stage = "alpha";

export interface StoreLink {
  label: string;
  store: "google-play" | "app-store" | "testflight" | "apk";
  href: string | null;
  /** Shown beside the label, e.g. an APK's version and size: "0.2.0 · 112 MB". */
  detail?: string;
}

export interface Download {
  stage: Stage;
  title: string;
  summary: string;
  /** Who can get it. */
  audience: string;
  links: StoreLink[];
}

export const DOWNLOADS: Download[] = [
  {
    stage: "alpha",
    title: "Alpha",
    summary: "The watch and phone apps on their own: umpire on a Wear OS watch, review and export matches on your Android phone. Nothing leaves your phone unless you send it.",
    audience: "Invited umpires. Ask to join, then use the Google Play link on your phone with the same Google account, or install the APKs directly.",
    links: [
      // Play Console → Internal testing → Testers → "Join on Android" link.
      { label: "Android and Wear OS", store: "google-play", href: null },
      // The APKs' public URLs (e.g. in the S3 bucket). Update them and `detail` for each new build.
      { label: "Phone app (APK)", store: "apk", href: "https://fhmatchcentre.s3.eu-north-1.amazonaws.com/releases/fh-match-centre-phone-0.2.0-1-alpha.apk", detail: "0.2.0 106MB" },
      { label: "Watch app (APK)", store: "apk", href: "https://fhmatchcentre.s3.eu-north-1.amazonaws.com/releases/fh-match-centre-watch-0.2.0-1.apk", detail: "0.2.0 4MB" },
    ],
  },
  {
    stage: "beta",
    title: "Beta",
    summary: "Adds your account, uploads and the website: publish results, share a link or QR code, and let clubs see their matches. Adds Apple Watch and iPhone.",
    audience: "A wider group of umpires and clubs.",
    links: [
      { label: "Android and Wear OS", store: "google-play", href: null },
      { label: "iPhone and Apple Watch", store: "testflight", href: null },
    ],
  },
  {
    stage: "release",
    title: "Public release",
    summary: "Everything from the beta, for everyone.",
    audience: "Anyone.",
    links: [
      { label: "Google Play", store: "google-play", href: null },
      { label: "App Store", store: "app-store", href: null },
    ],
  },
];

export interface RoadmapStep {
  title: string;
  status: "done" | "now" | "next" | "later";
  items: string[];
}

export const ROADMAP: RoadmapStep[] = [
  {
    title: "Foundations",
    status: "done",
    items: [
      "One match format shared by the watch, phone, server and website",
      "Wear OS umpiring app, working fully offline",
      "Phone app to review, correct and export matches",
      "Server and website, ready for the beta",
    ],
  },
  {
    title: "Alpha",
    status: "now",
    items: [
      "Real matches with invited umpires on Android and Wear OS",
      "Watch screens refined to feel like the tools umpires already know",
      "Match reports as PDF, spreadsheets and backups, straight from the phone",
    ],
  },
  {
    title: "Beta",
    status: "next",
    items: [
      "Accounts, uploads and published results on the website",
      "Share a match by link or QR code; club dashboards",
      "Apple Watch and iPhone apps",
      "Wider testing on Google Play and TestFlight",
    ],
  },
  {
    title: "Public release",
    status: "later",
    items: ["On Google Play and the App Store for every umpire and club"],
  },
];
