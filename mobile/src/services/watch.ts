import { useEffect, useState } from "react";
import { type Watch, WatchSync, watchSyncAvailable } from "../../modules/watch-sync";
import { type InboxProblem, drainInbox } from "@/core/watch-inbox";
import { sync } from "./index";

export { WatchSync, watchSyncAvailable };

let problems: InboxProblem[] = [];
const listeners = new Set<() => void>();
let running: Promise<void> | null = null;
let again = false;

/**
 * Stores matches waiting in the watch inbox on the phone. Nothing is uploaded:
 * that waits for the umpire.
 * Calls while one is running make it go round again, so a match arriving
 * mid-drain isn't left waiting.
 */
export function drainWatchInbox(): Promise<void> {
  if (!watchSyncAvailable) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const result = await drainInbox(WatchSync, sync);
        problems = result.problems;
        for (const l of listeners) l();
      } while (again);
    } catch (err) {
      console.warn("Couldn't read matches from the watch", err);
    } finally {
      running = null;
    }
  })();
  return running;
}

export const onWatchMatch = WatchSync.onMatchReceived;

/** Matches from the watch that couldn't be stored, for the settings screen. */
export function useWatchProblems(): InboxProblem[] {
  const [list, setList] = useState(problems);
  useEffect(() => {
    const update = () => setList(problems);
    listeners.add(update);
    update();
    return () => void listeners.delete(update);
  }, []);
  return list;
}

/** Watches in reach, or null while looking. */
export function useConnectedWatches(): Watch[] | null {
  const [watches, setWatches] = useState<Watch[] | null>(null);
  useEffect(() => {
    let live = true;
    WatchSync.connectedWatches()
      .catch(() => [])
      .then((w) => live && setWatches(w));
    return () => {
      live = false;
    };
  }, []);
  return watches;
}
