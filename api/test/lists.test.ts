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
    // Renaming onto a name that's taken is refused.
    const other = await add(admin.headers, examples[2]!);
    const clash = await t.app.inject({ method: "PATCH", url: `/v1/${path}/${res.json().id}`, headers: admin.headers, payload: { name: examples[2] } });
    expect(clash.statusCode).toBe(409);
    await t.app.inject({ method: "DELETE", url: `/v1/${path}/${other.json().id}`, headers: admin.headers });

    const rename = await t.app.inject({ method: "PATCH", url: `/v1/${path}/${res.json().id}`, headers: admin.headers, payload: { name: examples[1] } });
    expect(rename.json().name).toBe(examples[1]);
    expect(await names(`/v1/${path}`)).toEqual([examples[1]]);

    const del = await t.app.inject({ method: "DELETE", url: `/v1/${path}/${res.json().id}`, headers: admin.headers });
    expect(del.statusCode).toBe(204);
    expect(await names(`/v1/${path}`)).toEqual([]);
  });

  it("lets umpires add a missing one, but leaves renaming and deleting to admins", async () => {
    const umpire = await t.createUser();
    const res = await add(umpire.headers, examples[0]!);
    expect(res.statusCode).toBe(201);
    const id = res.json().id;
    expect((await t.app.inject({ method: "PATCH", url: `/v1/${path}/${id}`, headers: umpire.headers, payload: { name: "Other" } })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "DELETE", url: `/v1/${path}/${id}`, headers: umpire.headers })).statusCode).toBe(403);

    // Signed in, but not an umpire.
    const { club } = await t.createClub("Oxford Hawks");
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    expect((await add(clubAdmin.headers, examples[1]!)).statusCode).toBe(403);
    expect((await t.app.inject({ method: "POST", url: `/v1/${path}`, payload: { name: examples[1] } })).statusCode).toBe(401);
  });

  it("answers with the one already there, whatever its capitals and spaces", async () => {
    const umpire = await t.createUser();
    const first = await add(umpire.headers, examples[0]!);
    const again = await add(umpire.headers, `  ${examples[0]!.toUpperCase().replace(" ", "   ")} `);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());
    expect(await names(`/v1/${path}`)).toEqual([examples[0]]);
  });

  it("lists them publicly, and finds them by every word typed", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    for (const name of examples) await add(admin.headers, name);
    expect(await names(`/v1/${path}`)).toEqual([...examples].sort());
    expect(await names(`/v1/${path}?q=${query}`)).toEqual([found]);
  });
});
