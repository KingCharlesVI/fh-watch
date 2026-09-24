import * as Network from "expo-network";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import type { LocalMatch } from "@/core/store";
import type { SyncState } from "@/core/sync";
import { sync } from "@/services";
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
      const list = await sync.list();
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
      const m = await sync.ensureDocument(id);
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
 * Keeps uploads moving while signed in: on start, when the app comes back to
 * the foreground, when the connection returns, and every 20 seconds (the
 * engine skips matches still in their backoff). Matches from the watch are
 * taken in on start, on returning to the foreground and as they arrive; while
 * signed out they wait safely in the native inbox.
 */
export function useSyncTriggers(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void sync.refresh().catch(() => {});
    const upload = () => void sync.uploadPending().catch(() => {});
    const watch = () => void drainWatchInbox();
    refresh();
    watch();
    const app = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      refresh();
      watch();
    });
    const offWatch = onWatchMatch(watch);
    const net = Network.addNetworkStateListener((s) => s.isInternetReachable && upload());
    const timer = setInterval(upload, RETRY_EVERY_MS);
    return () => {
      app.remove();
      offWatch();
      net.remove();
      clearInterval(timer);
    };
  }, [enabled]);
}
