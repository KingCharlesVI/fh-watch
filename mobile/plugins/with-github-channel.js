const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Where the Android app comes from (EXPO_PUBLIC_CHANNEL; see src/config.ts). Google Play
 * updates its own apps, and doesn't allow apps from it to install anything, so only a
 * GitHub build (an APK from the releases page) asks to install apps: its own updates
 * and the watch's. Play builds have the permission taken out, in case android/ was
 * last generated for GitHub (prebuild without --clean keeps what's there).
 */
const PERMISSION = "android.permission.REQUEST_INSTALL_PACKAGES";

module.exports = function withGithubChannel(config) {
  const github = process.env.EXPO_PUBLIC_CHANNEL === "github";
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const permissions = (manifest["uses-permission"] ?? []).filter((p) => p.$["android:name"] !== PERMISSION);
    if (github) permissions.push({ $: { "android:name": PERMISSION } });
    manifest["uses-permission"] = permissions;
    return mod;
  });
};
