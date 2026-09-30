import { requireOptionalNativeModule } from "expo";

export type HealthConnectStatus = "available" | "needs_update" | "unavailable";

/** A workout to save: the watch's summary (src/core/fitness.ts) with the match it belongs to. */
export interface Workout {
  matchId: string;
  title: string;
  startedAt: string;
  endedAt: string;
  steps?: number;
  distanceM?: number;
  caloriesKcal?: number;
  heartRateSamples: [number, number][];
}

interface HealthConnectNative {
  status(): Promise<HealthConnectStatus>;
  hasPermissions(): Promise<boolean>;
  /** Shows Health Connect's permission screen. True if everything the app writes was allowed. */
  requestPermissions(): Promise<boolean>;
  /** Saving the same match again replaces what was saved before. */
  saveWorkout(workout: Workout): Promise<void>;
  openHealthConnect(): void;
}

/** Null where there's no Health Connect: iOS, and tests. */
const native = requireOptionalNativeModule<HealthConnectNative>("HealthConnect");

export const HealthConnect = {
  status: (): Promise<HealthConnectStatus> => native?.status() ?? Promise.resolve("unavailable"),
  hasPermissions: () => native?.hasPermissions() ?? Promise.resolve(false),
  requestPermissions: () => native?.requestPermissions() ?? Promise.resolve(false),
  saveWorkout: (workout: Workout) => native?.saveWorkout(workout) ?? Promise.reject(new Error("Health Connect isn't available on this phone.")),
  openHealthConnect: () => native?.openHealthConnect(),
};
