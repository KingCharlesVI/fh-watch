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

  it("lists every club's teams without a search, by club then team", async () => {
    await t.createClub("Reading", ["M1"]);
    await t.createClub("Oxford Hawks", ["M2", "L1"]);
    const res = await t.app.inject({ method: "GET", url: "/v1/teams" });
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((x: { club: { name: string }; name: string }) => `${x.club.name} ${x.name}`)).toEqual([
      "Oxford Hawks L1",
      "Oxford Hawks M2",
      "Reading M1",
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

describe("club logos", () => {
  // The PNG signature and a few bytes: enough to be recognised as a PNG.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("rest of the image")]);
  const put = (clubId: string, headers: Record<string, string>, body: Buffer, type = "image/png") =>
    t.app.inject({ method: "PUT", url: `/v1/clubs/${clubId}/logo`, headers: { ...headers, "content-type": type }, payload: body });

  it("lets admins set a logo, which is then served publicly at a versioned URL", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club } = await t.createClub("Oxford Hawks");

    const none = await t.app.inject({ method: "GET", url: `/v1/clubs/${club.id}` });
    expect(none.json().logoUrl).toBeNull();

    const res = await put(club.id, admin.headers, png);
    expect(res.statusCode).toBe(200);
    const { logoUrl } = res.json();
    expect(logoUrl).toBe(`/v1/clubs/${club.id}/logo?v=${t.clock.now.getTime()}`);

    const list = await t.app.inject({ method: "GET", url: "/v1/clubs" });
    expect(list.json().items[0].logoUrl).toBe(logoUrl);

    const image = await t.app.inject({ method: "GET", url: logoUrl });
    expect(image.statusCode).toBe(200);
    expect(image.headers["content-type"]).toBe("image/png");
    expect(image.headers["cache-control"]).toContain("immutable");
    expect(image.rawPayload.equals(png)).toBe(true);

    t.advance(1000);
    const replaced = await put(club.id, admin.headers, png);
    expect(replaced.json().logoUrl).not.toBe(logoUrl);
  });

  it("serves the type the bytes really are, and refuses anything that isn't an image", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club } = await t.createClub("Oxford Hawks");

    // Labelled JPEG, but it's a PNG.
    const res = await put(club.id, admin.headers, png, "image/jpeg");
    const image = await t.app.inject({ method: "GET", url: res.json().logoUrl });
    expect(image.headers["content-type"]).toBe("image/png");

    const bogus = await put(club.id, admin.headers, Buffer.from("<svg onload=alert(1)>"));
    expect(bogus.statusCode).toBe(400);
    const svg = await put(club.id, admin.headers, Buffer.from("<svg/>"), "image/svg+xml");
    expect(svg.statusCode).toBe(415);
    const big = await put(club.id, admin.headers, Buffer.concat([png, Buffer.alloc(512 * 1024)]));
    expect(big.statusCode).toBe(413);
  });

  it("lets only admins set or remove a logo", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club } = await t.createClub("Oxford Hawks");
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    expect((await put(club.id, clubAdmin.headers, png)).statusCode).toBe(403);

    await put(club.id, admin.headers, png);
    const denied = await t.app.inject({ method: "DELETE", url: `/v1/clubs/${club.id}/logo`, headers: clubAdmin.headers });
    expect(denied.statusCode).toBe(403);

    const removed = await t.app.inject({ method: "DELETE", url: `/v1/clubs/${club.id}/logo`, headers: admin.headers });
    expect(removed.json().logoUrl).toBeNull();
    const gone = await t.app.inject({ method: "GET", url: `/v1/clubs/${club.id}/logo` });
    expect(gone.statusCode).toBe(404);
  });
});
