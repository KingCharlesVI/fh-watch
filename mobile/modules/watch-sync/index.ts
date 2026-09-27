import { requireOptionalNativeModule } from "expo";

/** A match the watch sent, waiting in the native inbox until the app has stored it. */
export interface InboxItem {
  id: string;
  /** The match document exactly as the watch sent it. */
  json: string;
  /** Epoch milliseconds. */
  receivedAt: number;
}

export interface Watch {
  id: string;
  name: string;
}

interface WatchSyncNative {
  listInbox(): Promise<InboxItem[]>;
  removeFromInbox(id: string): Promise<void>;
  /** Stores matches the Data Layer holds that weren't delivered as they arrived. Returns how many. */
  pullPending(): Promise<number>;
  connectedWatches(): Promise<Watch[]>;
  /** Sends a match setup (JSON) to every watch in reach. Returns how many got it. */
  sendSetup(json: string): Promise<number>;
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
  onMatchReceived(listener: (id: string) => void): () => void {
    const sub = native?.addListener("onMatchReceived", (e) => listener(e.id));
    return () => sub?.remove();
  },
};
