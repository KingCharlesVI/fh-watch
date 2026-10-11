import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

async function setup() {
  const { club, teams } = await t.createClub("Oxford Hawks", ["M1", "M2"]);
  const { teams: reading } = await t.createClub("Reading", ["M1"]);
  const clubAdmin = await t.createUser({ roles: ["umpire", "club_admin"], clubId: club.id });
  return { club, teams, reading, clubAdmin, url: `/v1/clubs/${club.id}/fixtures` };
}

const FORMAT = { periods: 4, periodMinutes: 15, breakMinutes: 2, halfTimeMinutes: 5, shootoutIfDrawn: false };

describe("fixtures", () => {
  it("are added, listed from today, changed and deleted by the club's admins", async () => {
    const { teams, reading, clubAdmin, url } = await setup();
    // The test clock is 2026-09-19.
    const added = await req("POST", url, clubAdmin.headers, {
      date: "2026-09-26",
      time: "14:00",
      home: { name: "M1" },
      away: { name: "Reading M1" },
      venue: "Banbury Road",
      competition: "South Men's Division 2",
      format: FORMAT,
    });
    expect(added.statusCode).toBe(201);
    const fixture = added.json();
    // Names are linked to the site's teams: the club's own by name, another's as "Club Team".
    expect(fixture).toMatchObject({
      date: "2026-09-26",
      time: "14:00",
      home: { name: "M1", teamId: teams[0]!.id },
      away: { name: "Reading M1", teamId: reading[0]!.id },
      umpiresNeeded: 2,
      format: FORMAT,
      notes: null,
    });
    await req("POST", url, clubAdmin.headers, { date: "2026-09-12", home: { name: "M2" }, away: { name: "Bath" } });
    await req("POST", url, clubAdmin.headers, { date: "2026-09-26", time: "10:30", home: { name: "M2" }, away: { name: "Bath" }, umpiresNeeded: 1 });

    // From today, by date and kick-off.
    const list = (await req("GET", url, clubAdmin.headers)).json().items;
    expect(list.map((f: { time: string }) => f.time)).toEqual(["10:30", "14:00"]);
    expect((await req("GET", `${url}?from=2026-09-01&to=2026-09-20`, clubAdmin.headers)).json().items).toHaveLength(1);

    const changed = await req("PATCH", `${url}/${fixture.id}`, clubAdmin.headers, { time: null, umpiresNeeded: 1, notes: "Bring a spare whistle" });
    expect(changed.json()).toMatchObject({ time: null, umpiresNeeded: 1, notes: "Bring a spare whistle", home: { name: "M1" } });

    expect((await req("DELETE", `${url}/${fixture.id}`, clubAdmin.headers)).statusCode).toBe(204);
    expect((await req("GET", `${url}/${fixture.id}`, clubAdmin.headers)).statusCode).toBe(404);
  });

  it("refuse bad times, unknown teams and other clubs' admins", async () => {
    const { club, clubAdmin, url } = await setup();
    const base = { date: "2026-09-26", home: { name: "M1" }, away: { name: "Bath" } };
    expect((await req("POST", url, clubAdmin.headers, { ...base, time: "2pm" })).statusCode).toBe(400);
    expect((await req("POST", url, clubAdmin.headers, { ...base, home: { name: "M1", teamId: crypto.randomUUID() } })).statusCode).toBe(400);
    expect((await req("POST", url, clubAdmin.headers, { ...base, umpiresNeeded: 3 })).statusCode).toBe(400);

    const { club: other } = await t.createClub("Bath");
    const otherAdmin = await t.createUser({ roles: ["club_admin"], clubId: other.id });
    const umpire = await t.createUser();
    for (const who of [otherAdmin, umpire]) {
      expect((await req("POST", url, who.headers, base)).statusCode).toBe(403);
      expect((await req("GET", url, who.headers)).statusCode).toBe(403);
    }
    // A fixture of one club can't be reached through another's path.
    const fixture = (await req("POST", url, clubAdmin.headers, base)).json();
    const admin = await t.createUser({ roles: ["admin"] });
    expect((await req("GET", `/v1/clubs/${other.id}/fixtures/${fixture.id}`, admin.headers)).statusCode).toBe(404);
    expect((await req("GET", `/v1/clubs/${club.id}/fixtures/${fixture.id}`, admin.headers)).statusCode).toBe(200);
  });
});

describe("importing fixtures", () => {
  it("adds them from a spreadsheet's rows, previewing first, and skips ones already there", async () => {
    const { teams, clubAdmin, url } = await setup();
    const rows = [
      ["26/09/2026", "2pm", "M1", "Reading M1", "Banbury Road", "South Men's Division 2", "2"],
      ["2026-09-26", "", "M2", "Bath", "", "", "1"],
      ["3/10/26", "10:30", "Oxford Hawks M1", "Bath"],
      ["31/09/2026", "14:00", "M1", "Bath"],
      ["4/10/2026", "half two", "M1", "Bath"],
      ["4/10/2026", "14:00", "M1", ""],
      ["4/10/2026", "14:00", "M1", "Bath", "", "", "3"],
    ];
    const preview = await req("POST", `${url}/import`, clubAdmin.headers, { rows, dryRun: true });
    const expected = {
      added: ["2026-09-26 14:00: M1 v Reading M1", "2026-09-26: M2 v Bath", "2026-10-03 10:30: Oxford Hawks M1 v Bath"],
      existing: 0,
      errors: [
        { row: 3, message: "“31/09/2026” isn't a date. Use 11/10/2026 or 2026-10-11." },
        { row: 4, message: "“half two” isn't a kick-off time. Use 14:00." },
        { row: 5, message: "Both teams are needed." },
        { row: 6, message: "Umpires needed is 1 or 2." },
      ],
    };
    expect(preview.json()).toEqual(expected);
    expect((await req("GET", `${url}?from=2026-01-01`, clubAdmin.headers)).json().items).toEqual([]);

    expect((await req("POST", `${url}/import`, clubAdmin.headers, { rows })).json()).toEqual(expected);
    const list = (await req("GET", `${url}?from=2026-01-01`, clubAdmin.headers)).json().items;
    expect(list).toHaveLength(3);
    expect(list[2]).toMatchObject({ home: { name: "Oxford Hawks M1", teamId: teams[0]!.id }, away: { teamId: null }, umpiresNeeded: 2 });
    expect(list.find((f: { home: { name: string } }) => f.home.name === "M2")).toMatchObject({ time: null, umpiresNeeded: 1, venue: null });

    // The same file again adds nothing.
    const again = (await req("POST", `${url}/import`, clubAdmin.headers, { rows: rows.slice(0, 3) })).json();
    expect(again).toEqual({ added: [], existing: 3, errors: [] });
  });
});
