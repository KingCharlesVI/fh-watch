import Storage from "expo-sqlite/kv-store";
import { applyPlanned, isPlannedUpcoming, plannedIdOf } from "@/core/planned";
import { LAST_SETUP_KEY, readSavedSetup } from "@/core/setup";
import { isoDay } from "@/core/upcoming";
import { api } from "@/services";
import { upcomingStore } from "./upcoming";

/** Planned match ids already put in Upcoming once, so one deleted from there stays deleted. */
const ADDED_KEY = "plannedAdded";

/** Fetches the matches you've planned on the website, then brings Upcoming up to date. Offline, nothing changes. */
export async function refreshPlanned(): Promise<void> {
  const { items } = await api.myPlannedMatches();
  const [saved, lastSetup] = await Promise.all([Storage.getItem(ADDED_KEY).catch(() => null), Storage.getItem(LAST_SETUP_KEY).catch(() => null)]);
  const added = new Set<string>(saved ? (JSON.parse(saved) as string[]) : []);
  let after = added;
  await upcomingStore.apply((list) => {
    const next = applyPlanned(list, added, items, readSavedSetup(lastSetup), isoDay(new Date()), new Date().toISOString());
    after = next.added;
    return next.list;
  });
  if (after.size !== added.size) await Storage.setItem(ADDED_KEY, JSON.stringify([...after])).catch(() => {});
}

/** Deletes planned matches from the website too, once they're gone from Upcoming. Offline, they go when their day has. */
export function forgetPlanned(ids: readonly string[]) {
  for (const id of ids) {
    if (isPlannedUpcoming({ id })) api.deletePlannedMatch(plannedIdOf({ id })).catch(() => {});
  }
}
