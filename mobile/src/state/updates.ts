import Constants from "expo-constants";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, Platform } from "react-native";
import { WatchSync } from "../../modules/watch-sync";
import { CHANNEL } from "@/config";
import { RELEASES_URL, type Update, findUpdate, readReleases } from "@/core/updates";

/**
 * Update notices, from the project's GitHub releases. The phone checks for both apps: the
 * watch tells it which build it has, as a watch can't download an APK itself.
 */

const PRE_RELEASES_KEY = "updates.includePreReleases";
const DISMISSED_KEY = "updates.dismissed";
/** How often the app checks by itself while it's in use. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;

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
}

let state: UpdateState = { update: null, checking: false, checkedAt: null, error: null, includePreReleases: true, dismissed: null };
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
