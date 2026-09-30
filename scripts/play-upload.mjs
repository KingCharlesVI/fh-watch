#!/usr/bin/env node
// Uploads the phone and Wear OS bundles to a Google Play testing track, like `pnpm release:ios`
// does for TestFlight. Build them first with `pnpm release:android`.
//
//   pnpm release:play                  both bundles to internal testing
//   pnpm release:play --track closed   closed testing (the beta); also: open, internal
//
// Options:
//   --track <internal|closed|open>   which testing track (default internal)
//   --beta                           upload the phone bundle built with --beta
//   --draft                          create the releases as drafts, to roll out in Play Console
//   --dry-run                        upload and check everything, then throw it away: nothing is released
//
// The watch bundle goes to the same track on the Wear OS form factor (e.g. wear:internal).
// Signs in with a Google Cloud service account's JSON key: FH_PLAY_KEY, or ~/.fh/play-service-account.json
// (see docs/play-store.md, "Uploading from the command line"). The version and build come from version.json,
// and the release notes from dist/play/release-notes-<tag>.md, which `pnpm release:github` writes.

import { createReadStream, existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { androidpublisher, auth } from "@googleapis/androidpublisher";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACKAGE = "com.fhmatchcentre.app";
const TRACKS = { internal: "internal", closed: "alpha", open: "beta" };
/** Play's limit on release notes, per language. */
const NOTES_LIMIT = 500;

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--") && a !== "--track"));
const trackArg = argv.includes("--track") ? argv[argv.indexOf("--track") + 1] : "internal";
for (const f of flags) {
  if (!["--beta", "--draft", "--dry-run"].includes(f)) fail(`Unknown option ${f}. The options are listed at the top of scripts/play-upload.mjs.`);
}
if (!(trackArg in TRACKS)) fail(`--track must be internal, closed or open, not ${trackArg}.`);

function fail(message) {
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
}
const say = (message) => console.log(`\n\x1b[1m==> ${message}\x1b[0m`);

const stage = flags.has("--beta") ? "beta" : "alpha";
const dryRun = flags.has("--dry-run");
const release = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));
const tag = `${release.version}-${release.build}`;
const out = join(ROOT, "dist", "play");
const phone = { file: join(out, `fh-match-centre-phone-${tag}-${stage}.aab`), versionCode: release.build, track: TRACKS[trackArg] };
const watch = { file: join(out, `fh-match-centre-watch-${tag}.aab`), versionCode: 1_000_000 + release.build, track: `wear:${TRACKS[trackArg]}` };
for (const b of [phone, watch]) {
  if (!existsSync(b.file)) fail(`${b.file} isn't there. Build both bundles for this build first: pnpm release:android${stage === "beta" ? " --beta" : ""}`);
}

const keyFile = process.env.FH_PLAY_KEY ?? join(homedir(), ".fh", "play-service-account.json");
if (!existsSync(keyFile)) fail(`No service account key at ${keyFile}. Set FH_PLAY_KEY, or see docs/play-store.md ("Uploading from the command line").`);

/**
 * The GitHub release's features and fixes as plain text, cut to Play's limit (testers don't
 * need the docs and chores); a plain line if there are none.
 */
function releaseNotes() {
  const releaseTag = `v${release.version}-${stage}.${release.build}`;
  const file = join(out, `release-notes-${releaseTag}.md`);
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [];
  const kept = [];
  let keep = false;
  for (const line of lines) {
    const heading = /^###\s*\S*\s*(.*)$/.exec(line);
    if (heading) {
      keep = /features|bug fixes/i.test(heading[1]);
      if (keep) kept.push("", heading[1]);
    } else if (keep && line.startsWith("- ")) {
      kept.push(line.replace(/\*\(([^)]*)\)\*/g, "($1)").replace(/\*\*/g, ""));
    }
  }
  const text = kept.join("\n").trim() || `Build ${release.build}.`;
  return text.length <= NOTES_LIMIT ? text : `${text.slice(0, NOTES_LIMIT - 2).replace(/\n[^\n]*$/, "")}\n…`;
}

const notes = releaseNotes();
const play = androidpublisher({
  version: "v3",
  auth: new auth.GoogleAuth({ keyFile, scopes: ["https://www.googleapis.com/auth/androidpublisher"] }),
});

say(`${dryRun ? "Checking" : "Uploading"} build ${release.build} (${release.version}) for ${trackArg} testing`);
const { data: edit } = await play.edits.insert({ packageName: PACKAGE });
const editId = edit.id;
try {
  for (const b of [phone, watch]) {
    console.log(`Uploading ${b.file}`);
    const { data } = await play.edits.bundles.upload(
      { packageName: PACKAGE, editId, media: { mimeType: "application/octet-stream", body: createReadStream(b.file) } },
      // Bundles take a while on a slow connection.
      { timeout: 10 * 60 * 1000 },
    );
    if (data.versionCode !== b.versionCode) fail(`Expected version code ${b.versionCode}, but the bundle has ${data.versionCode}.`);
    await play.edits.tracks.update({
      packageName: PACKAGE,
      editId,
      track: b.track,
      requestBody: {
        track: b.track,
        releases: [
          {
            name: `${release.version} (${release.build})`,
            versionCodes: [String(b.versionCode)],
            status: flags.has("--draft") ? "draft" : "completed",
            releaseNotes: [{ language: "en-GB", text: notes }],
          },
        ],
      },
    });
    console.log(`  version code ${b.versionCode} → ${b.track}`);
  }
  if (dryRun) {
    await play.edits.validate({ packageName: PACKAGE, editId });
    await play.edits.delete({ packageName: PACKAGE, editId });
    say("Everything checks out. Nothing was released (--dry-run).");
  } else {
    await play.edits.commit({ packageName: PACKAGE, editId });
    say(`Released to ${trackArg} testing${flags.has("--draft") ? " as drafts: roll them out in Play Console" : ""}.`);
    console.log("Testers get it from Google Play once Google has processed it, usually within minutes for internal testing.");
  }
  console.log(`\nRelease notes:\n${notes}`);
} catch (err) {
  await play.edits.delete({ packageName: PACKAGE, editId }).catch(() => {});
  const message = err?.response?.data?.error?.message ?? err?.message ?? String(err);
  if (/draft app/i.test(message)) fail(`${message}\nThe app hasn't been published on any track yet, so Play only takes drafts: add --draft.`);
  fail(`Google Play refused it: ${message}`);
}
