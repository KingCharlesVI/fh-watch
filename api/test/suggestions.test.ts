import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

type Suggestion = { displayName: string; availability: string; seasonAppointments: number; clashes: string[] };

describe("suggestions for a fixture", () => {
  it("rank the club's umpires by availability, clashes and how much they've done", async () => {
    const { club, teams } = await t.createClub("Oxford Hawks", ["M1", "M2"]);
    const admin = await t.createUser({ roles: ["admin"] });
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    const names = ["Ash", "Bo", "Cy", "Di", "Ed", "Flo"] as const;
    const u = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await t.createUser({ name: n })] as const))) as Record<
      (typeof names)[number],
      Awaited<ReturnType<typeof t.createUser>>
    >;
    for (const n of names) await req("PUT", `/v1/clubs/${club.id}/umpires/${u[n].user.id}`, clubAdmin.headers, {});
    const fixtures = `/v1/clubs/${club.id}/fixtures`;
    const add = async (body: object) => (await req("POST", fixtures, clubAdmin.headers, { date: "2026-09-26", ...body })).json();

    // The fixture: M1 at home at 14:00, in a competition asking for Level 2.
    const competition = (await req("POST", "/v1/competitions", admin.headers, { name: "South Men's Division 2" })).json();
    await req("PUT", `/v1/competitions/${competition.id}/umpire-level`, admin.headers, { minLevel: 3 });
    const fixture = await add({ time: "14:00", home: { name: "M1" }, away: { name: "Reading M1" }, venue: "Banbury Road", competition: "south men's division 2" });

    // Ash: free, Level 2, done nothing. Bo: free and Level 3, but plays for M1.
    await req("PUT", `/v1/clubs/${club.id}/umpires/${u.Ash.user.id}`, clubAdmin.headers, { level: 3 });
    await req("PUT", `/v1/clubs/${club.id}/umpires/${u.Bo.user.id}`, clubAdmin.headers, { level: 4, playsForTeamId: teams[0]!.id });
    // Cy: free, Level 2, but umpiring elsewhere at 16:00. Di: Level 1 (Assessed), free.
    await req("PUT", `/v1/clubs/${club.id}/umpires/${u.Cy.user.id}`, clubAdmin.headers, { level: 3 });
    await req("PUT", `/v1/clubs/${club.id}/umpires/${u.Di.user.id}`, clubAdmin.headers, { level: 2 });
    const elsewhere = await add({ time: "16:00", home: { name: "M2" }, away: { name: "Bath" }, venue: "Sonning Lane" });
    await req("POST", `${fixtures}/${elsewhere.id}/appointments`, clubAdmin.headers, { userId: u.Cy.user.id, role: "watch" });
    // Ed: Level 2, never free on Saturdays. Flo: Level 2, nothing said, but plays for M2 at 16:00.
    await req("PUT", `/v1/clubs/${club.id}/umpires/${u.Ed.user.id}`, clubAdmin.headers, { level: 3 });
    await req("PUT", "/v1/me/availability-weekdays", u.Ed.headers, { unavailable: [6] });
    await req("PUT", `/v1/clubs/${club.id}/umpires/${u.Flo.user.id}`, clubAdmin.headers, { level: 3, playsForTeamId: teams[1]!.id });
    for (const n of ["Ash", "Bo", "Cy", "Di"] as const) await req("PUT", "/v1/me/availability/2026-09-26", u[n].headers, { available: true });

    // Ash has done one this season already; so has Di.
    const earlier = await add({ date: "2026-09-19", home: { name: "M1" }, away: { name: "Bath" } });
    for (const [n, role] of [["Ash", "watch"], ["Di", "second"]] as const) {
      const a = (await req("POST", `${fixtures}/${earlier.id}/appointments`, clubAdmin.headers, { userId: u[n].user.id, role })).json();
      await req("POST", `/v1/me/appointments/${a.id}/accept`, u[n].headers);
    }

    const res = await req("GET", `${fixtures}/${fixture.id}/suggestions`, clubAdmin.headers);
    expect(res.statusCode).toBe(200);
    const items: Suggestion[] = res.json().items;
    expect(items.map((s) => [s.displayName, s.availability, s.seasonAppointments, s.clashes])).toEqual([
      ["Ash", "available", 1, []],
      ["Bo", "available", 0, ["Plays for M1 in this match"]],
      ["Cy", "available", 0, ["Umpiring at Sonning Lane at 16:00: little time to get there"]],
      ["Di", "available", 1, ["Below Level 2, which South Men's Division 2 asks for"]],
      ["Flo", "unknown", 0, ["Plays for M2 at 16:00"]],
      ["Ed", "unavailable", 0, []],
    ]);

    // The club's list counts this season's appointments too.
    const list = (await req("GET", `/v1/clubs/${club.id}/umpires`, clubAdmin.headers)).json().items;
    expect(list.find((x: { displayName: string }) => x.displayName === "Ash").seasonAppointments).toBe(1);

    expect((await req("GET", `${fixtures}/${fixture.id}/suggestions`, u.Ash.headers)).statusCode).toBe(403);
  });

  it("flag kick-offs at the same time, and people already asked", async () => {
    const { club } = await t.createClub("Oxford Hawks", ["M1"]);
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    const sam = await t.createUser({ name: "Sam" });
    await req("PUT", `/v1/clubs/${club.id}/umpires/${sam.user.id}`, clubAdmin.headers, {});
    const fixtures = `/v1/clubs/${club.id}/fixtures`;
    const a = (await req("POST", fixtures, clubAdmin.headers, { date: "2026-09-26", time: "14:00", home: { name: "M1" }, away: { name: "Bath" } })).json();
    const b = (await req("POST", fixtures, clubAdmin.headers, { date: "2026-09-26", time: "15:00", home: { name: "M2" }, away: { name: "Bath" } })).json();
    await req("POST", `${fixtures}/${a.id}/appointments`, clubAdmin.headers, { userId: sam.user.id, role: "watch" });

    const forB = (await req("GET", `${fixtures}/${b.id}/suggestions`, clubAdmin.headers)).json().items;
    expect(forB[0].clashes).toEqual(["Umpiring M1 v Bath at 14:00"]);
    const forA = (await req("GET", `${fixtures}/${a.id}/suggestions`, clubAdmin.headers)).json().items;
    expect(forA[0].clashes).toEqual(["Already on this fixture"]);
  });
});
