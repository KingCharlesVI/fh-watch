import * as Notifications from "expo-notifications";
import { awaitingUpload, remindAt } from "@/core/upload-reminders";
import { sync } from "./index";

const PREFIX = "upload:";

/**
 * Keeps one local notification scheduled for each match from the watch that hasn't been
 * uploaded, two hours after it arrived, and cancels it once the match is uploaded (or
 * deleted). Local, so it needs no server; only the phone's permission to notify, which
 * Settings → Notifications asks for. Without it, the match list's banner still reminds.
 */
export async function syncUploadReminders(): Promise<void> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const now = Date.now();
  const rows = await sync.list();
  const wanted = new Map(rows.filter((m) => awaitingUpload(m) && remindAt(m) > now).map((m) => [`${PREFIX}${m.id}`, m]));
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(PREFIX));

  for (const n of scheduled) {
    if (!wanted.delete(n.identifier)) await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  for (const [identifier, m] of wanted) {
    const { home, away } = m.document!.teams;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: "Upload your match?",
        body: `${home.name} v ${away.name} came from your watch 2 hours ago and isn't on the website yet.`,
        data: { matchId: m.id, action: "upload" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(remindAt(m)) },
    });
  }
}
