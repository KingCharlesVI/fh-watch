import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExpoConfig } from "expo/config";

/**
 * The release number shared with the Wear OS app (version.json at the repository
 * root). Bump "build" for every upload to Google Play; the watch app's build
 * number is 1,000,000 higher, because the two share one Play listing and every
 * version code in it must be unique.
 */
const release = JSON.parse(readFileSync(join(__dirname, "..", "version.json"), "utf8")) as { version: string; build: number };
// CI builds number themselves (FH_BUILD_NUMBER, the workflow's run number), so each APK installs over the last.
if (process.env.FH_BUILD_NUMBER) release.build = Number(process.env.FH_BUILD_NUMBER);

/**
 * What's new (Settings → About, and once after each update): the newest 12 entries of the
 * repository's CHANGELOG.md, which git-cliff writes at each release. The app reads them in
 * src/core/changelog.ts.
 */
const changelogFile = readFileSync(join(__dirname, "..", "CHANGELOG.md"), "utf8");
const entryStarts = [...changelogFile.matchAll(/^## \[/gm)].map((m) => m.index);
const changelog = entryStarts.length > 12 ? changelogFile.slice(0, entryStarts[12]) : changelogFile;

/**
 * The Expo (EAS) project, for iPhone builds and push notifications. `npx eas-cli init` (in
 * mobile/) created it and printed this ID; it isn't a secret. EAS_PROJECT_ID overrides it.
 */
const EAS_PROJECT_ID = process.env.EAS_PROJECT_ID ??"891c69b0-c444-4e39-8166-7b2a10b8559b";

// EXPO_PUBLIC_* values are baked into the app at build time.
// Development default: the Android emulator reaches this PC's API at 10.0.2.2.
const config: ExpoConfig = {
  name: "FH Match Centre",
  slug: "fh-match-centre",
  scheme: "fhmatchcentre",
  version: release.version,
  orientation: "portrait",
  // Temporary icon until the beta brand: see assets/icon-source.svg and scripts/render-icons.mjs.
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.fhmatchcentre.app",
    // For signing local builds on a Mac, the watch app included; EAS Build finds the team itself.
    appleTeamId: process.env.APPLE_TEAM_ID,
    buildNumber: String(release.build),
    supportsTablet: false,
    // Only standard HTTPS, so App Store Connect doesn't ask about encryption for every build.
    config: { usesNonExemptEncryption: false },
  },
  android: {
    package: "com.fhmatchcentre.app",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      monochromeImage: "./assets/adaptive-monochrome.png",
      backgroundColor: "#106C3E",
    },
    versionCode: release.build,
  },
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-sqlite",
    "expo-secure-store",
    ["expo-notifications", { color: "#1f6f43" }],
    "expo-sharing",
    [
      // The website's type: Archivo for text, in four weights (one family, so fontWeight works on
      // Android too), and cut at the site's other widths for scores, section titles and page
      // titles; JetBrains Mono for clock times. Static cuts of the variable fonts (see theme.ts).
      "expo-font",
      {
        android: {
          fonts: [
            {
              fontFamily: "Archivo",
              fontDefinitions: [
                { path: "./assets/fonts/Archivo_400Regular.ttf", weight: 400 },
                { path: "./assets/fonts/Archivo_500Medium.ttf", weight: 500 },
                { path: "./assets/fonts/Archivo_600SemiBold.ttf", weight: 600 },
                { path: "./assets/fonts/Archivo_700Bold.ttf", weight: 700 },
              ],
            },
            { fontFamily: "ArchivoScore", fontDefinitions: [{ path: "./assets/fonts/ArchivoScore_800ExtraBold.ttf", weight: 800 }] },
            { fontFamily: "ArchivoSection", fontDefinitions: [{ path: "./assets/fonts/ArchivoSection_800ExtraBold.ttf", weight: 800 }] },
            { fontFamily: "ArchivoTitle", fontDefinitions: [{ path: "./assets/fonts/ArchivoTitle_800ExtraBold.ttf", weight: 800 }] },
            {
              fontFamily: "JetBrainsMono",
              fontDefinitions: [
                { path: "./assets/fonts/JetBrainsMono_500Medium.ttf", weight: 500 },
                { path: "./assets/fonts/JetBrainsMono_600SemiBold.ttf", weight: 600 },
              ],
            },
          ],
        },
        ios: {
          fonts: [
            "./assets/fonts/Archivo_400Regular.ttf",
            "./assets/fonts/Archivo_500Medium.ttf",
            "./assets/fonts/Archivo_600SemiBold.ttf",
            "./assets/fonts/Archivo_700Bold.ttf",
            "./assets/fonts/ArchivoScore_800ExtraBold.ttf",
            "./assets/fonts/ArchivoSection_800ExtraBold.ttf",
            "./assets/fonts/ArchivoTitle_800ExtraBold.ttf",
            "./assets/fonts/JetBrainsMono_500Medium.ttf",
            "./assets/fonts/JetBrainsMono_600SemiBold.ttf",
          ],
        },
      },
    ],
    // The Apple Watch app: every folder in targets/ with an expo-target.config (see targets/watch).
    "@bacons/apple-targets",
    "./plugins/with-cmake-version",
    "./plugins/with-release-signing",
    "./plugins/with-github-channel",
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: EAS_PROJECT_ID ? { projectId: EAS_PROJECT_ID } : undefined,
    changelog,
  },
};

export default config;
