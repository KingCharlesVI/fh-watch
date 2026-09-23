import { randomUUID } from "node:crypto";
import type { MatchDocument } from "@fh/shared";
import { ApiClient, type TokenStore, type Tokens } from "../src/core/api";
import { MemoryMatchStore } from "../src/core/store";
import { SyncEngine } from "../src/core/sync";
import { FakeApi, PASSWORD, USER } from "./fake-api";

export class MemoryTokens implements TokenStore {
  tokens: Tokens | null = null;
  async get() {
    return this.tokens;
  }
  async set(t: Tokens | null) {
    this.tokens = t;
  }
}

export async function setup(options: { signIn?: boolean } = {}) {
  const clock = { now: Date.parse("2026-09-19T12:00:00Z") };
  const now = () => clock.now;
  const server = new FakeApi(now);
  const tokens = new MemoryTokens();
  const signedOut = { count: 0 };
  const api = new ApiClient({ baseUrl: "https://api.test", tokens, fetch: server.fetch, now, onSignedOut: () => signedOut.count++ });
  const store = new MemoryMatchStore();
  const engine = new SyncEngine(api, store, now);
  if (options.signIn !== false) {
    await api.login(USER.email, PASSWORD);
    engine.setUser(USER.id);
  }
  return { clock, server, tokens, api, store, engine, signedOut, advance: (ms: number) => (clock.now += ms) };
}

/** A valid two-half match, home 2–1. */
export function matchDoc(id = randomUUID()): MatchDocument {
  return {
    schemaVersion: 1,
    id,
    createdOn: "wear",
    settings: {
      periods: 2,
      periodLengthSec: 2100,
      breakLengthsSec: [600],
      cardDurationsSec: { green: 120, yellowShort: 300, yellowLong: 600 },
      shootoutIfDrawn: false,
    },
    teams: {
      home: { name: "Oxford Hawks M1", teamId: null, color: "#1E40AF" },
      away: { name: "Reading M1", teamId: null, color: "#B91C1C" },
    },
    startedAt: "2026-09-19T10:00:00Z",
    endedAt: "2026-09-19T11:30:00Z",
    events: [
      { seq: 1, type: "period_start", period: 1, clockMs: 0 },
      { seq: 2, type: "goal", team: "home", player: 9, period: 1, clockMs: 600000 },
      { seq: 3, type: "period_end", period: 1, clockMs: 2100000 },
      { seq: 4, type: "period_start", period: 2, clockMs: 0 },
      { seq: 5, type: "goal", team: "away", player: 7, period: 2, clockMs: 300000 },
      { seq: 6, type: "goal", team: "home", player: 11, period: 2, clockMs: 900000 },
      { seq: 7, type: "period_end", period: 2, clockMs: 2100000 },
    ],
  };
}

export const withVenue = (doc: MatchDocument, venue: string): MatchDocument => ({ ...doc, venue });
