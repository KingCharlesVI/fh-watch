import { describe, expect, it } from "vitest";
import { notificationPrefs } from "../src/core/notification-prefs";

const memory = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => void values.set(key, value),
  };
};

describe("notificationPrefs", () => {
  it("is on until turned off, and stays as set after a restart", async () => {
    const storage = memory();
    const prefs = notificationPrefs(storage);
    expect(prefs.current()).toBeNull();
    expect(await prefs.load()).toBe(true);

    await prefs.setOn(false);
    expect(prefs.current()).toBe(false);
    expect(await notificationPrefs(storage).load()).toBe(false);

    await prefs.setOn(true);
    expect(await notificationPrefs(storage).load()).toBe(true);
  });

  it("counts unreadable storage as on", async () => {
    const prefs = notificationPrefs({ getItem: () => Promise.reject(new Error("disk")), setItem: async () => {} });
    expect(await prefs.load()).toBe(true);
  });

  it("keeps a change made while it was still loading", async () => {
    const storage = memory();
    storage.values.set("notifications.on", "true");
    const prefs = notificationPrefs(storage);
    const loading = prefs.load();
    await prefs.setOn(false);
    expect(await loading).toBe(false);
  });

  it("tells subscribers about changes", async () => {
    const prefs = notificationPrefs(memory());
    const seen: (boolean | null)[] = [];
    const off = prefs.subscribe(() => seen.push(prefs.current()));
    await prefs.load();
    await prefs.setOn(false);
    off();
    await prefs.setOn(true);
    expect(seen).toEqual([true, false]);
  });
});
