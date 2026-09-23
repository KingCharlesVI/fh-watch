import { describe, expect, it } from "vitest";
import { PASSWORD, matchDoc, setupTestApp } from "./helpers.js";

const t = await setupTestApp();

describe("your own account", () => {
  it("changes the display name", async () => {
    const { headers } = await t.createUser({ name: "Sam" });
    const res = await t.app.inject({ method: "PATCH", url: "/v1/me", headers, payload: { displayName: "Sam Smith" } });
    expect(res.statusCode).toBe(200);
    expect(res.json().displayName).toBe("Sam Smith");
  });

  it("needs the current password to set a new one", async () => {
    const { headers } = await t.createUser();
    const missing = await t.app.inject({ method: "PATCH", url: "/v1/me", headers, payload: { newPassword: "another good password" } });
    expect(missing.statusCode).toBe(400);
    const wrong = await t.app.inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { currentPassword: "nope", newPassword: "another good password" },
    });
    expect(wrong.statusCode).toBe(403);
    const ok = await t.app.inject({
      method: "PATCH",
      url: "/v1/me",
      headers,
      payload: { currentPassword: PASSWORD, newPassword: "another good password" },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("asks an admin to delete the account rather than deleting it", async () => {
    const { user, headers } = await t.createUser();
    expect((await t.app.inject({ method: "DELETE", url: "/v1/me", headers })).statusCode).toBe(202);
    const admin = await t.createUser({ roles: ["admin"] });
    const list = await t.app.inject({ method: "GET", url: "/v1/users?deletionRequested=true", headers: admin.headers });
    expect(list.json().items.map((u: { id: string }) => u.id)).toEqual([user.id]);
  });

  it("registers a push token, moving it if the device changes account", async () => {
    const a = await t.createUser();
    const b = await t.createUser();
    const payload = { token: "ExponentPushToken[abc]", platform: "ios" };
    expect((await t.app.inject({ method: "POST", url: "/v1/me/push-tokens", headers: a.headers, payload })).statusCode).toBe(204);
    await t.app.inject({ method: "POST", url: "/v1/me/push-tokens", headers: b.headers, payload });
    const rows = await t.db.query.pushTokens.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBe(b.user.id);
  });
});

describe("admin user management", () => {
  it("is admin-only", async () => {
    const { headers } = await t.createUser();
    expect((await t.app.inject({ method: "GET", url: "/v1/users", headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "GET", url: "/v1/users" })).statusCode).toBe(401);
  });

  it("gives roles as a set, requiring a club for club admins", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { user } = await t.createUser();
    const { club } = await t.createClub("Oxford Hawks");

    const noClub = await t.app.inject({
      method: "PATCH",
      url: `/v1/users/${user.id}`,
      headers: admin.headers,
      payload: { roles: ["umpire", "club_admin"] },
    });
    expect(noClub.statusCode).toBe(400);

    const ok = await t.app.inject({
      method: "PATCH",
      url: `/v1/users/${user.id}`,
      headers: admin.headers,
      payload: { roles: ["umpire", "club_admin"], clubId: club.id },
    });
    expect(ok.json()).toMatchObject({ roles: ["umpire", "club_admin"], clubId: club.id });

    // Dropping club_admin drops the club too.
    const dropped = await t.app.inject({
      method: "PATCH",
      url: `/v1/users/${user.id}`,
      headers: admin.headers,
      payload: { roles: ["umpire"] },
    });
    expect(dropped.json()).toMatchObject({ roles: ["umpire"], clubId: null });
  });

  it("won't let an admin remove their own admin role or delete themselves", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const demote = await t.app.inject({
      method: "PATCH",
      url: `/v1/users/${admin.user.id}`,
      headers: admin.headers,
      payload: { roles: ["umpire"] },
    });
    expect(demote.statusCode).toBe(409);
    const del = await t.app.inject({ method: "DELETE", url: `/v1/users/${admin.user.id}`, headers: admin.headers });
    expect(del.statusCode).toBe(409);
  });

  it("deletes a user but keeps their matches, credited to a deleted user", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser({ name: "Sam" });
    const doc = matchDoc();
    await t.app.inject({ method: "PUT", url: `/v1/matches/${doc.id}`, headers: umpire.headers, payload: { source: "watch", document: doc } });

    const del = await t.app.inject({ method: "DELETE", url: `/v1/users/${umpire.user.id}`, headers: admin.headers });
    expect(del.statusCode).toBe(204);

    const match = await t.app.inject({ method: "GET", url: `/v1/matches/${doc.id}`, headers: admin.headers });
    expect(match.json().match.umpires).toEqual([{ slot: 1, userId: null, name: "Deleted user" }]);
  });
});

describe("umpire lookup", () => {
  it("finds verified umpires by name", async () => {
    const me = await t.createUser({ name: "Sam" });
    await t.createUser({ name: "Alex Jones" });
    await t.createUser({ name: "Alex Unverified", verified: false });
    await t.createUser({ name: "Alex Admin", roles: ["club_admin"], clubId: (await t.createClub("C")).club.id });
    const res = await t.app.inject({ method: "GET", url: "/v1/umpires?q=alex", headers: me.headers });
    expect(res.json().items.map((u: { displayName: string }) => u.displayName)).toEqual(["Alex Jones"]);
  });
});
