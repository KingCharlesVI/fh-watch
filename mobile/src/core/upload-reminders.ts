import type { LocalMatch } from "./store";

/**
 * Nothing publishes by itself: a match is on the website only once its umpire uploads
 * and publishes it. So the app reminds them about a match from the watch that still
 * hasn't been uploaded this long after it reached the phone.
 */
export const UPLOAD_REMINDER_AFTER_MS = 2 * 60 * 60 * 1000;

/** From the watch, on this phone, and neither uploaded nor waiting to go. */
export function awaitingUpload(m: LocalMatch): boolean {
  return m.source === "watch" && m.document !== null && m.baseRevision === null && !m.uploadRequested;
}

/** When to remind about a match: two hours after it reached the phone. */
export function remindAt(m: LocalMatch): number {
  return Date.parse(m.receivedAt) + UPLOAD_REMINDER_AFTER_MS;
}

/** Matches whose reminder time has passed, oldest first. */
export function overdueUploads(matches: LocalMatch[], now: number): LocalMatch[] {
  return matches.filter((m) => awaitingUpload(m) && now >= remindAt(m)).sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}
