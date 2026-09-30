import * as Network from "expo-network";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import type { LocalMatch } from "@/core/store";
import type { SyncState } from "@/core/sync";
import { ONLINE } from "@/config";
import { sync } from "@/services";
import { syncUploadReminders } from "@/services/upload-reminders";
import { drainWatchInbox, onWatchMatch } from "@/services/watch";

export interface MatchRow {
  match: LocalMatch;
  state: SyncState;
}

/** Every match on the phone, newest first, updating as the sync engine changes them. */
export function useMatches(): { rows: MatchRow[]; loaded: boolean } {
  const [rows, setRows] = useState<MatchRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let live = true;
    const load = async () => {
      // Alpha never talks to a server, so a match known only from one (left by a beta build) can't be shown.
      const list = (await sync.list()).filter((m) => ONLINE || m.document);
      if (!live) return;
      list.sort((a, b) => playedAt(b).localeCompare(playedAt(a)));
      setRows(list.map((m) => ({ match: m, state: sync.state(m) })));
      setLoaded(true);
    };
    void load();
    const off = sync.subscribe(() => void load());
    return () => {
      live = false;
      off();
    };
  }, []);
  return { rows, loaded };
}

/** One match, with its full document fetched if the phone doesn't have it yet. */
export function useMatch(id: string) {
  const [row, setRow] = useState<MatchRow | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(async () => {
    try {
      const m = ONLINE ? await sync.ensureDocument(id) : await sync.get(id);
      if (!m) throw new Error("This match isn't on this phone.");
      setRow({ match: m, state: sync.state(m) });
      setError(null);
    } catch (err) {
      const m = await sync.get(id);
      if (m) setRow({ match: m, state: sync.state(m) });
      setError(err);
    }
  }, [id]);
  useEffect(() => {
    void load();
    return sync.subscribe(() => {
      void sync.get(id).then((m) => m && setRow({ match: m, state: sync.state(m) }));
    });
  }, [id, load]);
  return { row, error, reload: load };
}

function playedAt(m: LocalMatch): string {
  return m.document?.startedAt ?? m.server?.playedAt ?? m.receivedAt;
}

const RETRY_EVERY_MS = 20_000;

/**
 * Takes in matches from the watch: on start, on returning to the foreground and
 * as they arrive. They're stored on the phone only. Where this is off (signed
 * out, in beta), they wait safely in the native inbox.
 */
export function useWatchInbox(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const watch = () => void drainWatchInbox();
    watch();
    const app = AppState.addEventListener("change", (s) => s === "active" && watch());
    const off = onWatchMatch(watch);
    return () => {
      app.remove();
      off();
    };
  }, [enabled]);
}

/**
 * Beta, signed in: fetches the umpire's matches from the server on start and on
 * returning to the foreground, and keeps uploads the umpire asked for moving:
 * when the connection returns and every 20 seconds (the engine skips matches in
 * their backoff, and never uploads one the umpire hasn't asked to).
 */
export function useSyncTriggers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void sync.refresh().catch(() => {});
    const upload = () => void sync.uploadPending().catch(() => {});
    refresh();
    const app = AppState.addEventListener("change", (s) => s === "active" && refresh());
    const net = Network.addNetworkStateListener((s) => s.isInternetReachable && upload());
    const timer = setInterval(upload, RETRY_EVERY_MS);
    return () => {
      app.remove();
      net.remove();
      clearInterval(timer);
    };
  }, [enabled]);
}

/**
 * Signed in: keeps a reminder scheduled for each match from the watch that isn't
 * uploaded two hours after it arrived (see services/upload-reminders.ts), as matches
 * arrive, get uploaded or are deleted.
 */
export function useUploadReminders(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      clearTimeout(timer);
      // Changes come in bursts (a drain, an upload run): update once they settle.
      timer = setTimeout(() => void syncUploadReminders().catch((err) => console.warn("Couldn't schedule upload reminders", err)), 1000);
    };
    update();
    const off = sync.subscribe(update);
    return () => {
      clearTimeout(timer);
      off();
    };
  }, [enabled]);
}
