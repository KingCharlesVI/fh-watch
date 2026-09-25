const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Signs release builds with the upload key, read from Gradle properties kept
 * outside the repository (usually ~/.gradle/gradle.properties):
 *
 *   FH_UPLOAD_STORE_FILE, FH_UPLOAD_STORE_PASSWORD, FH_UPLOAD_KEY_ALIAS, FH_UPLOAD_KEY_PASSWORD
 *
 * The Wear OS app reads the same properties: the phone and watch apps must be
 * signed with the same key for the Wearable Data Layer to connect them. Without
 * the properties, release builds fall back to the debug key (fine for trying a
 * release build, refused by Google Play).
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes("FH_UPLOAD_STORE_FILE")) return mod;

    gradle = gradle.replace(
      /signingConfigs \{\n(\s+)debug \{/,
      (_, indent) =>
        `signingConfigs {\n${indent}release {\n${indent}    if (project.hasProperty('FH_UPLOAD_STORE_FILE')) {\n` +
        `${indent}        storeFile file(FH_UPLOAD_STORE_FILE)\n${indent}        storePassword FH_UPLOAD_STORE_PASSWORD\n` +
        `${indent}        keyAlias FH_UPLOAD_KEY_ALIAS\n${indent}        keyPassword FH_UPLOAD_KEY_PASSWORD\n${indent}    }\n${indent}}\n${indent}debug {`,
    );
    gradle = gradle.replace(
      /(release \{\n(?:\s*\/\/[^\n]*\n)*\s*)signingConfig signingConfigs\.debug/,
      "$1signingConfig project.hasProperty('FH_UPLOAD_STORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    if (!gradle.includes("signingConfigs.release : signingConfigs.debug")) {
      throw new Error("with-release-signing: the app's build.gradle has changed shape; update the plugin.");
    }
    mod.modResults.contents = gradle;
    return mod;
  });
};
