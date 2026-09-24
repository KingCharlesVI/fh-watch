import type { User } from "@fh/shared";
import * as SecureStore from "expo-secure-store";
import * as SQLite from "expo-sqlite";
import type { TokenStore, Tokens } from "@/core/api";
import type { LocalMatch, MatchStore } from "@/core/store";

/** Tokens in the Keychain (iOS) or Keystore-backed storage (Android). */
export const secureTokens: TokenStore = {
  async get() {
    const raw = await SecureStore.getItemAsync("tokens");
    return raw ? (JSON.parse(raw) as Tokens) : null;
  },
  async set(tokens) {
    if (tokens) await SecureStore.setItemAsync("tokens", JSON.stringify(tokens));
    else await SecureStore.deleteItemAsync("tokens");
  },
};

/** The signed-in user, remembered so the app opens offline. */
export const cachedUser = {
  async get(): Promise<User | null> {
    const raw = await SecureStore.getItemAsync("user");
    return raw ? (JSON.parse(raw) as User) : null;
  },
  async set(user: User | null) {
    if (user) await SecureStore.setItemAsync("user", JSON.stringify(user));
    else await SecureStore.deleteItemAsync("user");
  },
};

/** Matches in SQLite, one JSON row each: a few hundred at most, so no need for columns. */
export function sqliteMatchStore(): MatchStore {
  const db = SQLite.openDatabaseSync("fh.db");
  db.execSync("create table if not exists matches (id text primary key not null, data text not null)");
  return {
    async list() {
      const rows = await db.getAllAsync<{ id: string; data: string }>("select id, data from matches");
      // "insert or replace" moves a row, so a read overlapping a write can meet it twice.
      const byId = new Map(rows.map((r) => [r.id, r.data]));
      return [...byId.values()].map((data) => JSON.parse(data) as LocalMatch);
    },
    async get(id) {
      const row = await db.getFirstAsync<{ data: string }>("select data from matches where id = ?", id);
      return row ? (JSON.parse(row.data) as LocalMatch) : null;
    },
    async put(match) {
      await db.runAsync("insert or replace into matches (id, data) values (?, ?)", match.id, JSON.stringify(match));
    },
    async remove(id) {
      await db.runAsync("delete from matches where id = ?", id);
    },
    async clear() {
      await db.runAsync("delete from matches");
    },
  };
}
