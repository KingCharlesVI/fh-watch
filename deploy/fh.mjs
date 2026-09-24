#!/usr/bin/env node
// FH Match Centre server commands. The same file runs on Linux and Windows.
//
//   fh deploy <tag or branch>       build a release, migrate, switch to it; switches back if it isn't healthy
//   fh rollback [release]           switch to the release before this one (or a named one)
//   fh status                       what's running and whether it answers
//   fh logs [api|web|tunnel] [-f] [-n LINES]
//   fh backup                       back up the database now
//   fh restore <file.dump> [--yes]  replace the live database with a backup
//   fh restore-test                 check the newest backup restores (run weekly by the provision script's timer)
//   fh admin <email> [--verify]     make a registered user an admin
//   fh tunnel [--name NAME]         create or reconnect the Cloudflare Tunnel and point the domain at it
//
// Run it with sudo on Linux, or from an administrator PowerShell on Windows. It has no dependencies,
// because it runs before anything is installed. FH_ROOT and FH_SERVICES=none are for trying it out
// away from a real server: a different install folder, and no service manager.

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseEnv } from "node:util";

const WIN = process.platform === "win32";
const ROOT = process.env.FH_ROOT ?? (WIN ? join(process.env.ProgramData ?? "C:\\ProgramData", "fh") : "/opt/fh");
const PATHS = {
  releases: join(ROOT, "releases"),
  current: join(ROOT, "current"),
  bin: join(ROOT, "bin"),
  browsers: join(ROOT, "ms-playwright"),
  config: WIN || process.env.FH_ROOT ? join(ROOT, "config") : "/etc/fh",
  backups: WIN || process.env.FH_ROOT ? join(ROOT, "backups") : "/var/backups/fh",
  /** Windows only: WinSW writes each service's output here. Linux uses the journal. */
  logs: join(ROOT, "logs"),
};
const SERVICES = { api: "fh-api", web: "fh-web", tunnel: "fh-tunnel" };
const NO_SERVICES = process.env.FH_SERVICES === "none";
const API_HEALTH = "http://127.0.0.1:3001/v1/health";
const WEB_HEALTH = "http://127.0.0.1:3000/";
/** cloudflared's metrics server; the service definitions start it here. */
const TUNNEL_READY = "http://127.0.0.1:20241/ready";
/** Tables the restore test counts. */
const TABLES = ["users", "clubs", "teams", "matches", "match_revisions"];
/** The server needs the API and website (and what they depend on), not the phone app. */
const SERVER_PACKAGES = ["--filter", "@fh/api...", "--filter", "@fh/web..."];

class Fail extends Error {}
const fail = (message) => {
  throw new Fail(message);
};
const say = (message) => console.log(`\n\x1b[1m==> ${message}\x1b[0m`);
const warn = (message) => console.log(`\x1b[33m!! ${message}\x1b[0m`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- configuration

function readEnvFile(name) {
  const file = join(PATHS.config, name);
  if (!existsSync(file)) fail(`Missing ${file}. Run the provision script first.`);
  // `KEY=` with nothing after it means unset.
  return Object.fromEntries(Object.entries(parseEnv(readFileSync(file, "utf8"))).filter(([, v]) => v !== ""));
}

const settings = () => readEnvFile("fh.env");

/** Connection settings for the PostgreSQL tools, from the API's DATABASE_URL. */
function pgEnv(database) {
  const url = new URL(readEnvFile("api.env").DATABASE_URL);
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: database ?? url.pathname.slice(1),
    PGAPPNAME: "fh",
  };
}

const liveDatabase = () => pgEnv().PGDATABASE;
/** A second database the provision script creates, owned by the same role, for the restore test. */
const scratchDatabase = () => `${liveDatabase()}_restore_test`;

function pgTool(name) {
  const bin = settings().PG_BIN;
  return bin ? join(bin, WIN ? `${name}.exe` : name) : name;
}

// ---------------------------------------------------------------- running things

/**
 * Runs a command and fails if it does. Output goes to the terminal unless `capture`.
 * Windows can only start pnpm's .cmd launcher through a shell.
 */
function run(cmd, args, { cwd, env = {}, capture = false, allowFail = false } = {}) {
  const shell = WIN && cmd === "pnpm";
  const quote = (a) => (/[\s"^&|<>()%!]/.test(a) ? `"${a.replaceAll('"', '""')}"` : a);
  const [file, argv] = shell ? [[cmd, ...args].map(quote).join(" "), []] : [cmd, args];
  const r = spawnSync(file, argv, {
    cwd,
    env: { ...process.env, ...env },
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    shell,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) fail(`Couldn't run ${cmd}: ${r.error.message}`);
  if (r.status !== 0 && !allowFail) {
    const detail = capture ? `\n${(r.stderr || r.stdout).trim()}` : "";
    const what = args[0] && !args[0].startsWith("-") ? `${basename(cmd)} ${args[0]}` : basename(cmd);
    fail(`${what} failed (exit ${r.status}).${detail}`);
  }
  return r;
}

/** Builds run as the unprivileged fh-deploy account on Linux, so package install scripts never run as root. */
function asDeployUser(cmd, args, { env = {}, ...opts } = {}) {
  const all = {
    COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
    PLAYWRIGHT_BROWSERS_PATH: PATHS.browsers,
    NEXT_TELEMETRY_DISABLED: "1",
    ...env,
  };
  if (WIN || process.getuid?.() !== 0) return run(cmd, args, { ...opts, env: all });
  const vars = Object.entries({ HOME: "/home/fh-deploy", ...all }).map(([k, v]) => `${k}=${v}`);
  return run("runuser", ["-u", "fh-deploy", "--", "env", ...vars, cmd, ...args], opts);
}

/** Runs one of the API's scripts with its settings (the database password among them). */
function asApi(cwd, args) {
  if (!WIN && process.getuid?.() === 0) {
    // As the API's own account, with the settings read by systemd rather than passed on a command line.
    return run("systemd-run", [
      "--quiet", "--wait", "--pipe", "--collect", "--uid=fh-api", "--gid=fh-api",
      `--property=EnvironmentFile=${join(PATHS.config, "api.env")}`, `--working-directory=${cwd}`,
      process.execPath, ...args,
    ]);
  }
  return run(process.execPath, args, { cwd, env: readEnvFile("api.env") });
}

function isAdmin() {
  // fltmc only works elevated (and, unlike `net session`, doesn't need the Server service).
  if (WIN) return spawnSync("fltmc", [], { stdio: "ignore" }).status === 0;
  return process.getuid?.() === 0;
}

// ---------------------------------------------------------------- services

function powershell(command) {
  return run("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$ErrorActionPreference='Stop'; ${command}`], {
    capture: true,
  });
}

const services = {
  restart(names) {
    if (NO_SERVICES) return console.log(`(FH_SERVICES=none: not restarting ${names.join(", ")})`);
    if (WIN) powershell(`Restart-Service -Force -Name ${names.join(",")}`);
    else run("systemctl", ["restart", ...names]);
  },
  stop(names) {
    if (NO_SERVICES) return console.log(`(FH_SERVICES=none: not stopping ${names.join(", ")})`);
    if (WIN) powershell(`Stop-Service -Force -Name ${names.join(",")}`);
    else run("systemctl", ["stop", ...names]);
  },
  start(names) {
    if (NO_SERVICES) return console.log(`(FH_SERVICES=none: not starting ${names.join(", ")})`);
    if (WIN) powershell(`Start-Service -Name ${names.join(",")}`);
    else run("systemctl", ["start", ...names]);
  },
  /** "running", "stopped", "failed", "not installed", ... */
  state(name) {
    if (NO_SERVICES) return "not managed";
    if (WIN) {
      const r = run("sc.exe", ["query", name], { capture: true, allowFail: true });
      if (r.status === 1060) return "not installed";
      return (r.stdout.match(/STATE\s+:\s+\d+\s+(\w+)/)?.[1] ?? "unknown").toLowerCase();
    }
    const r = run("systemctl", ["show", "--property=LoadState,ActiveState", name], { capture: true, allowFail: true });
    if (/LoadState=not-found/.test(r.stdout)) return "not installed";
    const active = r.stdout.match(/ActiveState=(\S+)/)?.[1] ?? "unknown";
    return { active: "running", inactive: "stopped" }[active] ?? active;
  },
};

async function answers(url) {
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5000) });
    return res.status < 400;
  } catch {
    return false;
  }
}

async function healthy(seconds = 60) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    if ((await answers(API_HEALTH)) && (await answers(WEB_HEALTH))) return true;
    await sleep(2000);
  }
  return false;
}

// ---------------------------------------------------------------- releases

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const samePath = (a, b) => (WIN ? resolve(a).toLowerCase() === resolve(b).toLowerCase() : resolve(a) === resolve(b));

function listReleases() {
  if (!existsSync(PATHS.releases)) return [];
  return readdirSync(PATHS.releases, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.includes("~"))
    .map((d) => d.name)
    .sort();
}

function currentRelease() {
  try {
    return realpathSync(PATHS.current);
  } catch {
    return null;
  }
}

/** Removes a symlink or junction, never what it points at. */
function removeLink(path) {
  try {
    unlinkSync(path);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
}

/** Points `current` at a release: a symlink on Linux (swapped atomically), a junction on Windows. */
function pointCurrentAt(dir) {
  const next = `${PATHS.current}.new`;
  removeLink(next);
  symlinkSync(dir, next, WIN ? "junction" : "dir");
  // Windows can't rename over an existing junction. Removing it leaves the running services alone.
  if (WIN) removeLink(PATHS.current);
  renameSync(next, PATHS.current);
}

function switchTo(dir) {
  pointCurrentAt(dir);
  services.restart([SERVICES.api, SERVICES.web]);
}

/**
 * Deletes a release, renaming it first so a half-deleted one is never mistaken for a release.
 * Windows refuses the rename while a program has files open in it, leaving the release intact.
 */
function removeRelease(dir) {
  const doomed = `${dir}~old`;
  renameSync(dir, doomed);
  rmSync(doomed, { recursive: true, force: true, maxRetries: 5 });
}

/** Next.js writes to .next/cache in the release; the website's account may write there and nowhere else. */
function allowWebCache(dir) {
  const cache = join(dir, "web", ".next", "cache");
  mkdirSync(cache, { recursive: true });
  if (NO_SERVICES) return;
  if (WIN) run("icacls", [cache, "/grant", `NT SERVICE\\${SERVICES.web}:(OI)(CI)M`, "/T", "/Q"], { capture: true });
  else run("chown", ["-R", "fh-web:fh-web", cache]);
}

function showRecentLogs(names, lines = 30) {
  if (WIN) {
    for (const name of names) for (const file of logFiles(name)) printTail(file, lines);
  } else {
    run("journalctl", [...names.flatMap((n) => ["-u", n]), "-n", String(lines), "--no-pager"], { allowFail: true });
  }
}

async function deploy([ref]) {
  if (!ref) fail("Usage: fh deploy <tag or branch>");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(ref)) fail(`That isn't a tag or branch name: ${ref}`);
  const s = settings();
  if (!s.REPO_URL) fail(`REPO_URL isn't set in ${join(PATHS.config, "fh.env")}.`);
  const keep = Math.max(2, Number(s.KEEP_RELEASES ?? 5));
  const name = `${stamp()}-${ref.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  const dir = join(PATHS.releases, name);
  const previous = currentRelease();

  try {
    say(`Fetching ${ref}`);
    asDeployUser("git", ["clone", "--quiet", "--depth", "1", "--branch", ref, s.REPO_URL, dir]);
    const commit = asDeployUser("git", ["-c", "safe.directory=*", "-C", dir, "rev-parse", "--short", "HEAD"], {
      capture: true,
    }).stdout.trim();
    console.log(`Commit ${commit}`);

    say("Installing dependencies");
    asDeployUser("pnpm", ["install", "--frozen-lockfile", ...SERVER_PACKAGES], { cwd: dir });

    say("Building");
    // The website build reads its production settings (site and API addresses).
    asDeployUser("pnpm", [...SERVER_PACKAGES, "run", "build"], { cwd: dir, env: readEnvFile("web.env") });
    for (const file of ["api/dist/server.js", "web/serve.mjs", "deploy/fh.mjs"]) {
      if (!existsSync(join(dir, file))) fail(`The build has no ${file}.`);
    }

    say("Chromium for PDF reports");
    asDeployUser("pnpm", ["--filter", "@fh/api", "exec", "playwright-core", "install", "--only-shell", "chromium"], {
      cwd: dir,
    });

    say("Database migrations");
    asApi(join(dir, "api"), ["dist/db/migrate.js"]);

    writeFileSync(join(dir, "release.json"), `${JSON.stringify({ ref, commit, builtAt: new Date().toISOString() }, null, 2)}\n`);
    allowWebCache(dir);
  } catch (err) {
    if (existsSync(dir)) {
      console.error(`\nDeploy failed before switching, so the site is unchanged. Removing ${dir}.`);
      try {
        removeRelease(dir);
      } catch {
        warn(`Couldn't remove ${dir}; delete it by hand.`);
      }
    }
    throw err;
  }

  say(`Switching to ${name}`);
  let ok = false;
  try {
    switchTo(dir);
    ok = await healthy();
  } catch (err) {
    // E.g. Windows reports a service that crashes straight away as failing to start.
    console.error(err.message);
  }
  if (!ok) {
    console.error("\nThe new release didn't come up healthy. Recent logs:");
    showRecentLogs([SERVICES.api, SERVICES.web]);
    if (previous && !samePath(previous, dir)) {
      switchTo(previous);
      fail(`Switched back to ${basename(previous)}. Database migrations from the failed release stay applied.`);
    }
    fail("There's no earlier release to switch back to.");
  }

  // The fh command itself comes from the release, so fixes to it arrive with deploys.
  copyFileSync(join(dir, "deploy", "fh.mjs"), join(PATHS.bin, "fh.mjs"));

  say(`Pruning old releases (keeping ${keep})`);
  for (const leftover of readdirSync(PATHS.releases).filter((n) => n.endsWith("~old"))) {
    try {
      rmSync(join(PATHS.releases, leftover), { recursive: true, force: true, maxRetries: 5 });
    } catch {}
  }
  const current = currentRelease();
  for (const old of listReleases().reverse().slice(keep)) {
    const path = join(PATHS.releases, old);
    if (current && samePath(path, current)) continue;
    try {
      removeRelease(path);
      console.log(`Removed ${old}`);
    } catch (err) {
      // Windows won't delete files a running program has open.
      warn(`Couldn't remove ${old} yet (${err.code ?? err.message}); the next deploy tries again.`);
    }
  }

  say(`Deployed ${ref} (${name})`);
}

async function rollback([name]) {
  const all = listReleases();
  const current = currentRelease();
  let target;
  if (name) {
    target = all.includes(name) ? join(PATHS.releases, name) : undefined;
  } else {
    const i = all.findIndex((r) => current && samePath(join(PATHS.releases, r), current));
    if (i > 0) target = join(PATHS.releases, all[i - 1]);
  }
  if (!target) fail(`No release to switch to. Available:\n${all.map((r) => `  ${r}`).join("\n")}`);

  console.log(`Switching from ${current ? basename(current) : "nothing"} to ${basename(target)}`);
  switchTo(target);
  if (!(await healthy())) fail("Switched, but the site isn't answering. See: fh logs");
  say(`Rolled back to ${basename(target)}. Database migrations aren't undone.`);
}

// ---------------------------------------------------------------- status and logs

function ago(date) {
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 90) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} hours ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}

function backups() {
  if (!existsSync(PATHS.backups)) return [];
  return readdirSync(PATHS.backups)
    .filter((f) => /^fh-.*\.dump$/.test(f))
    .map((f) => ({ file: join(PATHS.backups, f), mtime: statSync(join(PATHS.backups, f)).mtime }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
}

async function status() {
  const current = currentRelease();
  let release = "none (nothing deployed yet)";
  if (current) {
    release = basename(current);
    try {
      const info = JSON.parse(readFileSync(join(current, "release.json"), "utf8"));
      release += `  (commit ${info.commit}, built ${ago(new Date(info.builtAt))})`;
    } catch {}
  }
  const row = (label, value) => console.log(`${label.padEnd(11)}${value}`);
  row("Release", release);

  let tunnel = "not answering";
  try {
    const res = await fetch(TUNNEL_READY, { signal: AbortSignal.timeout(3000) });
    const body = await res.json().catch(() => ({}));
    tunnel = res.ok ? `connected to Cloudflare (${body.readyConnections ?? "?"} connections)` : "not connected to Cloudflare";
  } catch {}
  const checks = {
    api: (await answers(API_HEALTH)) ? "answering" : "not answering",
    web: (await answers(WEB_HEALTH)) ? "answering" : "not answering",
    tunnel,
  };
  for (const [key, service] of Object.entries(SERVICES)) row(service, `${services.state(service).padEnd(14)}${checks[key]}`);

  const list = backups();
  const offsite = existsSync(join(PATHS.config, "fh.env")) ? (settings().RCLONE_REMOTE ?? "not set up") : "?";
  row(
    "Backups",
    list.length ? `newest ${basename(list[0].file)} (${ago(list[0].mtime)}), ${list.length} kept; off-site: ${offsite}` : "none yet",
  );
}

/** WinSW's files for a service: its output, its errors and its own log. */
function logFiles(service) {
  const dir = join(PATHS.logs, service.replace(/^fh-/, ""));
  return ["out", "err", "wrapper"].map((kind) => join(dir, `${service}.${kind}.log`)).filter((f) => existsSync(f));
}

function readTail(file, bytes) {
  const size = statSync(file).size;
  const length = Math.min(size, bytes);
  const buf = Buffer.alloc(length);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buf, 0, length, size - length);
  } finally {
    closeSync(fd);
  }
  return buf.toString("utf8");
}

function printTail(file, lines) {
  const text = readTail(file, 256 * 1024).split(/\r?\n/).filter(Boolean).slice(-lines);
  console.log(`\x1b[1m--- ${basename(file)}\x1b[0m`);
  for (const line of text) console.log(line);
}

async function logs(args) {
  const follow = args.includes("-f");
  const n = Number(args[args.indexOf("-n") + 1]) || 50;
  const picked = args.filter((a) => a in SERVICES).map((a) => SERVICES[a]);
  const names = picked.length ? picked : Object.values(SERVICES);

  if (!WIN) {
    run("journalctl", [...names.flatMap((s) => ["-u", s]), "-n", String(n), "--no-pager", ...(follow ? ["-f"] : [])]);
    return;
  }
  const files = names.flatMap(logFiles);
  if (!files.length) fail(`No logs yet in ${PATHS.logs}.`);
  for (const file of files) printTail(file, n);
  if (!follow) return;

  const sizes = new Map(files.map((f) => [f, statSync(f).size]));
  console.log("\x1b[1m--- following; Ctrl+C to stop\x1b[0m");
  for (;;) {
    await sleep(1000);
    for (const file of files) {
      const size = existsSync(file) ? statSync(file).size : 0;
      const last = sizes.get(file);
      if (size < last) sizes.set(file, 0); // rolled over
      if (size > sizes.get(file)) {
        const text = readTail(file, size - sizes.get(file));
        for (const line of text.split(/\r?\n/).filter(Boolean)) console.log(`${basename(file)}: ${line}`);
        sizes.set(file, size);
      }
    }
  }
}

// ---------------------------------------------------------------- backups

async function backup({ offsite = true } = {}) {
  const s = settings();
  mkdirSync(PATHS.backups, { recursive: true });
  const file = join(PATHS.backups, `fh-${stamp()}.dump`);
  run(pgTool("pg_dump"), ["--format=custom", `--file=${file}.partial`], { env: pgEnv() });
  renameSync(`${file}.partial`, file);
  console.log(`Backup written: ${file} (${Math.ceil(statSync(file).size / 1024)} KB)`);

  const keepDays = Number(s.KEEP_DAYS ?? 14);
  for (const { file: old, mtime } of backups()) {
    if (Date.now() - mtime.getTime() > keepDays * 86_400_000) {
      rmSync(old);
      console.log(`Removed ${basename(old)}`);
    }
  }

  if (!offsite) return file;
  if (s.RCLONE_REMOTE) {
    run(s.RCLONE ?? "rclone", ["copy", "--config", s.RCLONE_CONFIG ?? join(PATHS.config, "rclone.conf"), file, s.RCLONE_REMOTE]);
    console.log(`Copied off-site to ${s.RCLONE_REMOTE}`);
  } else {
    console.log("RCLONE_REMOTE isn't set: this backup is only on this machine.");
  }
  return file;
}

/**
 * Replaces everything in a database with a backup, in one transaction: if any of it fails,
 * the database is left exactly as it was. Only needs the app's own database role.
 */
function restoreInto(database, dump) {
  const work = mkdtempSync(join(tmpdir(), "fh-restore-"));
  const sql = join(work, "restore.sql");
  try {
    run(pgTool("pg_restore"), ["--no-owner", "--no-acl", `--file=${sql}`, dump]);
    run(
      pgTool("psql"),
      [
        "--no-psqlrc", "--quiet", "--single-transaction", "--set=ON_ERROR_STOP=1",
        // Dumps assume the public schema exists; it's dropped too if this role owns it.
        "--command=DROP OWNED BY CURRENT_USER; CREATE SCHEMA IF NOT EXISTS public",
        `--file=${sql}`,
      ],
      // Captured: the dump's own queries (setval and so on) print results nobody needs.
      { env: pgEnv(database), capture: true },
    );
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function count(database) {
  const query = `select ${TABLES.map((t) => `(select count(*) from ${t})`).join(", ")}`;
  const out = run(pgTool("psql"), ["--no-psqlrc", "--tuples-only", "--no-align", "--field-separator= ", `--command=${query}`], {
    env: pgEnv(database),
    capture: true,
  }).stdout;
  return out.trim().split(" ");
}

async function restoreTest() {
  const latest = backups()[0];
  if (!latest) fail(`No backups in ${PATHS.backups}.`);
  const scratch = scratchDatabase();
  restoreInto(scratch, latest.file);
  try {
    const restored = count(scratch);
    const live = count();
    TABLES.forEach((t, i) => console.log(`${t.padEnd(16)} backup ${restored[i].padStart(7)}   live ${live[i].padStart(7)}`));
  } finally {
    run(pgTool("psql"), ["--no-psqlrc", "--quiet", "--command=DROP OWNED BY CURRENT_USER"], { env: pgEnv(scratch) });
  }
  console.log(`Restore test passed using ${basename(latest.file)}.`);
}

async function confirm(question, expected) {
  if (!process.stdin.isTTY) fail("Run this in a terminal, or add --yes.");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim() === expected;
  } finally {
    rl.close();
  }
}

async function restore(args) {
  const dump = args.find((a) => !a.startsWith("--"));
  if (!dump) fail("Usage: fh restore <backup .dump file> [--yes]");
  if (!existsSync(dump)) fail(`No such file: ${dump}`);
  console.log(`This replaces EVERYTHING in the live database with ${basename(dump)}.`);
  console.log("Changes made since that backup will be lost. A safety backup is taken first.");
  if (!args.includes("--yes") && !(await confirm("Type 'restore' to continue: ", "restore"))) fail("Cancelled.");

  say("Safety backup of the current database");
  const safety = await backup({ offsite: false });

  say("Restoring");
  services.stop([SERVICES.web, SERVICES.api]);
  try {
    restoreInto(liveDatabase(), resolve(dump));
  } catch (err) {
    warn("The restore failed, so nothing was changed.");
    throw err;
  } finally {
    services.start([SERVICES.api, SERVICES.web]);
  }
  say(`Restored ${basename(dump)}. If that was a mistake: fh restore ${safety}`);
}

// ---------------------------------------------------------------- admin and tunnel

function admin(args) {
  if (!args.some((a) => !a.startsWith("--"))) fail("Usage: fh admin <email> [--verify]");
  const current = currentRelease();
  if (!current) fail("Nothing is deployed yet.");
  asApi(join(current, "api"), ["dist/cli/grant-admin.js", ...args]);
}

/** Lets a service's account read a secrets file, and nobody else but administrators. */
function protect(file, service) {
  if (NO_SERVICES) return;
  if (WIN) {
    run("icacls", [file, "/inheritance:r", "/grant:r", "*S-1-5-32-544:F", "*S-1-5-18:F", `NT SERVICE\\${service}:R`], { capture: true });
  } else {
    run("chown", [`root:${service}`, file]);
    chmodSync(file, 0o640);
  }
}

function tunnelConfig(tunnelId, credentialsFile, host) {
  // Quoted, since Windows paths have backslashes.
  const q = (s) => `'${s.replaceAll("'", "''")}'`;
  const rule = (hostname, service, path) =>
    [
      `  - hostname: ${hostname}`,
      ...(path ? [`    path: ${q(path)}`] : []),
      `    service: ${service}`,
      "    originRequest:",
      // The website checks Host against Origin on form posts, so keep the public name.
      `      httpHostHeader: ${hostname}`,
    ].join("\n");
  return `# Written by \`fh tunnel\`: run that again rather than editing this file.
tunnel: ${tunnelId}
credentials-file: ${q(credentialsFile)}
ingress:
${rule(host, "http://127.0.0.1:3001", "^/v1/")}
${rule(host, "http://127.0.0.1:3000")}
${rule(`www.${host}`, "http://127.0.0.1:3000")}
  - service: http_status:404
`;
}

async function tunnel(args) {
  const i = args.indexOf("--name");
  const name = i >= 0 ? args[i + 1] : "fh-match-centre";
  if (!name) fail("Usage: fh tunnel [--name NAME]");
  const cf = settings().CLOUDFLARED ?? "cloudflared";
  const host = new URL(readEnvFile("web.env").SITE_URL).hostname;

  if (!existsSync(join(homedir(), ".cloudflared", "cert.pem"))) {
    say("Sign in to Cloudflare");
    console.log(`Open the link cloudflared prints (it may open by itself), sign in, and choose ${host}.`);
    run(cf, ["tunnel", "login"]);
  }

  const creds = join(PATHS.config, "tunnel.json");
  if (!existsSync(creds)) {
    const list = JSON.parse(run(cf, ["tunnel", "list", "--output", "json", "--name", name], { capture: true }).stdout || "[]") ?? [];
    if (list.length) {
      say(`Reconnecting to the existing tunnel ${name}`);
      run(cf, ["tunnel", "token", "--cred-file", creds, name]);
    } else {
      say(`Creating the tunnel ${name}`);
      run(cf, ["tunnel", "create", "--cred-file", creds, name]);
    }
  }
  protect(creds, SERVICES.tunnel);
  const { TunnelID } = JSON.parse(readFileSync(creds, "utf8"));

  say(`Pointing ${host} and www.${host} at the tunnel`);
  for (const h of [host, `www.${host}`]) run(cf, ["tunnel", "route", "dns", "--overwrite-dns", TunnelID, h]);

  const config = join(PATHS.config, "tunnel.yml");
  writeFileSync(config, tunnelConfig(TunnelID, creds, host));
  protect(config, SERVICES.tunnel);
  run(cf, ["tunnel", "--config", config, "ingress", "validate"], { capture: true });

  say("Starting the tunnel");
  services.restart([SERVICES.tunnel]);
  if (!NO_SERVICES) {
    let ready = false;
    for (let t = 0; t < 15 && !ready; t++) {
      await sleep(2000);
      ready = await answers(TUNNEL_READY);
    }
    if (!ready) {
      showRecentLogs([SERVICES.tunnel], 20);
      fail("The tunnel didn't connect. See the log above.");
    }
  }
  say(`Tunnel connected. https://${host} reaches this machine once DNS updates, usually within a minute.`);
}

// ---------------------------------------------------------------- main

const COMMANDS = {
  deploy,
  rollback,
  status,
  logs,
  backup: () => backup(),
  restore,
  "restore-test": restoreTest,
  admin,
  tunnel,
};

const [command, ...rest] = process.argv.slice(2);
const handler = COMMANDS[command];
if (!handler) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(command && command !== "help" ? 2 : 0);
}
if (!NO_SERVICES && !isAdmin()) {
  console.error(WIN ? "Run this from an administrator PowerShell." : "Run this with sudo.");
  process.exit(1);
}
try {
  await handler(rest);
} catch (err) {
  if (!(err instanceof Fail)) throw err;
  console.error(`\x1b[31m${err.message}\x1b[0m`);
  process.exit(1);
}
