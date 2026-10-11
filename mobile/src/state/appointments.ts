import type { MyAppointment } from "@fh/shared";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { errorMessage } from "@/core/api";
import { applyAppointments } from "@/core/appointments";
import { isoDay } from "@/core/upcoming";
import { api } from "@/services";
import { syncAppointmentReminders } from "@/services/appointment-reminders";
import { upcomingStore } from "./upcoming";

/** Appointment ids already put in Upcoming once, so one deleted from there stays deleted. */
const ADDED_KEY = "appointmentsAdded";

interface AppointmentsState {
  items: MyAppointment[] | null;
  error: string | null;
}

let state: AppointmentsState = { items: null, error: null };
const listeners = new Set<() => void>();
const set = (change: Partial<AppointmentsState>) => {
  state = { ...state, ...change };
  for (const l of listeners) l();
};

let refreshing: Promise<void> | null = null;

/**
 * Fetches your appointments, then brings Upcoming and the day-before reminders up to date.
 * Offline, the last ones fetched stay.
 */
export function refreshAppointments(): Promise<void> {
  return (refreshing ??= (async () => {
    try {
      const { items } = await api.myAppointments();
      set({ items, error: null });
      const saved = await Storage.getItem(ADDED_KEY).catch(() => null);
      const added = new Set<string>(saved ? (JSON.parse(saved) as string[]) : []);
      let after = added;
      await upcomingStore.apply((list) => {
        const next = applyAppointments(list, added, items, isoDay(new Date()), new Date().toISOString());
        after = next.added;
        return next.list;
      });
      if (after.size !== added.size) await Storage.setItem(ADDED_KEY, JSON.stringify([...after])).catch(() => {});
      await syncAppointmentReminders(items).catch((err) => console.warn("Couldn't schedule appointment reminders", err));
    } catch (err) {
      set({ error: errorMessage(err) });
    } finally {
      refreshing = null;
    }
  })());
}

/** Accept or decline one, then fetch them again. */
export async function answerAppointment(id: string, answer: "accept" | "decline"): Promise<void> {
  await api.answerAppointment(id, answer);
  await refreshAppointments();
}

export function useAppointments(): AppointmentsState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => state,
  );
}

/** Signed in: fetches appointments on start and whenever the app comes back to the front. */
export function useAppointmentSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    void refreshAppointments();
    const app = AppState.addEventListener("change", (s) => s === "active" && void refreshAppointments());
    return () => app.remove();
  }, [enabled]);
}
