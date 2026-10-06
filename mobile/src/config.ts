/**
 * Which stage this build is for, baked in at build time (EXPO_PUBLIC_* values are).
 * - alpha: the watch and this phone only. No account, nothing sent anywhere;
 *   matches are saved on the phone and exported as files.
 * - beta: with the API and website: sign-in, uploads, publishing and sharing links.
 * Unset means alpha, so a build never talks to a server by accident.
 */
export const STAGE: "alpha" | "beta" = process.env.EXPO_PUBLIC_STAGE === "beta" ? "beta" : "alpha";
export const ONLINE = STAGE === "beta";

/**
 * Where the Android app comes from, baked in at build time. Google Play updates its own
 * copy; a GitHub build (an APK from the releases page) finds, downloads and installs its
 * updates itself, and the watch's. Unset (development, iPhone) counts as Play: no GitHub updates.
 */
export const CHANNEL: "play" | "github" = process.env.EXPO_PUBLIC_CHANNEL === "github" ? "github" : "play";

// Set in mobile/.env (development) or the build environment (releases).
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "https://app.fhmatchcentre.com").replace(/\/$/, "");
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "https://app.fhmatchcentre.com").replace(/\/$/, "");
