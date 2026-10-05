import { requireOptionalNativeModule } from "expo";

/** A match the watch sent, waiting in the native inbox until the app has stored it. */
export interface InboxItem {
  id: string;
  /** The match document exactly as the watch sent it. */
  json: string;
  /** Epoch milliseconds. */
  receivedAt: number;
  /** The umpire's workout during the match (JSON), sent with it but not part of it. */
  fitness: string | null;
}

export interface Watch {
  id: string;
  name: string;
}

/** The watch app installed on a watch, as it last told the phone. */
export interface WatchVersion {
  watchId: string;
  version: string;
  build: number;
}

interface WatchSyncNative {
  listInbox(): Promise<InboxItem[]>;
  removeFromInbox(id: string): Promise<void>;
  /** Stores matches the Data Layer holds that weren't delivered as they arrived. Returns how many. */
  pullPending(): Promise<number>;
  connectedWatches(): Promise<Watch[]>;
  /** Sends a match setup (JSON) to every watch in reach. Returns how many got it. */
  sendSetup(json: string): Promise<number>;
  /** Streams a new watch app to every watch in reach (Android). Returns how many got all of it. */
  sendWatchUpdate?(path: string): Promise<number>;
  watchVersions(): Promise<WatchVersion[]>;
  addListener(event: "onMatchReceived", listener: (e: { id: string }) => void): { remove(): void };
}

/** Null where there's no watch sync yet: iOS (until the watchOS app), and tests. */
const native = requireOptionalNativeModule<WatchSyncNative>("WatchSync");

export const watchSyncAvailable = native !== null;

export const WatchSync = {
  listInbox: () => native?.listInbox() ?? Promise.resolve([]),
  removeFromInbox: (id: string) => native?.removeFromInbox(id) ?? Promise.resolve(),
  pullPending: () => native?.pullPending() ?? Promise.resolve(0),
  connectedWatches: () => native?.connectedWatches() ?? Promise.resolve([]),
  sendSetup: (json: string) => native?.sendSetup(json) ?? Promise.resolve(0),
  /** Android only: the iPhone's native module has no such function (Apple Watch apps update through TestFlight). */
  sendWatchUpdate: (path: string) => native?.sendWatchUpdate?.(path) ?? Promise.resolve(0),
  watchVersions: () => native?.watchVersions() ?? Promise.resolve([]),
  onMatchReceived(listener: (id: string) => void): () => void {
    const sub = native?.addListener("onMatchReceived", (e) => listener(e.id));
    return () => sub?.remove();
  },
};
