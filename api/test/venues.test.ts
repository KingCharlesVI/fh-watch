import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const add = (headers: Record<string, string>, name: string) => t.app.inject({ method: "POST", url: "/v1/venues", headers, payload: { name } });
const names = async (url: string) => (await t.app.inject({ method: "GET", url })).json().items.map((v: { name: string }) => v.name);

describe("venues", () => {
  it("lets admins add, rename and delete venues, with no two the same", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const res = await add(admin.headers, "Banbury Road, Oxford");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), name: "Banbury Road, Oxford" });
    expect((await add(admin.headers, "Banbury Road, Oxford")).statusCode).toBe(409);

    const rename = await t.app.inject({ method: "PATCH", url: `/v1/venues/${res.json().id}`, headers: admin.headers, payload: { name: "Iffley Road, Oxford" } });
    expect(rename.json().name).toBe("Iffley Road, Oxford");
    expect(await names("/v1/venues")).toEqual(["Iffley Road, Oxford"]);

    const del = await t.app.inject({ method: "DELETE", url: `/v1/venues/${res.json().id}`, headers: admin.headers });
    expect(del.statusCode).toBe(204);
    expect(await names("/v1/venues")).toEqual([]);
  });

  it("leaves them to admins: not club admins or umpires", async () => {
    const { club } = await t.createClub("Oxford Hawks");
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    expect((await add(clubAdmin.headers, "Banbury Road")).statusCode).toBe(403);
    expect((await add((await t.createUser()).headers, "Banbury Road")).statusCode).toBe(403);
  });

  it("lists them publicly, and finds them by every word typed", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    for (const name of ["Banbury Road, Oxford", "Sonning Lane, Reading", "Banbury Academy"]) await add(admin.headers, name);
    expect(await names("/v1/venues")).toEqual(["Banbury Academy", "Banbury Road, Oxford", "Sonning Lane, Reading"]);
    expect(await names("/v1/venues?q=banbury%20oxf")).toEqual(["Banbury Road, Oxford"]);
  });
});
