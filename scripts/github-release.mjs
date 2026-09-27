#!/usr/bin/env node
// Builds both apps' APKs on this PC and publishes them as a GitHub release, with notes from git-cliff.
//
//   pnpm release:github              build, then publish
//   pnpm release:github --dry-run    build and write the notes, but publish nothing
//
// Options:
//   --skip-build   publish the APKs already in dist/play/ for this version and build
//   --beta         the phone app with the API and website (see mobile/src/config.ts)
//   --dry-run      stop before publishing: shows the tag, the notes and the files
//
// The branch decides the kind of release:
//   dev    a pre-release, tagged v<version>-<stage>.<build>   (e.g. v0.3.0-alpha.7)
//   main   a full release, tagged v<version>                  (e.g. v0.3.0)
// A pre-release's notes cover everything since the last tag of either kind; a full release's
// cover everything since the last full release, so they include all of that version's pre-releases.
//
// Needs the GitHub CLI (gh, signed in with `gh auth login`) and git-cliff. The commit must be pushed
// first: the release tags the commit that's on GitHub. The version and build come from version.json.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const KNOWN = new Set(["--skip-build", "--beta", "--dry-run"]);
for (const a of args) {
  if (!KNOWN.has(a)) {
    console.error(`Unknown option ${a}. The options are listed at the top of scripts/github-release.mjs.`);
    process.exit(1);
  }
}
const stage = args.has("--beta") ? "beta" : "alpha";
const dryRun = args.has("--dry-run");

const fail = (message) => {
  console.error(`\x1b[31m${message}\x1b[0m`);
  process.exit(1);
};
const say = (message) => console.log(`\n\x1b[1m==> ${message}\x1b[0m`);

/** Runs a command and returns what it printed; fails the script if it fails, unless `allowFail`. */
function capture(cmd, cmdArgs, { allowFail = false } = {}) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, encoding: "utf8" });
  if (r.error?.code === "ENOENT") return null;
  if (r.status !== 0 && !allowFail) fail(`${cmd} ${cmdArgs.join(" ")} failed:\n${r.stderr || r.stdout}`);
  return r.status === 0 ? r.stdout.trim() : null;
}

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: "inherit" });
  if (r.status !== 0) fail(`${cmd} ${cmdArgs.join(" ")} failed.`);
}

// ---- The tools --------------------------------------------------------------

if (capture("gh", ["--version"], { allowFail: true }) === null) {
  fail("The GitHub CLI (gh) isn't installed. On Windows: winget install GitHub.cli, then open a new terminal and run gh auth login.");
}
if (capture("gh", ["auth", "status"], { allowFail: true }) === null) fail("The GitHub CLI isn't signed in. Run gh auth login.");
if (capture("git-cliff", ["--version"], { allowFail: true }) === null) fail("git-cliff isn't installed (https://git-cliff.org/docs/installation).");

// ---- What to release --------------------------------------------------------

const branch = capture("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
if (branch !== "dev" && branch !== "main") fail(`Releases come from dev (pre-releases) or main (full releases); this is ${branch}.`);
const prerelease = branch === "dev";

// Only tracked files count: untracked ones (like CHANGELOG.md) aren't in the build's commit anyway.
if (capture("git", ["status", "--porcelain", "--untracked-files=no"])) fail("There are uncommitted changes. Commit them (and push) first, so the release matches its tag.");

capture("git", ["fetch", "--quiet", "--tags", "origin", branch]);
const head = capture("git", ["rev-parse", "HEAD"]);
const remote = capture("git", ["rev-parse", `origin/${branch}`]);
if (head !== remote) fail(`${branch} and origin/${branch} differ. Push (or pull) first: the release tags the commit that's on GitHub.`);

const release = JSON.parse(readFileSync(join(ROOT, "version.json"), "utf8"));
const tag = prerelease ? `v${release.version}-${stage}.${release.build}` : `v${release.version}`;
const title = prerelease ? `${release.version} ${stage} (build ${release.build})` : release.version;

if (capture("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], { allowFail: true }) !== null) {
  fail(
    prerelease
      ? `${tag} already exists. Add 1 to the build in version.json, commit and push, then run this again.`
      : `${tag} already exists. Change the version in version.json for a new release (e.g. 0.3.0 -> 0.3.1), commit and push, then run this again.`,
  );
}

say(`${prerelease ? "Pre-release" : "Release"} ${tag} from ${branch} (${head.slice(0, 7)})`);

// ---- The notes --------------------------------------------------------------

const out = join(ROOT, "dist", "play");
mkdirSync(out, { recursive: true });
const notes = join(out, `release-notes-${tag}.md`);
// The last release these notes follow: any tag for a pre-release, the last full release (no "-") for a
// full one, whose notes then gather every commit of its pre-releases too. None before the first release.
const since = capture("git", ["describe", "--tags", "--abbrev=0", ...(prerelease ? [] : ["--exclude", "*-*"]), "HEAD"], { allowFail: true });
// -o keeps cliff.toml's own output (CHANGELOG.md) untouched.
run("git-cliff", [
  ...(since ? [`${since}..HEAD`] : []),
  "--tag",
  tag,
  "--strip",
  "header",
  // Otherwise the pre-release tags in the range would split the notes into sections.
  ...(prerelease ? [] : ["--ignore-tags", "^v[0-9.]+-"]),
  "-o",
  notes,
]);
console.log(readFileSync(notes, "utf8"));

// ---- The APKs ---------------------------------------------------------------

const build = `${release.version}-${release.build}`;
const apks = [join(out, `fh-match-centre-phone-${build}-${stage}.apk`), join(out, `fh-match-centre-watch-${build}.apk`)];
if (!args.has("--skip-build")) {
  run(process.execPath, [join(ROOT, "scripts", "release-android.mjs"), "--apk", ...(stage === "beta" ? ["--beta"] : [])]);
}
for (const file of apks) if (!existsSync(file)) fail(`${file} is missing. Run this again without --skip-build.`);

// ---- Publish ----------------------------------------------------------------

if (dryRun) {
  say("Dry run: nothing published");
  console.log(`Would publish ${tag} ("${title}")${prerelease ? " as a pre-release" : " as the latest release"} with:`);
  for (const file of apks) console.log(`  ${file}`);
  console.log(`Notes: ${notes}`);
  process.exit(0);
}

say(`Publishing ${tag}`);
// gh makes the tag on GitHub, at the pushed commit, then uploads the APKs.
run("gh", [
  "release",
  "create",
  tag,
  ...apks,
  "--target",
  head,
  "--title",
  title,
  "--notes-file",
  notes,
  ...(prerelease ? ["--prerelease"] : ["--latest"]),
]);
capture("git", ["fetch", "--quiet", "--tags", "origin"]);

say("Published");
console.log(capture("gh", ["release", "view", tag, "--json", "url", "--jq", ".url"], { allowFail: true }) ?? tag);
