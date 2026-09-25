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
//   --apk         also build APKs, which install straight onto a device (adb install)
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

const env = { ...process.env, ANDROID_HOME: sdk, JAVA_HOME: java, EXPO_PUBLIC_STAGE: stage, NODE_ENV: "production" };

function run(cwd, cmd, cmdArgs) {
  // gradlew.bat and npx are .cmd/.bat files on Windows, which only start through a shell.
  const r = WIN
    ? spawnSync([cmd, ...cmdArgs].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(" "), { cwd, env, stdio: "inherit", shell: true })
    : spawnSync(cmd, cmdArgs, { cwd, env, stdio: "inherit" });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} failed.`);
}

/** The project's Gradle wrapper, by full path (Command Prompt doesn't always look in the working folder). */
const gradlew = (dir) => join(dir, WIN ? "gradlew.bat" : "gradlew");

const out = join(ROOT, "dist", "play");
mkdirSync(out, { recursive: true });
const tag = `${release.version}-${release.build}`;

const tasks = [":app:bundleRelease", ...(apk ? [":app:assembleRelease"] : [])];
const built = [];

/** Builds one app's bundle (and APK) with Gradle and copies them to dist/play/ as `name`. */
function buildApp(projectDir, name, versionCode) {
  run(projectDir, gradlew(projectDir), ["--quiet", ...tasks]);
  const outputs = join(projectDir, "app", "build", "outputs");
  const aab = join(out, `${name}.aab`);
  copyFileSync(join(outputs, "bundle", "release", "app-release.aab"), aab);
  built.push(`${aab}   (version code ${versionCode})`);
  if (apk) {
    const file = join(out, `${name}.apk`);
    copyFileSync(join(outputs, "apk", "release", "app-release.apk"), file);
    built.push(file);
  }
}

if (buildPhone) {
  say(`Phone app ${tag} (${stage})`);
  const mobile = join(ROOT, "mobile");
  // Regenerates android/ from app.config.ts, so the version, plugins and signing are current.
  run(mobile, WIN ? "npx.cmd" : "npx", ["expo", "prebuild", "--platform", "android", "--no-install"]);
  buildApp(join(mobile, "android"), `fh-match-centre-phone-${tag}-${stage}`, release.build);
}

if (buildWatch) {
  say(`Wear OS app ${tag}`);
  buildApp(join(ROOT, "watch-wear"), `fh-match-centre-watch-${tag}`, 1_000_000 + release.build);
}

say("Ready");
for (const line of built) console.log(line);
console.log("\nUpload each .aab to its track in Play Console: the phone's to the phone track, the watch's to the Wear OS track (docs/play-store.md).");
if (apk) console.log("The .apk files install directly: adb install <file> (for the watch, with ANDROID_SERIAL set to it).");
if (buildPhone !== buildWatch) console.log("Only one app was built. Testers need the phone and watch apps from the same build, so build the other one too before releasing.");
if (!args.has("--bump")) console.log("Next time, add --bump (Google Play needs a new build number for every upload).");
