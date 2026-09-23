const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Builds the app's native code with a newer CMake, whose Ninja can handle
 * Windows paths over 260 characters (the default 3.22.1's Ninja can't, and
 * React Native's generated code paths are longer than that). Needs Windows
 * long paths enabled; the Android Gradle plugin downloads this CMake itself.
 */
const CMAKE_VERSION = "3.31.6";

module.exports = function withCmakeVersion(config) {
  return withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes("externalNativeBuild { cmake { version")) {
      mod.modResults.contents += `\nandroid { externalNativeBuild { cmake { version "${CMAKE_VERSION}" } } }\n`;
    }
    return mod;
  });
};
