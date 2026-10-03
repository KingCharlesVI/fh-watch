import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./index";

export type PushStatus =
  | { state: "on"; token: string }
  | { state: "denied" }
  | { state: "unavailable"; reason: string };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

/**
 * Asks for permission, gets this device's Expo push token and registers it
 * with the API. Upload reminders are local (services/upload-reminders.ts); the push token is
 * registered for messages from the server later.
 */
export async function enablePush(askIfNeeded: boolean): Promise<PushStatus> {
  if (!Device.isDevice) return { state: "unavailable", reason: "Push notifications need a real phone, not an emulator." };
  const projectId = (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId;
  if (!projectId) return { state: "unavailable", reason: "This build isn't set up for push notifications yet (no Expo project ID)." };

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Match updates", importance: Notifications.AndroidImportance.DEFAULT });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted" && askIfNeeded) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return { state: "denied" };

  try {
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api.registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
    return { state: "on", token };
  } catch (err) {
    return { state: "unavailable", reason: err instanceof Error ? err.message : "Couldn't get a push token." };
  }
}

/** Stops pushes to this device, for signing out. */
export async function disablePush(status: PushStatus | null) {
  if (status?.state === "on") await api.removePushToken(status.token).catch(() => {});
}

/** Where a tapped notification should open: the match, or its editor when teams need linking. */
export function notificationTarget(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as { matchId?: string; action?: string } | undefined;
  if (!data?.matchId) return null;
  return data.action === "link_teams" ? `/match/${data.matchId}/edit` : `/match/${data.matchId}`;
}
