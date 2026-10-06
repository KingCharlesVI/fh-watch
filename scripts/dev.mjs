#!/usr/bin/env node
// Starts development servers, with each one's output prefixed and Ctrl+C stopping them all.
//
//   pnpm dev                      everything: API, website and phone app
//   pnpm dev api web              just those (any of: api, web, mobile, watch)
//   pnpm dev watch                the Wear OS app: builds, installs and opens it, then shows its log
//   pnpm dev --seed               also reset the demo data (password demo-password-123)
//   pnpm dev mobile --build       rebuild and reinstall the phone app (after native changes)
//
// Before starting, it checks PostgreSQL is reachable, applies migrations, keeps
// packages/shared compiled (the website uses its build), and for the phone app
// starts the Android emulator and installs the development build if needed.
// Phone and watch each get their own emulator, told apart by the device type.

import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { WIN, androidSdk, exe, javaHome } from "./lib/android.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGETS = ["api", "web", "mobile", "watch"];
/** What a bare `pnpm dev` starts. The watch is separate: a second emulator is heavy. */
const DEFAULT_TARGETS = ["api", "web", "mobile"];
const COLORS = { api: 36, web: 35, mobile: 33, shared: 34, emulator: 32, watch: 92 };
const APP_ID = "com.fhmatchcentre.app";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const picked = args.filter((a) => !a.startsWith("--"));
for (const a of picked) {
  if (!TARGETS.includes(a)) {
    console.error(`Unknown component "${a}". Choose from: ${TARGETS.join(", ")}.`);
    process.exit(2);
  }
}
const want = new Set(picked.length ? picked : DEFAULT_TARGETS);

const children = [];
let stopping = false;

const tag = (name) => `\x1b[${COLORS[name] ?? 37}m${name.padEnd(8)}\x1b[0m`;
const log = (name, message) => console.log(`${tag(name)} ${message}`);
const fail = (message) => {
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
};

/** pnpm is a .cmd file on Windows, which only starts through a shell, given as one command line. */
function command(cmd, cmdArgs) {
  return WIN && cmd === "pnpm" ? [[cmd, ...cmdArgs].join(" "), [], true] : [cmd, cmdArgs, false];
}

/** Runs a command to completion. */
function runSync(cmd, cmdArgs, options = {}) {
  const [file, argv, shell] = command(cmd, cmdArgs);
  const r = spawnSync(file, argv, { cwd: ROOT, stdio: "inherit", shell, ...options });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} failed.`);
}

/** Starts a long-running process whose output lines are prefixed with its name. */
function start(name, cmd, cmdArgs, options = {}) {
  const [file, argv, shell] = command(cmd, cmdArgs);
  const child = spawn(file, argv, {
    cwd: ROOT,
    env: { ...process.env, FORCE_COLOR: "1", ...options.env },
    shell,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [child.stdout, child.stderr]) {
    let partial = "";
    stream.on("data", (chunk) => {
      const lines = (partial + chunk.toString()).split(/\r?\n/);
      partial = lines.pop();
      for (const line of lines) console.log(`${tag(name)} ${line}`);
    });
  }
  child.on("exit", (code) => {
    if (stopping) return;
    log(name, code === 0 ? "finished." : `\x1b[31mstopped (exit ${code}).\x1b[0m`);
    if (options.essential !== false && code !== 0) stopAll(1);
  });
  children.push(child);
  return child;
}

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // A plain kill leaves pnpm's grandchildren (the actual servers) running on Windows.
    if (WIN) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGINT");
  }
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

// ------------------------------------------------------------------ checks

function readEnv(file) {
  return existsSync(file) ? Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]])) : {};
}

function reachable(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 3000 });
    socket.on("connect", () => (socket.destroy(), resolve(true)));
    socket.on("error", () => resolve(false));
    socket.on("timeout", () => (socket.destroy(), resolve(false)));
  });
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs);
  }
  return newest;
}

async function prepareApi() {
  const envFile = join(ROOT, "api", ".env");
  if (!existsSync(envFile)) fail("api/.env is missing. Copy api/.env.example to api/.env and fill in the database password (see README).");
  const url = new URL(readEnv(envFile).DATABASE_URL ?? "postgres://localhost:5432/");
  if (!(await reachable(url.hostname, Number(url.port || 5432)))) {
    fail(`PostgreSQL isn't answering on ${url.hostname}:${url.port || 5432}. Start its service (on Windows: services.msc → postgresql-x64-…).`);
  }
  log("api", "applying migrations");
  runSync("pnpm", ["--filter", "@fh/api", "db:migrate"]);
  if (flags.has("--seed")) {
    log("api", "resetting demo data");
    runSync("pnpm", ["--filter", "@fh/api", "db:seed"]);
  }
}

function prepareShared() {
  const shared = join(ROOT, "packages", "shared");
  const dist = join(shared, "dist");
  if (!existsSync(dist) || newestMtime(join(shared, "src")) > newestMtime(dist)) {
    log("shared", "compiling packages/shared");
    runSync("pnpm", ["--filter", "@fh/shared", "build"]);
  }
}

// ------------------------------------------------------------------ Android

function adb(sdk, serial, ...adbArgs) {
  return spawnSync(join(sdk, "platform-tools", exe("adb")), [...(serial ? ["-s", serial] : []), ...adbArgs], { encoding: "utf8" });
}

/** Connected devices and emulators, each marked as a watch or not. */
function onlineDevices(sdk) {
  return adb(sdk, null, "devices").stdout.split(/\r?\n/).slice(1)
    .filter((l) => /\tdevice$/.test(l))
    .map((l) => l.split("\t")[0])
    .map((serial) => ({ serial, watch: adb(sdk, serial, "shell", "getprop", "ro.build.characteristics").stdout.includes("watch") }));
}

/** A running device of the right kind, starting an emulator for it if there's none. */
async function device(sdk, wantWatch) {
  const kind = wantWatch ? "Wear OS" : "phone";
  const found = onlineDevices(sdk).find((d) => d.watch === wantWatch);
  if (found) return found.serial;

  const emulator = join(sdk, "emulator", exe("emulator"));
  const avds = spawnSync(emulator, ["-list-avds"], { encoding: "utf8" }).stdout.split(/\r?\n/).filter(Boolean);
  const avd = avds.find((a) => /wear/i.test(a) === wantWatch);
  if (!avd) fail(`No ${kind} emulator found. Create one in Android Studio (Device Manager), or connect a ${wantWatch ? "watch" : "phone"} with debugging on.`);
  const before = new Set(onlineDevices(sdk).map((d) => d.serial));
  log("emulator", `starting ${avd}`);
  spawn(emulator, ["-avd", avd], { detached: true, stdio: "ignore" }).unref();
  const until = Date.now() + 240_000;
  for (;;) {
    if (Date.now() > until) fail(`The ${kind} emulator didn't finish starting within 4 minutes.`);
    await new Promise((r) => setTimeout(r, 2000));
    const serial = onlineDevices(sdk).map((d) => d.serial).find((s) => !before.has(s));
    if (serial && adb(sdk, serial, "shell", "getprop", "sys.boot_completed").stdout.trim() === "1") {
      log("emulator", `${avd} ready`);
      return serial;
    }
  }
}

/** Opens the development app on the phone, pointed at Metro, once Metro is up. */
async function openApp(sdk, serial) {
  const until = Date.now() + 120_000;
  while (Date.now() < until) {
    try {
      if ((await fetch("http://localhost:8081/status")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  const url = `fhmatchcentre://expo-development-client/?url=${encodeURIComponent("http://10.0.2.2:8081")}`;
  // A fresh start: an app still attached to an earlier Metro can hang at "Bundling 99%".
  adb(sdk, serial, "shell", "am", "force-stop", APP_ID);
  adb(sdk, serial, "shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `"${url}"`, APP_ID);
  log("mobile", "opened the app on the emulator");
}

async function prepareAndroid() {
  const sdk = androidSdk();
  if (!sdk) fail("Couldn't find the Android SDK. Install Android Studio, or set ANDROID_HOME.");
  const envFile = join(ROOT, "mobile", ".env");
  if (!existsSync(envFile)) {
    copyFileSync(join(ROOT, "mobile", ".env.example"), envFile);
    log("mobile", "created mobile/.env from .env.example");
  }
  const serial = await device(sdk, false);
  const installed = adb(sdk, serial, "shell", "pm", "list", "packages", APP_ID).stdout.includes(APP_ID);
  // Expo chooses a device by name: the AVD's name for an emulator, the model for a phone.
  const avdName = adb(sdk, serial, "emu", "avd", "name").stdout.split(/\r?\n/)[0].trim();
  const name = avdName && avdName !== "KO" ? avdName : adb(sdk, serial, "shell", "getprop", "ro.product.model").stdout.trim();
  return { sdk, serial, name, build: flags.has("--build") || !installed };
}

/** What Gradle needs: the SDK, a modern JDK, and which device to install on. */
function buildEnv(sdk, serial) {
  const java = javaHome();
  return { ANDROID_HOME: sdk, ANDROID_SERIAL: serial, ...(java ? { JAVA_HOME: java } : {}) };
}

/** Builds the Wear OS app, installs it on the watch emulator and opens it. */
async function prepareWatch() {
  const sdk = androidSdk();
  if (!sdk) fail("Couldn't find the Android SDK. Install Android Studio, or set ANDROID_HOME.");
  const java = javaHome();
  if (!java) fail("Couldn't find a JDK. Install Android Studio, or set JAVA_HOME.");
  const serial = await device(sdk, true);
  log("watch", "building and installing the watch app");
  const gradle = join(ROOT, "watch-wear", WIN ? "gradlew.bat" : "gradlew");
  // The GitHub build, as sideloaded watches have. installGithubDebug installs on every device unless ANDROID_SERIAL names one.
  const r = spawnSync(WIN ? `"${gradle}" --quiet :app:installGithubDebug` : gradle, WIN ? [] : ["--quiet", ":app:installGithubDebug"], {
    cwd: join(ROOT, "watch-wear"),
    stdio: "inherit",
    shell: WIN,
    env: { ...process.env, ...buildEnv(sdk, serial) },
  });
  if (r.status !== 0) fail("The watch app didn't build.");
  adb(sdk, serial, "shell", "am", "start", "-n", `${APP_ID}/com.fhmatchcentre.watch.MainActivity`);
  log("watch", "opened the app on the watch emulator. Its log follows.");
  return { sdk, serial };
}

// ------------------------------------------------------------------ main

if (want.has("api")) await prepareApi();
if (want.has("web")) prepareShared();
const android = want.has("mobile") ? await prepareAndroid() : null;
const watch = want.has("watch") ? await prepareWatch() : null;

if (want.has("api")) start("api", "pnpm", ["--filter", "@fh/api", "dev"]);
if (want.has("web")) {
  start("shared", "pnpm", ["--filter", "@fh/shared", "exec", "tsc", "-p", "tsconfig.build.json", "--watch", "--preserveWatchOutput"]);
  start("web", "pnpm", ["--filter", "@fh/web", "dev"]);
}
if (want.has("mobile")) {
  if (android.build) {
    // expo run:android only generates android/ when it is missing, so config changes (fonts, icons,
    // plugins in app.config.ts) would otherwise never reach the build.
    log("mobile", "updating the native project from app.config.ts");
    runSync("pnpm", ["--filter", "@fh/mobile", "exec", "expo", "prebuild", "--platform", "android", "--no-install"]);
    log("mobile", "building and installing the development app (a few minutes the first time)");
  }
  // ANDROID_SERIAL makes Expo and adb use the phone, not a watch that's also connected.
  const mobileArgs = android.build ? ["android", "--device", android.name] : ["start"];
  start("mobile", "pnpm", ["--filter", "@fh/mobile", ...mobileArgs], { env: buildEnv(android.sdk, android.serial) });
  // `expo run:android` opens the app itself.
  if (!android.build) void openApp(android.sdk, android.serial);
}
if (watch) {
  start("watch", join(watch.sdk, "platform-tools", exe("adb")), ["-s", watch.serial, "logcat", "-v", "time", "WatchSync:V", "AndroidRuntime:E", "*:S"]);
}

const urls = [
  want.has("api") && "API http://127.0.0.1:3001/v1/docs",
  want.has("web") && "website http://localhost:3000",
  want.has("mobile") && "phone app on the emulator",
  want.has("watch") && "watch app on the Wear OS emulator",
].filter(Boolean);
log("dev", `starting ${urls.join(", ")}. Ctrl+C stops everything.`);
