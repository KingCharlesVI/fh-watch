import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const names = async (url: string) => (await t.app.inject({ method: "GET", url })).json().items.map((v: { name: string }) => v.name);

describe.each([
  { path: "venues", examples: ["Banbury Road, Oxford", "Sonning Lane, Reading", "Banbury Academy"], query: "banbury%20oxf", found: "Banbury Road, Oxford" },
  { path: "competitions", examples: ["South Men's Division 2", "Hampshire Cup", "South Women's Division 2"], query: "hampshire%20cup", found: "Hampshire Cup" },
])("$path", ({ path, examples, query, found }) => {
  const add = (headers: Record<string, string>, name: string) => t.app.inject({ method: "POST", url: `/v1/${path}`, headers, payload: { name } });

  it("lets admins add, rename and delete them, with no two the same", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const res = await add(admin.headers, examples[0]!);
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: expect.any(String), name: examples[0] });
    expect((await add(admin.headers, examples[0]!)).statusCode).toBe(409);

    const rename = await t.app.inject({ method: "PATCH", url: `/v1/${path}/${res.json().id}`, headers: admin.headers, payload: { name: examples[1] } });
    expect(rename.json().name).toBe(examples[1]);
    expect(await names(`/v1/${path}`)).toEqual([examples[1]]);

    const del = await t.app.inject({ method: "DELETE", url: `/v1/${path}/${res.json().id}`, headers: admin.headers });
    expect(del.statusCode).toBe(204);
    expect(await names(`/v1/${path}`)).toEqual([]);
  });

  it("leaves them to admins: not club admins or umpires", async () => {
    const { club } = await t.createClub("Oxford Hawks");
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    expect((await add(clubAdmin.headers, examples[0]!)).statusCode).toBe(403);
    expect((await add((await t.createUser()).headers, examples[0]!)).statusCode).toBe(403);
  });

  it("lists them publicly, and finds them by every word typed", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    for (const name of examples) await add(admin.headers, name);
    expect(await names(`/v1/${path}`)).toEqual([...examples].sort());
    expect(await names(`/v1/${path}?q=${query}`)).toEqual([found]);
  });
});
