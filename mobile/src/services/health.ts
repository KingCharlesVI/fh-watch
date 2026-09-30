import Storage from "expo-sqlite/kv-store";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { HealthConnect, type HealthConnectStatus } from "../../modules/health-connect";
import { healthWorkout } from "@/core/fitness";
import type { LocalMatch } from "@/core/store";
import { sync } from "./index";

export { HealthConnect };

const AUTO_SAVE_KEY = "health.autoSave";

/**
 * Saves a match's workout to Health Connect, asking for access first if it's needed.
 * Returns false if the umpire didn't allow it.
 */
export async function saveToHealthConnect(m: LocalMatch): Promise<boolean> {
  const workout = healthWorkout(m);
  if (!workout) throw new Error("The watch hasn't finished recording this workout.");
  if (!(await HealthConnect.hasPermissions()) && !(await HealthConnect.requestPermissions())) return false;
  await HealthConnect.saveWorkout(workout);
  await sync.markHealthSaved(m.id);
  return true;
}

/**
 * With Save automatically on, saves every workout not saved yet. Never asks for access:
 * without it, workouts wait for the umpire to save them from the match page.
 */
export async function autoSaveWorkouts(): Promise<void> {
  if ((await Storage.getItem(AUTO_SAVE_KEY)) !== "true" || !(await HealthConnect.hasPermissions())) return;
  for (const m of await sync.list()) {
    const workout = m.healthSavedAt ? null : healthWorkout(m);
    if (!workout) continue;
    try {
      await HealthConnect.saveWorkout(workout);
      await sync.markHealthSaved(m.id);
    } catch (err) {
      console.warn(`Couldn't save the workout for match ${m.id} to Health Connect`, err);
    }
  }
}

/** Whether Health Connect is on this phone, and the Save automatically setting. Rechecked on returning to the app. */
export function useHealthConnect() {
  const [status, setStatus] = useState<HealthConnectStatus | null>(null);
  const [autoSave, setAutoSaveState] = useState(false);
  const check = useCallback(() => void HealthConnect.status().then(setStatus, () => setStatus("unavailable")), []);
  useEffect(() => {
    check();
    void Storage.getItem(AUTO_SAVE_KEY).then((v) => setAutoSaveState(v === "true"));
    const sub = AppState.addEventListener("change", (s) => s === "active" && check());
    return () => sub.remove();
  }, [check]);

  /** Turning it on asks for access, and saves the workouts waiting. */
  async function setAutoSave(on: boolean) {
    if (on && !(await HealthConnect.hasPermissions()) && !(await HealthConnect.requestPermissions())) return;
    await Storage.setItem(AUTO_SAVE_KEY, String(on));
    setAutoSaveState(on);
    if (on) await autoSaveWorkouts();
  }

  return { status, autoSave, setAutoSave };
}
