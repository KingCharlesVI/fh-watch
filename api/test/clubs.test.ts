import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

describe("clubs and teams", () => {
  it("lets admins create clubs, with a slug from the name", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const res = await t.app.inject({ method: "POST", url: "/v1/clubs", headers: admin.headers, payload: { name: "Bath Buccaneers" } });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ name: "Bath Buccaneers", slug: "bath-buccaneers" });

    const dup = await t.app.inject({ method: "POST", url: "/v1/clubs", headers: admin.headers, payload: { name: "Bath Buccaneers" } });
    expect(dup.statusCode).toBe(409);

    const umpire = await t.createUser();
    const denied = await t.app.inject({ method: "POST", url: "/v1/clubs", headers: umpire.headers, payload: { name: "Other" } });
    expect(denied.statusCode).toBe(403);
  });

  it("serves clubs and their teams publicly, by id or slug", async () => {
    const { club } = await t.createClub("Oxford Hawks", ["M1", "L1"]);
    const bySlug = await t.app.inject({ method: "GET", url: "/v1/clubs/oxford-hawks" });
    expect(bySlug.json()).toMatchObject({ id: club.id, teams: [{ name: "L1" }, { name: "M1" }] });
    const byId = await t.app.inject({ method: "GET", url: `/v1/clubs/${club.id}` });
    expect(byId.json().slug).toBe("oxford-hawks");
  });

  it("lets a club admin add and rename their own club's teams, but not delete or touch others", async () => {
    const { club } = await t.createClub("Oxford Hawks");
    const { club: other } = await t.createClub("Reading");
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });

    const add = await t.app.inject({
      method: "POST",
      url: `/v1/clubs/${club.id}/teams`,
      headers: clubAdmin.headers,
      payload: { name: "Men's 1s" },
    });
    expect(add.statusCode).toBe(201);
    expect(add.json().slug).toBe("mens-1s");

    const rename = await t.app.inject({
      method: "PATCH",
      url: `/v1/clubs/${club.id}/teams/${add.json().id}`,
      headers: clubAdmin.headers,
      payload: { name: "Men's 1st XI" },
    });
    expect(rename.json().name).toBe("Men's 1st XI");

    const del = await t.app.inject({ method: "DELETE", url: `/v1/clubs/${club.id}/teams/${add.json().id}`, headers: clubAdmin.headers });
    expect(del.statusCode).toBe(403);

    const elsewhere = await t.app.inject({
      method: "POST",
      url: `/v1/clubs/${other.id}/teams`,
      headers: clubAdmin.headers,
      payload: { name: "M1" },
    });
    expect(elsewhere.statusCode).toBe(403);
  });

  it("searches teams by club and team name together", async () => {
    await t.createClub("Oxford Hawks", ["M1", "M2", "L1"]);
    await t.createClub("Reading", ["M1"]);
    const res = await t.app.inject({ method: "GET", url: "/v1/teams?q=hawks%20m" });
    expect(res.json().items.map((x: { club: { name: string }; name: string }) => `${x.club.name} ${x.name}`)).toEqual([
      "Oxford Hawks M1",
      "Oxford Hawks M2",
    ]);
  });

  it("strips the club admin role when a club is deleted", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club } = await t.createClub("Oxford Hawks", ["M1"]);
    const clubAdmin = await t.createUser({ roles: ["umpire", "club_admin"], clubId: club.id });
    const res = await t.app.inject({ method: "DELETE", url: `/v1/clubs/${club.id}`, headers: admin.headers });
    expect(res.statusCode).toBe(204);
    const me = await t.app.inject({ method: "GET", url: "/v1/me", headers: clubAdmin.headers });
    expect(me.json()).toMatchObject({ roles: ["umpire"], clubId: null });
  });
});

describe("club requests", () => {
  it("creates the requested club and makes the requester its admin on approval", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const user = await t.createUser();
    const req = await t.app.inject({
      method: "POST",
      url: "/v1/club-requests",
      headers: user.headers,
      payload: { clubName: "Witney", wantsAdmin: true },
    });
    expect(req.statusCode).toBe(201);

    const pending = await t.app.inject({ method: "GET", url: "/v1/club-requests?status=pending", headers: admin.headers });
    expect(pending.json().items).toHaveLength(1);

    const approve = await t.app.inject({ method: "POST", url: `/v1/club-requests/${req.json().id}/approve`, headers: admin.headers });
    expect(approve.statusCode).toBe(200);
    const clubId = approve.json().clubId;

    const me = await t.app.inject({ method: "GET", url: "/v1/me", headers: user.headers });
    expect(me.json()).toMatchObject({ roles: ["umpire", "club_admin"], clubId });

    const again = await t.app.inject({ method: "POST", url: `/v1/club-requests/${req.json().id}/approve`, headers: admin.headers });
    expect(again.statusCode).toBe(409);
  });

  it("adds a club without making anyone its admin when not asked", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const user = await t.createUser();
    const req = await t.app.inject({
      method: "POST",
      url: "/v1/club-requests",
      headers: user.headers,
      payload: { clubName: "Witney", wantsAdmin: false },
    });
    await t.app.inject({ method: "POST", url: `/v1/club-requests/${req.json().id}/approve`, headers: admin.headers });
    const me = await t.app.inject({ method: "GET", url: "/v1/me", headers: user.headers });
    expect(me.json().roles).toEqual(["umpire"]);
    expect((await t.app.inject({ method: "GET", url: "/v1/clubs/witney" })).statusCode).toBe(200);
  });

  it("refuses to make someone admin of a second club", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club: a } = await t.createClub("A Club");
    const { club: b } = await t.createClub("B Club");
    const user = await t.createUser({ roles: ["club_admin"], clubId: a.id });
    const req = await t.app.inject({ method: "POST", url: "/v1/club-requests", headers: user.headers, payload: { clubId: b.id } });
    const approve = await t.app.inject({ method: "POST", url: `/v1/club-requests/${req.json().id}/approve`, headers: admin.headers });
    expect(approve.statusCode).toBe(409);
  });

  it("shows users only their own requests", async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    await t.app.inject({ method: "POST", url: "/v1/club-requests", headers: a.headers, payload: { clubName: "Witney", wantsAdmin: true } });
    const res = await t.app.inject({ method: "GET", url: "/v1/club-requests", headers: b.headers });
    expect(res.json().items).toEqual([]);
  });
});
