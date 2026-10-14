import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const req = (method: string, url: string, headers: Record<string, string> = {}, payload?: object) =>
  t.app.inject({ method: method as "GET", url, headers, ...(payload ? { payload } : {}) });

describe("the audit log", () => {
  it("lists writes newest first, with who made them, for admins only", async () => {
    const admin = await t.createUser({ roles: ["admin"], name: "Ada" });
    const umpire = await t.createUser();
    await req("POST", "/v1/clubs", admin.headers, { name: "Oxford Hawks" });
    await req("POST", "/v1/venues", admin.headers, { name: "Banbury Road" });

    expect((await req("GET", "/v1/audit")).statusCode).toBe(401);
    expect((await req("GET", "/v1/audit", umpire.headers)).statusCode).toBe(403);

    const res = await req("GET", "/v1/audit", admin.headers);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((e: { action: string; entity: string }) => `${e.action} ${e.entity}`)).toEqual(["create venue", "create club"]);
    expect(res.json().items[1]).toMatchObject({ actor: { id: admin.user.id, displayName: "Ada" }, diff: { name: "Oxford Hawks" } });
  });

  it("filters, and pages with a cursor", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    for (const name of ["Pitch A", "Pitch B", "Pitch C"]) await req("POST", "/v1/venues", admin.headers, { name });
    await req("POST", "/v1/competitions", admin.headers, { name: "Hampshire Cup" });

    const venues = await req("GET", "/v1/audit?entity=venue&limit=2", admin.headers);
    expect(venues.json().items.map((e: { diff: { name: string } }) => e.diff.name)).toEqual(["Pitch C", "Pitch B"]);
    const more = await req("GET", `/v1/audit?entity=venue&limit=2&cursor=${venues.json().nextCursor}`, admin.headers);
    expect(more.json()).toMatchObject({ items: [{ diff: { name: "Pitch A" } }], nextCursor: null });

    const byActor = await req("GET", `/v1/audit?actorId=${admin.user.id}&action=create`, admin.headers);
    expect(byActor.json().items).toHaveLength(4);
    expect((await req("GET", "/v1/audit?cursor=nope", admin.headers)).statusCode).toBe(400);
  });
});
