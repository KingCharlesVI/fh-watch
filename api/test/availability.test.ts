import { describe, expect, it } from "vitest";
import { availabilityOf } from "../src/services/umpiring.js";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

describe("an umpire's availability", () => {
  it("marks days they can or can't do, with hours, from today on", async () => {
    const { headers } = await t.createUser();
    // The test clock is Saturday 2026-09-19.
    expect((await req("PUT", "/v1/me/availability/2026-09-26", headers, { available: true, from: "10:00", to: "15:00" })).json()).toEqual({
      date: "2026-09-26",
      available: true,
      from: "10:00",
      to: "15:00",
    });
    await req("PUT", "/v1/me/availability/2026-10-03", headers, { available: false, from: "10:00" }); // hours are dropped
    await req("PUT", "/v1/me/availability/2026-09-12", headers, { available: true }); // in the past

    expect((await req("GET", "/v1/me/availability", headers)).json()).toEqual({
      days: [
        { date: "2026-09-26", available: true, from: "10:00", to: "15:00" },
        { date: "2026-10-03", available: false, from: null, to: null },
      ],
      unavailableWeekdays: [],
    });

    // Marking again replaces it; unmarking removes it.
    await req("PUT", "/v1/me/availability/2026-09-26", headers, { available: false });
    expect((await req("DELETE", "/v1/me/availability/2026-10-03", headers)).statusCode).toBe(204);
    expect((await req("GET", "/v1/me/availability", headers)).json().days).toEqual([{ date: "2026-09-26", available: false, from: null, to: null }]);
  });

  it("keeps weekdays they're never free", async () => {
    const { headers } = await t.createUser();
    expect((await req("PUT", "/v1/me/availability-weekdays", headers, { unavailable: [0, 3, 0] })).json()).toEqual({ unavailableWeekdays: [0, 3] });
    expect((await req("GET", "/v1/me/availability", headers)).json().unavailableWeekdays).toEqual([0, 3]);
    await req("PUT", "/v1/me/availability-weekdays", headers, { unavailable: [] });
    expect((await req("GET", "/v1/me/availability", headers)).json().unavailableWeekdays).toEqual([]);
    expect((await req("PUT", "/v1/me/availability-weekdays", headers, { unavailable: [7] })).statusCode).toBe(400);
  });

  it("refuses hours that end before they start, and isn't for the signed out", async () => {
    const { headers } = await t.createUser();
    expect((await req("PUT", "/v1/me/availability/2026-09-26", headers, { available: true, from: "15:00", to: "10:00" })).statusCode).toBe(400);
    expect((await req("PUT", "/v1/me/availability/2026-09-31", headers, { available: true })).statusCode).toBe(400);
    expect((await req("GET", "/v1/me/availability", {})).statusCode).toBe(401);
  });

  it("is read for many umpires at once, for suggestions", async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await req("PUT", "/v1/me/availability/2026-09-26", a.headers, { available: true });
    await req("PUT", "/v1/me/availability-weekdays", b.headers, { unavailable: [6] });
    const all = await availabilityOf(t.db, [a.user.id, b.user.id], "2026-09-20", "2026-10-31");
    expect([...all.get(a.user.id)!.days.keys()]).toEqual(["2026-09-26"]);
    expect(all.get(b.user.id)).toEqual({ days: new Map(), weekdays: [6] });
  });
});
