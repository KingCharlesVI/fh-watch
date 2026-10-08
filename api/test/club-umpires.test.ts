import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string>, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

/** A club, its club admin, and an umpire. */
async function setup() {
  const { club, teams } = await t.createClub("Oxford Hawks", ["M1", "M2"]);
  const clubAdmin = await t.createUser({ roles: ["umpire", "club_admin"], clubId: club.id, name: "Casey Admin" });
  const umpire = await t.createUser({ name: "Sam Umpire" });
  return { club, teams, clubAdmin, umpire };
}

describe("a club's umpire list", () => {
  it("is kept by the club's admins: add, set a level and team, list, remove", async () => {
    const { club, teams, clubAdmin, umpire } = await setup();
    const url = `/v1/clubs/${club.id}/umpires/${umpire.user.id}`;

    const added = await req("PUT", url, clubAdmin.headers, {});
    expect(added.statusCode).toBe(201);
    expect(added.json()).toMatchObject({ userId: umpire.user.id, displayName: "Sam Umpire", level: null, playsForTeamId: null });

    const changed = await req("PUT", url, clubAdmin.headers, { level: 2, playsForTeamId: teams[1]!.id });
    expect(changed.statusCode).toBe(200);
    expect(changed.json()).toMatchObject({ level: 2, playsForTeamId: teams[1]!.id });
    // Leaving a field out keeps it.
    expect((await req("PUT", url, clubAdmin.headers, { level: 3 })).json()).toMatchObject({ level: 3, playsForTeamId: teams[1]!.id });

    const list = (await req("GET", `/v1/clubs/${club.id}/umpires`, clubAdmin.headers)).json().items;
    expect(list.map((u: { displayName: string }) => u.displayName)).toEqual(["Sam Umpire"]);

    expect((await req("DELETE", url, clubAdmin.headers)).statusCode).toBe(204);
    expect((await req("GET", `/v1/clubs/${club.id}/umpires`, clubAdmin.headers)).json().items).toEqual([]);
    expect((await req("DELETE", url, clubAdmin.headers)).statusCode).toBe(404);
  });

  it("only takes registered umpires, and the club's own teams", async () => {
    const { club, clubAdmin } = await setup();
    const unverified = await t.createUser({ verified: false });
    const notUmpire = await t.createUser({ roles: ["admin"] });
    for (const u of [unverified, notUmpire]) {
      expect((await req("PUT", `/v1/clubs/${club.id}/umpires/${u.user.id}`, clubAdmin.headers, {})).statusCode).toBe(404);
    }
    const { teams: otherTeams } = await t.createClub("Reading", ["M1"]);
    const umpire = await t.createUser();
    const res = await req("PUT", `/v1/clubs/${club.id}/umpires/${umpire.user.id}`, clubAdmin.headers, { playsForTeamId: otherTeams[0]!.id });
    expect(res.statusCode).toBe(400);
    expect((await req("PUT", `/v1/clubs/${club.id}/umpires/${umpire.user.id}`, clubAdmin.headers, { level: 9 })).statusCode).toBe(400);
  });

  it("is only for that club's admins, though an umpire can leave it", async () => {
    const { club, umpire, clubAdmin } = await setup();
    const { club: other } = await t.createClub("Reading");
    const otherAdmin = await t.createUser({ roles: ["club_admin"], clubId: other.id });
    const url = `/v1/clubs/${club.id}/umpires/${umpire.user.id}`;
    expect((await req("PUT", url, otherAdmin.headers, {})).statusCode).toBe(403);
    expect((await req("PUT", url, umpire.headers, {})).statusCode).toBe(403);
    expect((await req("GET", `/v1/clubs/${club.id}/umpires`, umpire.headers)).statusCode).toBe(403);

    await req("PUT", url, clubAdmin.headers, {});
    const mine = (await req("GET", "/v1/me/umpiring-clubs", umpire.headers)).json().items;
    expect(mine.map((c: { name: string }) => c.name)).toEqual(["Oxford Hawks"]);
    expect((await req("DELETE", url, umpire.headers)).statusCode).toBe(204);
    expect((await req("GET", "/v1/me/umpiring-clubs", umpire.headers)).json().items).toEqual([]);
  });

  it("lets one umpire be on several clubs' lists", async () => {
    const { club, clubAdmin, umpire } = await setup();
    const { club: other } = await t.createClub("Reading");
    const otherAdmin = await t.createUser({ roles: ["club_admin"], clubId: other.id });
    await req("PUT", `/v1/clubs/${club.id}/umpires/${umpire.user.id}`, clubAdmin.headers, {});
    await req("PUT", `/v1/clubs/${other.id}/umpires/${umpire.user.id}`, otherAdmin.headers, {});
    const mine = (await req("GET", "/v1/me/umpiring-clubs", umpire.headers)).json().items;
    expect(mine.map((c: { name: string }) => c.name)).toEqual(["Oxford Hawks", "Reading"]);
  });

  it("lets club admins look umpires up by name", async () => {
    const { clubAdmin } = await setup();
    const clubAdminOnly = await t.createUser({ roles: ["club_admin"], clubId: clubAdmin.user.clubId });
    const res = await req("GET", "/v1/umpires?q=sam", clubAdminOnly.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((u: { displayName: string }) => u.displayName)).toEqual(["Sam Umpire"]);
  });
});

describe("competitions' umpire levels", () => {
  it("are set and cleared by admins, and read by anyone signed in", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser();
    const competition = (await req("POST", "/v1/competitions", admin.headers, { name: "South Men's Division 2" })).json();
    const url = `/v1/competitions/${competition.id}/umpire-level`;

    expect((await req("PUT", url, umpire.headers, { minLevel: 2 })).statusCode).toBe(403);
    expect((await req("PUT", url, admin.headers, { minLevel: 2 })).json()).toEqual({ competitionId: competition.id, minLevel: 2 });
    expect((await req("PUT", url, admin.headers, { minLevel: 3 })).statusCode).toBe(200);
    expect((await req("GET", "/v1/competitions/umpire-levels", umpire.headers)).json().items).toEqual([{ competitionId: competition.id, minLevel: 3 }]);

    await req("PUT", url, admin.headers, { minLevel: null });
    expect((await req("GET", "/v1/competitions/umpire-levels", umpire.headers)).json().items).toEqual([]);
    expect((await req("GET", "/v1/competitions/umpire-levels", {})).statusCode).toBe(401);
  });
});
