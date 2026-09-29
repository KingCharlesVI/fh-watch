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
      // Geist, the website's typeface. One family with four weights, so fontWeight works on Android too.
      "expo-font",
      {
        android: {
          fonts: [
            {
              fontFamily: "Geist",
              fontDefinitions: [
                { path: "./assets/fonts/Geist_400Regular.ttf", weight: 400 },
                { path: "./assets/fonts/Geist_500Medium.ttf", weight: 500 },
                { path: "./assets/fonts/Geist_600SemiBold.ttf", weight: 600 },
                { path: "./assets/fonts/Geist_700Bold.ttf", weight: 700 },
              ],
            },
          ],
        },
        ios: {
          fonts: ["./assets/fonts/Geist_400Regular.ttf", "./assets/fonts/Geist_500Medium.ttf", "./assets/fonts/Geist_600SemiBold.ttf", "./assets/fonts/Geist_700Bold.ttf"],
        },
      },
    ],
    "./plugins/with-cmake-version",
    "./plugins/with-release-signing",
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Set once an Expo (EAS) project exists; push notifications need it.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
