import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { api } from "./index";

/** On once the umpire allows notifications; the token is null when this device can't get server pushes. */
export type PushStatus = { state: "on"; token: string | null } | { state: "denied" };

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
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

/** Where a tapped notification should open: the match, or its editor when teams need linking. */
export function notificationTarget(response: Notifications.NotificationResponse): string | null {
  const data = response.notification.request.content.data as { matchId?: string; action?: string } | undefined;
  if (!data?.matchId) return null;
  return data.action === "link_teams" ? `/match/${data.matchId}/edit` : `/match/${data.matchId}`;
}
