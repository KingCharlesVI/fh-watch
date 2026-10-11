import type { KeyValueStorage } from "./upcoming";

/**
 * The app's own notifications switch (Settings → Notifications): on unless the umpire turns
 * it off. It covers every notification the app sends, local reminders and server pushes. It's
 * separate from the phone's permission, which only the phone's own settings can take back.
 */
export function notificationPrefs(storage: KeyValueStorage, key = "notifications.on") {
  let on: boolean | null = null;
  const listeners = new Set<() => void>();
  const set = (value: boolean) => {
    on = value;
    for (const l of listeners) l();
  };

  /** Whether notifications are on, read once from storage. Unreadable storage counts as on. */
  async function load(): Promise<boolean> {
    if (on === null) {
      let raw: string | null = null;
      try {
        raw = await storage.getItem(key);
      } catch {}
      // Turned on or off while that read was under way.
      if (on === null) set(raw !== "false");
    }
    return on!;
  }

  return {
    load,
    /** null until loaded. */
    current: () => on,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    async setOn(value: boolean) {
      set(value);
      await storage.setItem(key, String(value));
    },
  };
}
