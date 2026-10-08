import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Storage from "expo-sqlite/kv-store";
import { useEffect, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { notificationPrefs } from "@/core/notification-prefs";
import { api } from "./index";

/** On once the umpire allows notifications; the token is null when this device can't get server pushes. */
export type PushStatus = { state: "on"; token: string | null } | { state: "denied" };

/** Settings → Notifications: every notification the app sends, reminders and server pushes. */
export const notificationSetting = notificationPrefs(Storage);

/** Whether the app's notifications are on; null until read. */
export function useNotificationsOn(): boolean | null {
  useEffect(() => {
    void notificationSetting.load();
  }, []);
  return useSyncExternalStore(notificationSetting.subscribe, notificationSetting.current);
}

Notifications.setNotificationHandler({
  handleNotification: async () => {
    // Turned off: anything already on its way while the app is open isn't shown either.
    const show = await notificationSetting.load();
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: false, shouldSetBadge: false };
  },
});

/**
 * Asks for permission, then gets this device's Expo push token and registers it with the
 * API. Upload reminders are local (services/upload-reminders.ts), so they only need the
 * permission; the push token is for messages from the server later, and is best effort:
 * an emulator, or an Android build without Firebase set up, has none.
 */
export async function enablePush(askIfNeeded: boolean): Promise<PushStatus> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Match updates", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && askIfNeeded) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return { state: "denied" };

  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  if (!Device.isDevice || !projectId) return { state: "on", token: null };
  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
    return { state: "on", token };
  } catch {
    return { state: "on", token: null };
  }
}

/** Stops pushes to this device, for signing out. */
export async function disablePush(status: PushStatus | null) {
  if (status?.state === "on" && status.token) await api.removePushToken(status.token).catch(() => {});
}

/** Settings → Notifications off: cancels every reminder already scheduled, and stops server pushes. */
export async function turnOffNotifications(status: PushStatus | null) {
  await notificationSetting.setOn(false);
  await Notifications.cancelAllScheduledNotificationsAsync();
  await disablePush(status);
}

/** Where a tapped notification should open: the match, its editor when teams need linking, or Upcoming for an appointment. */
export function notificationTarget(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as { matchId?: string; action?: string } | undefined;
  if (data?.action === "appointments") return "/upcoming";
  if (!data?.matchId) return null;
  return data.action === "link_teams" ? `/match/${data.matchId}/edit` : `/match/${data.matchId}`;
}
