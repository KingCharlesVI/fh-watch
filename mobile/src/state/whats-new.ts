import Constants from "expo-constants";
import Storage from "expo-sqlite/kv-store";
import { type ChangelogEntry, newSince, parseChangelog } from "@/core/changelog";

const LAST_SHOWN_KEY = "whatsNew.lastShown";

/** What's new in this build and the ones before it, newest first (app.config.ts bakes them in). */
export const changelog: ChangelogEntry[] = parseChangelog((Constants.expoConfig?.extra?.changelog as string | undefined) ?? "");

/**
 * After an update: how many entries are new since What's new last opened by itself, and
 * remembers the newest as shown. 0 on a fresh install, which has nothing to compare with.
 */
export async function takeNewEntries(): Promise<number> {
  const newest = changelog[0]?.version;
  if (!newest) return 0;
  let lastShown: string | null = null;
  try {
    lastShown = await Storage.getItem(LAST_SHOWN_KEY);
  } catch {}
  if (lastShown !== newest) await Storage.setItem(LAST_SHOWN_KEY, newest).catch(() => {});
  return newSince(changelog, lastShown).length;
}
