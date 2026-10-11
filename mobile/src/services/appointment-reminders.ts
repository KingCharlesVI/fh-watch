import type { MyAppointment } from "@fh/shared";
import * as Notifications from "expo-notifications";
import { appointmentReminders } from "@/core/appointments";
import { notificationSetting } from "./push";

const PREFIX = "appointment:";

/**
 * Keeps a local notification scheduled the day before each appointment you've accepted,
 * and cancels ones you're no longer on. Like the upload reminders, only with the phone's
 * permission and Settings → Notifications on.
 */
export async function syncAppointmentReminders(appointments: readonly MyAppointment[]): Promise<void> {
  if (!(await notificationSetting.load())) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") return;

  const wanted = new Map(appointmentReminders(appointments, new Date()).map((r) => [r.id, r]));
  const scheduled = (await Notifications.getAllScheduledNotificationsAsync()).filter((n) => n.identifier.startsWith(PREFIX));
  for (const n of scheduled) {
    // Rescheduled every time, so a moved fixture moves its reminder.
    await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  for (const r of wanted.values()) {
    await Notifications.scheduleNotificationAsync({
      identifier: r.id,
      content: { title: r.title, body: r.body, data: { action: "appointments" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: r.at },
    });
  }
}
