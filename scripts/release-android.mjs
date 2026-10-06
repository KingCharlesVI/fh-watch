#!/usr/bin/env node
// Builds the Android App Bundles to upload to Google Play: the phone app and the Wear OS app.
//
//   pnpm release:android   both; the phone app as the alpha (watch and phone only)
//   pnpm release:phone     just the phone app   (the same as: pnpm release:android phone)
//   pnpm release:watch     just the Wear OS app (the same as: pnpm release:android watch)
//
// Options, for any of them:
//   --beta        the phone app with the API and website (see mobile/src/config.ts)
//   --bump        add 1 to the build number in version.json first
//   --apk         also build the GitHub APKs, which install straight onto a device and update
//                 themselves from GitHub releases (the bundles are for Google Play, which updates them)
//   --debug-key   sign with the debug key when there's no upload key (Google Play refuses these)
//
// Both are signed with the upload key named in ~/.gradle/gradle.properties (see docs/play-store.md).
// Everything lands in dist/play/.

import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WIN, androidSdk, javaHome } from "./lib/android.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const stage = args.has("--beta") ? "beta" : "alpha";
// Naming neither app means both.
const buildPhone = args.has("phone") || !args.has("watch");
const buildWatch = args.has("watch") || !args.has("phone");
const apk = args.has("--apk");
const KNOWN = new Set(["phone", "watch", "--beta", "--bump", "--apk", "--debug-key"]);
for (const a of args) {
  if (!KNOWN.has(a)) {
    console.error(`Unknown option ${a}. The options are listed at the top of scripts/release-android.mjs.`);
    process.exit(1);
  }
}

const fail = (message) => {
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
};
const say = (message) => console.log(`\n\x1b[1m==> ${message}\x1b[0m`);

const versionFile = join(ROOT, "version.json");
const release = JSON.parse(readFileSync(versionFile, "utf8"));
// FH_BUILD_NUMBER overrides the build number, e.g. from a CI server; app.config.ts and the watch's Gradle read it too.
if (process.env.FH_BUILD_NUMBER) {
  if (args.has("--bump")) {
    console.error("FH_BUILD_NUMBER is set, so --bump does nothing: leave one of them out.");
    process.exit(1);
  }
  release.build = Number(process.env.FH_BUILD_NUMBER);
}
if (args.has("--bump")) {
  release.build += 1;
  writeFileSync(versionFile, `${JSON.stringify(release, null, 2)}\n`);
}

const sdk = androidSdk();
const java = javaHome();
if (!sdk) fail("Couldn't find the Android SDK. Install Android Studio, or set ANDROID_HOME.");
if (!java) fail("Couldn't find a JDK. Install Android Studio, or set JAVA_HOME.");

// The upload key's settings, wherever Gradle would find them.
const gradleProps = join(process.env.GRADLE_USER_HOME ?? join(homedir(), ".gradle"), "gradle.properties");
const hasKey = (existsSync(gradleProps) && /^FH_UPLOAD_STORE_FILE=/m.test(readFileSync(gradleProps, "utf8"))) || !!process.env.ORG_GRADLE_PROJECT_FH_UPLOAD_STORE_FILE;
if (!hasKey) {
  if (!args.has("--debug-key")) {
    fail(`No upload key set up (FH_UPLOAD_STORE_FILE in ${gradleProps}). See docs/play-store.md.\nTo try a release build anyway, signed with the debug key (Google Play refuses those), add --debug-key.`);
  }
  console.log("\x1b[33m!! Signing with the debug key: these bundles can't go to Google Play.\x1b[0m");
}

// mobile/.env is for development, and Expo reads it for release builds too, so its
// localhost addresses would end up in the app. Set these to build against somewhere else.
const SITE = "https://app.fhmatchcentre.com";
const env = {
  ...process.env,
  ANDROID_HOME: sdk,
  JAVA_HOME: java,
  EXPO_PUBLIC_STAGE: stage,
  EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL ?? SITE,
  EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL ?? SITE,
  NODE_ENV: "production",
};

function run(cwd, cmd, cmdArgs, extraEnv = {}) {
  const runEnv = { ...env, ...extraEnv };
  // gradlew.bat and npx are .cmd/.bat files on Windows, which only start through a shell.
  const r = WIN
    ? spawnSync([cmd, ...cmdArgs].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { cwd, env: runEnv, stdio: "inherit", shell: true })
    : spawnSync(cmd, cmdArgs, { cwd, env: runEnv, stdio: "inherit" });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} failed.`);
}

/** The project's Gradle wrapper, by full path (Command Prompt doesn't always look in the working folder). */
const gradlew = (dir) => join(dir, WIN ? "gradlew.bat" : "gradlew");

const out = join(ROOT, "dist", "play");
mkdirSync(out, { recursive: true });
const tag = `${release.version}-${release.build}`;

const built = [];
const outputs = (projectDir) => join(projectDir, "app", "build", "outputs");

/** Copies a build output to dist/play/ and lists it. */
function keep(from, file, note = "") {
  copyFileSync(from, join(out, file));
  built.push(join(out, file) + note);
}

if (buildPhone) {
  const mobile = join(ROOT, "mobile");
  const android = join(mobile, "android");
  const name = `fh-match-centre-phone-${tag}-${stage}`;
  // Each prebuild regenerates android/ from app.config.ts, so the version, plugins, signing and
  // channel are current. The bundle is Google Play's; the APK is the GitHub build, which can install
  // its own updates (plugins/with-github-channel.js), so the two are built apart.
  say(`Phone app ${tag} (${stage}) for Google Play`);
  run(mobile, WIN ? "npx.cmd" : "npx", ["expo", "prebuild", "--platform", "android", "--no-install"], { EXPO_PUBLIC_CHANNEL: "play" });
  run(android, gradlew(android), ["--quiet", ":app:bundleRelease"], { EXPO_PUBLIC_CHANNEL: "play" });
  keep(join(outputs(android), "bundle", "release", "app-release.aab"), `${name}.aab`, `   (version code ${release.build})`);
  if (apk) {
    say(`Phone app ${tag} (${stage}) for GitHub`);
    run(mobile, WIN ? "npx.cmd" : "npx", ["expo", "prebuild", "--platform", "android", "--no-install"], { EXPO_PUBLIC_CHANNEL: "github" });
    run(android, gradlew(android), ["--quiet", ":app:assembleRelease"], { EXPO_PUBLIC_CHANNEL: "github" });
    keep(join(outputs(android), "apk", "release", "app-release.apk"), `${name}.apk`);
  }
}

if (buildWatch) {
  say(`Wear OS app ${tag}`);
  const watch = join(ROOT, "watch-wear");
  const name = `fh-match-centre-watch-${tag}`;
  // The play and github flavours: see watch-wear/app/build.gradle.kts.
  run(watch, gradlew(watch), ["--quiet", ":app:bundlePlayRelease", ...(apk ? [":app:assembleGithubRelease"] : [])]);
  keep(join(outputs(watch), "bundle", "playRelease", "app-play-release.aab"), `${name}.aab`, `   (version code ${1_000_000 + release.build})`);
  if (apk) keep(join(outputs(watch), "apk", "github", "release", "app-github-release.apk"), `${name}.apk`);
}

say("Ready");
for (const line of built) console.log(line);
console.log("\nUpload each .aab to its track in Play Console: the phone's to the phone track, the watch's to the Wear OS track (docs/play-store.md).");
if (apk) console.log("The .apk files install directly: adb install <file> (for the watch, with ANDROID_SERIAL set to it).");
if (buildPhone !== buildWatch) console.log("Only one app was built. Testers need the phone and watch apps from the same build, so build the other one too before releasing.");
if (!args.has("--bump")) console.log("Next time, add --bump (Google Play needs a new build number for every upload).");
