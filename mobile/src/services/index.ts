import { ApiClient } from "@/core/api";
import { SyncEngine } from "@/core/sync";
import { API_URL } from "@/config";
import { secureTokens, sqliteMatchStore } from "./storage";

/** Called when the session ends unexpectedly; the auth provider sets it. */
export const sessionEvents = { onSignedOut: () => {} };

export const api = new ApiClient({
  baseUrl: API_URL,
  tokens: secureTokens,
  onSignedOut: () => sessionEvents.onSignedOut(),
});

export const sync = new SyncEngine(api, sqliteMatchStore());
