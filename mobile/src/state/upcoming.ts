import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { type UpcomingMatch, upcomingStore } from "@/core/upcoming";

/** Upcoming matches, kept on the phone as one small JSON list, and on the website (state/planned.ts). */
const store = upcomingStore(Storage);

/** For appointments (state/appointments.ts), which add and update their own matches. */
export { store as upcomingStore };

/** The list (null until it's loaded), unsorted. */
export function useUpcoming(): UpcomingMatch[] | null {
  useEffect(() => {
    void store.load();
  }, []);
  return useSyncExternalStore(store.subscribe, store.current);
}

export const upcoming = {
  /** Saved on the phone; it goes to the website when Upcoming is next synced. */
  save: (match: UpcomingMatch) => store.save({ ...match, unsynced: true }),
  remove: store.remove,
  removeAll: store.removeAll,
};
