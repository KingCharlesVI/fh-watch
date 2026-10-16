import { describe, expect, it } from "vitest";
import { PASSWORD, setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

const match = (over: object = {}) => ({
  date: "2026-09-26",
  time: "14:00",
  home: { name: "Reading M1", color: "#1d4ed8", captain: 7 },
  away: { name: "Oxford M2", color: "#DC2626" },
  venue: "Palmer Park",
  competition: null,
  format: { periods: 4, periodMinutes: 15, breakMinutes: 2, halfTimeMinutes: 5, shootoutIfDrawn: false },
  ...over,
});

describe("planned matches", () => {
  it("are set up ahead of time, changed and deleted, soonest first", async () => {
    const { headers } = await t.createUser();
    // The test clock is Saturday 2026-09-19.
    const res = await req("POST", "/v1/me/planned-matches", headers, match());
    expect(res.statusCode).toBe(201);
    const first = res.json();
    expect(first).toMatchObject({
      date: "2026-09-26",
      time: "14:00",
      home: { name: "Reading M1", color: "#1D4ED8", captain: 7 },
      away: { name: "Oxford M2", color: "#DC2626", captain: null },
      venue: "Palmer Park",
      competition: null,
      format: { periods: 4 },
    });
    const sooner = (await req("POST", "/v1/me/planned-matches", headers, match({ date: "2026-09-20", time: null, format: null }))).json();

    expect((await req("GET", "/v1/me/planned-matches", headers)).json().items.map((p: { id: string }) => p.id)).toEqual([sooner.id, first.id]);

    const changed = await req("PUT", `/v1/me/planned-matches/${first.id}`, headers, match({ time: "15:30", venue: null }));
    expect(changed.json()).toMatchObject({ id: first.id, time: "15:30", venue: null });
    expect((await req("GET", `/v1/me/planned-matches/${first.id}`, headers)).json().time).toBe("15:30");

    expect((await req("DELETE", `/v1/me/planned-matches/${sooner.id}`, headers)).statusCode).toBe(204);
    expect((await req("GET", "/v1/me/planned-matches", headers)).json().items).toHaveLength(1);
  });

  it("are each umpire's own", async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    const planned = (await req("POST", "/v1/me/planned-matches", a.headers, match())).json();
    expect((await req("GET", "/v1/me/planned-matches", b.headers)).json().items).toEqual([]);
    expect((await req("GET", `/v1/me/planned-matches/${planned.id}`, b.headers)).statusCode).toBe(404);
    expect((await req("PUT", `/v1/me/planned-matches/${planned.id}`, b.headers, match())).statusCode).toBe(404);
    await req("DELETE", `/v1/me/planned-matches/${planned.id}`, b.headers);
    expect((await req("GET", `/v1/me/planned-matches/${planned.id}`, a.headers)).statusCode).toBe(200);
  });

  it("refuse past days, colours the watch doesn't have and setups it wouldn't take", async () => {
    const { headers } = await t.createUser();
    expect((await req("POST", "/v1/me/planned-matches", headers, match({ date: "2026-09-18" }))).statusCode).toBe(400);
    expect((await req("POST", "/v1/me/planned-matches", headers, match({ home: { name: "A", color: "#123456" } }))).statusCode).toBe(400);
    expect((await req("POST", "/v1/me/planned-matches", headers, match({ away: { name: " ", color: "#DC2626" } }))).statusCode).toBe(400);
    const tooLong = { periods: 4, periodMinutes: 91, breakMinutes: 2, halfTimeMinutes: 5, shootoutIfDrawn: false };
    expect((await req("POST", "/v1/me/planned-matches", headers, match({ format: tooLong }))).statusCode).toBe(400);
  });

  it("are for umpires, signed in", async () => {
    const viewer = await t.createUser({ roles: [] });
    expect((await req("POST", "/v1/me/planned-matches", viewer.headers, match())).statusCode).toBe(403);
    expect((await req("GET", "/v1/me/planned-matches", {})).statusCode).toBe(401);
  });

  it("drop out of the list once their day has gone", async () => {
    const { user, headers } = await t.createUser();
    await req("POST", "/v1/me/planned-matches", headers, match({ date: "2026-09-19" }));
    expect((await req("GET", "/v1/me/planned-matches", headers)).json().items).toHaveLength(1);
    t.advance(24 * 60 * 60 * 1000);
    // Signed in again, as the old access token has expired by then.
    const login = (await req("POST", "/v1/auth/login", {}, { email: user.email, password: PASSWORD })).json();
    expect((await req("GET", "/v1/me/planned-matches", { authorization: `Bearer ${login.accessToken}` })).json().items).toEqual([]);
  });
});
