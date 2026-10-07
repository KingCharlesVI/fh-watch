import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { type UpcomingMatch, readUpcoming, removeUpcoming, saveUpcoming } from "@/core/upcoming";

/** Upcoming matches, kept on this phone only: one small JSON list. */

const KEY = "upcomingMatches";

let list: UpcomingMatch[] | null = null;
const listeners = new Set<() => void>();
const set = (next: UpcomingMatch[]) => {
  list = next;
  for (const l of listeners) l();
};

let loading: Promise<void> | null = null;
/** The current list, read from storage the first time. */
async function load(): Promise<UpcomingMatch[]> {
  await (loading ??= Storage.getItem(KEY)
    .catch(() => null)
    .then((saved) => {
      // Something saved meanwhile wins over what was read.
      if (list === null) set(readUpcoming(saved));
    }));
  // Not what the first read found: each save and delete builds on the one before.
  return list!;
}

async function write(next: UpcomingMatch[]) {
  set(next);
  await Storage.setItem(KEY, JSON.stringify(next));
}

/** The list (null until it's loaded), unsorted. */
export function useUpcoming(): UpcomingMatch[] | null {
  useEffect(() => {
    load();
  }, []);
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => list,
  );
}

export const upcoming = {
  async save(match: UpcomingMatch) {
    await write(saveUpcoming(await load(), match));
  },
  async remove(id: string) {
    await write(removeUpcoming(await load(), id));
  },
  async removeAll(ids: readonly string[]) {
    if (ids.length === 0) return;
    await write((await load()).filter((u) => !ids.includes(u.id)));
  },
};
