import type { ExpoConfig } from "expo/config";

// EXPO_PUBLIC_* values are baked into the app at build time.
// Development default: the Android emulator reaches this PC's API at 10.0.2.2.
const config: ExpoConfig = {
  name: "FH Match Centre",
  slug: "fh-match-centre",
  scheme: "fhmatchcentre",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: "com.fhmatchcentre.app",
    supportsTablet: false,
  },
  android: {
    package: "com.fhmatchcentre.app",
  },
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-sqlite",
    "expo-secure-store",
    ["expo-notifications", { color: "#1f6f43" }],
    "./plugins/with-cmake-version",
  ],
  experiments: { typedRoutes: true },
  extra: {
    // Set once an Expo (EAS) project exists; push notifications need it.
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
};

export default config;
