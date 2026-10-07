import Constants from "expo-constants";
import * as Linking from "expo-linking";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { AppUpdater } from "../../modules/app-updater";
import { WatchSync } from "../../modules/watch-sync";
import { CHANNEL } from "@/config";
import { RELEASES_URL, type Update, apkFileName, downloadPercent, findUpdate, readReleases, watchSendOutcome } from "@/core/updates";

/**
 * Update notices, from the project's GitHub releases. The phone checks for both apps: the
 * watch tells it which build it has, as a watch can't download an APK itself.
 */

const PRE_RELEASES_KEY = "updates.includePreReleases";
const DISMISSED_KEY = "updates.dismissed";
/** How often the app checks by itself while it's in use. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

/** An update being downloaded or installed, from the notice's buttons. */
export type Installing =
  | { app: "phone" | "watch"; step: "downloading"; percent: number | null }
  /** The phone needs "Install unknown apps" turning on for this app first. */
  | { app: "phone"; step: "allow" }
  /** Android's own dialog is asking the umpire to confirm. */
  | { app: "phone"; step: "confirming" }
  /** Going over Bluetooth to the watch, which says when it has it. */
  | { app: "watch"; step: "sending" }
  /** This many watches have the watch app, to install there. */
  | { app: "watch"; step: "sent"; watches: number }
  /** It went, but no watch said it got it: their app may be too old to take updates. */
  | { app: "watch"; step: "unconfirmed" }
  | { app: "phone" | "watch"; step: "failed"; message: string };

export interface UpdateState {
  update: Update | null;
  checking: boolean;
  /** When the last check finished; null before the first. */
  checkedAt: number | null;
  error: string | null;
  /** Tell about dev pre-releases too, not only full releases. On by default while in alpha. */
  includePreReleases: boolean;
  /** The release whose notice was put off with Later: it stays in Settings, off the match list. */
  dismissed: string | null;
  installing: Installing | null;
}

let state: UpdateState = { update: null, checking: false, checkedAt: null, error: null, includePreReleases: true, dismissed: null, installing: null };
const listeners = new Set<() => void>();
const set = (change: Partial<UpdateState>) => {
  state = { ...state, ...change };
  for (const l of listeners) l();
};

let loaded: Promise<void> | null = null;
const loadPrefs = () =>
  (loaded ??= (async () => {
    const [pre, dismissed] = await Promise.all([Storage.getItem(PRE_RELEASES_KEY), Storage.getItem(DISMISSED_KEY)]);
    set({ includePreReleases: pre !== "false", dismissed });
  })());

/**
 * The phone app's build, or null where GitHub releases don't apply: development builds,
 * iPhones, which update through TestFlight and the App Store, and Google Play's build,
 * which Play updates (a GitHub APK can't install over it: Play signs its apps itself).
 */
const phoneBuild = (): number | null =>
  __DEV__ || Platform.OS !== "android" || CHANNEL !== "github" ? null : (Constants.expoConfig?.android?.versionCode ?? null);

export async function checkForUpdates(): Promise<void> {
  if (state.checking) return;
  set({ checking: true });
  try {
    await loadPrefs();
    const [response, watches] = await Promise.all([
      fetch(RELEASES_URL, { headers: { Accept: "application/vnd.github+json" } }),
      WatchSync.watchVersions().catch(() => []),
    ]);
    if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
    const releases = readReleases(await response.json());
    const update = findUpdate(releases, { phone: phoneBuild(), watches: watches.map((w) => w.build) }, state.includePreReleases);
    set({ update, error: null, checkedAt: Date.now() });
  } catch (err) {
    set({ error: err instanceof Error ? err.message : String(err), checkedAt: Date.now() });
  } finally {
    set({ checking: false });
  }
}

/** The watch app's package: the same as the phone's, so the Data Layer connects them. */
const WATCH_PACKAGE = "com.fhmatchcentre.app";

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// How Android's installer got on. Installed means the app is being replaced, and closes.
AppUpdater?.addListener("onInstallStatus", ({ status, message: why }) => {
  if (status === "cancelled") set({ installing: null });
  if (status === "failed") set({ installing: { app: "phone", step: "failed", message: why ?? "Android didn't install it." } });
});

/** Downloads an APK from the release, showing how far it's got. Null if it didn't download. */
async function download(app: "phone" | "watch", url: string): Promise<string | null> {
  set({ installing: { app, step: "downloading", percent: 0 } });
  const progress = AppUpdater!.addListener("onDownloadProgress", (e) => {
    if (e.url === url) set({ installing: { app, step: "downloading", percent: downloadPercent(e.received, e.total) } });
  });
  try {
    return await AppUpdater!.download(url, apkFileName(url));
  } catch (err) {
    set({ installing: { app, step: "failed", message: `Couldn't download it: ${message(err)}` } });
    return null;
  } finally {
    progress.remove();
  }
}

/**
 * Downloads the new phone app and installs it: Android asks the umpire to confirm, then
 * replaces the app. The first time, the phone has to allow this app to install apps.
 */
export async function installPhoneUpdate() {
  const phone = state.update?.phone;
  if (!phone) return;
  // Without the installer (an older build of the module, say), the browser downloads it as before.
  if (!AppUpdater) return void Linking.openURL(phone.url);
  if (!AppUpdater.canInstallApps()) {
    set({ installing: { app: "phone", step: "allow" } });
    AppUpdater.openInstallSettings();
    return;
  }
  const path = await download("phone", phone.url);
  if (!path) return;
  set({ installing: { app: "phone", step: "confirming" } });
  try {
    await AppUpdater.installUpdate(path);
  } catch (err) {
    set({ installing: { app: "phone", step: "failed", message: message(err) } });
  }
}

/**
 * Downloads the new watch app and sends it to the watches in reach (their GitHub build),
 * which keep it for the umpire to install there: Install update on the watch's home screen.
 */
export async function sendWatchUpdate() {
  const update = state.update;
  if (!update?.watch) return;
  if (!AppUpdater) return void Linking.openURL(update.release.pageUrl);
  const path = await download("watch", update.watch.url);
  if (!path) return;
  const info = await AppUpdater.apkInfo(path).catch(() => null);
  // The watch's version codes are 1,000,000 above the phone's (see watch-wear/app/build.gradle.kts).
  if (info?.packageName !== WATCH_PACKAGE || info.versionCode < 1_000_000) {
    set({ installing: { app: "watch", step: "failed", message: "That download isn't the watch app." } });
    return;
  }
  set({ installing: { app: "watch", step: "sending" } });
  try {
    const result = await WatchSync.sendWatchUpdate(path);
    const outcome = watchSendOutcome(result);
    set({
      installing:
        outcome === "ready"
          ? { app: "watch", step: "sent", watches: result.ready }
          : outcome === "unconfirmed"
            ? { app: "watch", step: "unconfirmed" }
            : {
                app: "watch",
                step: "failed",
                message:
                  outcome === "rejected"
                    ? "Your watch turned it down: it didn't all arrive, or it's no newer than the watch's app. Send it again."
                    : "No watch got it. Keep your watch near the phone with Bluetooth on, then send again.",
              },
    });
  } catch (err) {
    set({ installing: { app: "watch", step: "failed", message: `Couldn't send it to the watch: ${message(err)}` } });
  }
}

export async function setIncludePreReleases(on: boolean) {
  set({ includePreReleases: on });
  await Storage.setItem(PRE_RELEASES_KEY, String(on));
  await checkForUpdates();
}

/** Puts off the match list's notice for this release (Later). */
export async function dismissUpdate() {
  const tag = state.update?.release.tag ?? null;
  set({ dismissed: tag });
  if (tag) await Storage.setItem(DISMISSED_KEY, tag);
}

export function useUpdates(): UpdateState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

/** Checks when the app opens, and when it comes back to the front after a while. */
export function useUpdateChecks() {
  useEffect(() => {
    if (phoneBuild() === null) return;
    void checkForUpdates();
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && (state.checkedAt === null || Date.now() - state.checkedAt > CHECK_EVERY_MS)) void checkForUpdates();
    });
    return () => sub.remove();
  }, []);
}
