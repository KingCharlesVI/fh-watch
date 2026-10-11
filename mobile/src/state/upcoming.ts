import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { type UpcomingMatch, upcomingStore } from "@/core/upcoming";

/** Upcoming matches, kept on this phone only: one small JSON list. */
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
  save: store.save,
  remove: store.remove,
  removeAll: store.removeAll,
};
