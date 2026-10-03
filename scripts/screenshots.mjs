#!/usr/bin/env node
// Takes a screenshot from every connected device at once, named for the store listing.
//
//   pnpm screenshots timing          both devices, as phone-timing.png and watch-timing.png
//   pnpm screenshots goals --watch   just the watch
//   pnpm screenshots matches --phone just the phone
//   pnpm screenshots --list          what's connected
//
// Everything lands in dist/screens/. Each shot is checked against what Google Play
// accepts for its form factor, so a listing upload doesn't come back rejected:
// phone 320-3840px a side and 16:9 or taller, Wear OS square and at least 384px
// (docs/play-store.md, "Store listing").
//
// The phone needs USB debugging on and the cable in; the watch needs wireless
// debugging and `adb connect <address>` first (the landing page's install steps
// walk through it). A device says which it is through ro.build.characteristics,
// so there's nothing to choose.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { androidSdk, exe } from "./lib/android.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist", "screens");

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const name = args.find((a) => !a.startsWith("--"));
for (const f of flags) {
  if (!["--phone", "--watch", "--list"].includes(f)) fail(`Unknown option ${f}. The options are listed at the top of scripts/screenshots.mjs.`);
}

function fail(message) {
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
}
const say = (message) => console.log(`\n\x1b[1m==> ${message}\x1b[0m`);

const sdk = androidSdk();
if (!sdk) fail("No Android SDK found. Set ANDROID_HOME.");
const adb = join(sdk, "platform-tools", exe("adb"));
if (!existsSync(adb)) fail(`No adb at ${adb}. Install the SDK's platform tools.`);

/** Runs adb against one device (or none, for global commands) and returns its output. */
function run(serial, adbArgs, { binary = false } = {}) {
  const r = spawnSync(adb, [...(serial ? ["-s", serial] : []), ...adbArgs], {
    encoding: binary ? "buffer" : "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) fail(`adb ${adbArgs.join(" ")} failed:\n${String(r.stderr ?? "")}`);
  return r.stdout;
}

/** The connected devices, each labelled phone or watch by what Android says it is. */
function devices() {
  const lines = run(null, ["devices"]).split(/\r?\n/).slice(1);
  return lines
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state === "device")
    .map(([serial]) => {
      const characteristics = run(serial, ["shell", "getprop", "ro.build.characteristics"]).trim();
      const model = run(serial, ["shell", "getprop", "ro.product.model"]).trim();
      return { serial, model, kind: characteristics.split(",").includes("watch") ? "watch" : "phone" };
    });
}

/** Width and height from a PNG's header, to check it against Play's rules. */
function size(png) {
  if (png.subarray(1, 4).toString() !== "PNG") fail("That wasn't a PNG: is the screen off, or the device locked?");
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
}

/** What Google Play will and won't take, per form factor. */
function check(kind, { width, height }) {
  const problems = [];
  const side = (n) => n >= (kind === "watch" ? 384 : 320) && n <= 3840;
  if (!side(width) || !side(height)) {
    problems.push(`each side must be ${kind === "watch" ? "384" : "320"}-3840px, and this is ${width}x${height}`);
  }
  if (kind === "watch" && width !== height) problems.push(`Wear OS screenshots must be square, and this is ${width}x${height}`);
  if (kind === "phone") {
    const ratio = Math.max(width, height) / Math.min(width, height);
    // Play asks for 16:9 or taller. A modern phone is taller than that, which is fine;
    // too square is what gets turned away (a tablet or a window that isn't full screen).
    if (ratio < 16 / 9) problems.push(`the sides are ${ratio.toFixed(2)}:1, and Play wants 16:9 (${(16 / 9).toFixed(2)}:1) or taller`);
  }
  return problems;
}

const connected = devices();
if (flags.has("--list") || !name) {
  say(connected.length ? "Connected" : "Nothing connected");
  for (const d of connected) console.log(`  ${d.kind.padEnd(5)} ${d.model} (${d.serial})`);
  if (!connected.length) {
    console.log("  Phone: USB debugging on, cable in.");
    console.log("  Watch: wireless debugging on, then adb connect <address>.");
  }
  if (!name) console.log("\nName the shot to take one, e.g. pnpm screenshots timing");
  process.exit(0);
}

if (!/^[a-z0-9][a-z0-9-]*$/.test(name)) fail(`"${name}" won't do as a file name: lower-case letters, digits and hyphens.`);
const wanted = connected.filter((d) => (flags.has("--phone") ? d.kind === "phone" : flags.has("--watch") ? d.kind === "watch" : true));
if (!wanted.length) fail("No matching device is connected. Run with --list to see what is.");

mkdirSync(OUT, { recursive: true });
say(`Taking "${name}"`);
for (const device of wanted) {
  const png = run(device.serial, ["exec-out", "screencap", "-p"], { binary: true });
  const dimensions = size(png);
  const file = join(OUT, `${device.kind}-${name}.png`);
  writeFileSync(file, png);
  const problems = check(device.kind, dimensions);
  console.log(`  ${file}  ${dimensions.width}x${dimensions.height}  ${device.model}`);
  for (const problem of problems) console.log(`\x1b[33m    Play won't take this: ${problem}\x1b[0m`);
}
