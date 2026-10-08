import { describe, expect, it } from "vitest";
import { setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const send = (headers: Record<string, string>, body: object) => t.app.inject({ method: "POST", url: "/v1/import", headers, payload: body });
const names = async (path: string) => (await t.app.inject({ method: "GET", url: path })).json().items.map((x: { name: string }) => x.name);

describe("importing clubs and teams", () => {
  it("adds what's missing, leaves what's there, and reports bad rows", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club } = await t.createClub("Oxford Hawks", ["M1"]);
    const rows = [
      ["oxford hawks", "m1"], // already there, in other capitals
      ["Oxford Hawks", "Ladies 1"],
      ["Reading", "M1"],
      ["Reading", "M2"],
      ["  Reading  ", "M2"], // repeated
      ["Bath Buccaneers"], // a club with no team
      ["X", "M1"],
      ["Bath Buccaneers", "!!"],
    ];

    const preview = await send(admin.headers, { kind: "clubs", rows, dryRun: true });
    expect(preview.statusCode).toBe(200);
    const expected = {
      added: ["Oxford Hawks Ladies 1", "Reading", "Reading M1", "Reading M2", "Bath Buccaneers"],
      existing: 2,
      errors: [
        { row: 6, message: "The club needs a name of at least 2 characters." },
        { row: 7, message: "The team's name needs at least one letter or digit." },
      ],
    };
    expect(preview.json()).toEqual(expected);
    // A dry run changes nothing.
    expect(await names("/v1/clubs")).toEqual(["Oxford Hawks"]);

    const done = await send(admin.headers, { kind: "clubs", rows });
    expect(done.json()).toEqual(expected);
    expect(await names("/v1/clubs")).toEqual(["Bath Buccaneers", "Oxford Hawks", "Reading"]);
    expect((await names(`/v1/clubs/${club.id}/teams`)).sort()).toEqual(["Ladies 1", "M1"]);

    // Again: everything's there now.
    const again = (await send(admin.headers, { kind: "clubs", rows })).json();
    expect(again.added).toEqual([]);
    expect(again.existing).toBe(6);
  });

  it("treats a club with the same slug as the same club", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    await t.createClub("St. Albans");
    const res = (await send(admin.headers, { kind: "clubs", rows: [["St Albans", "M1"]] })).json();
    expect(res.added).toEqual(["St Albans M1"]);
    expect(await names("/v1/clubs")).toEqual(["St. Albans"]);
  });
});

describe.each([
  { kind: "venues", path: "/v1/venues" },
  { kind: "competitions", path: "/v1/competitions" },
])("importing $kind", ({ kind, path }) => {
  it("adds names that are missing, in any capitals", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    await send(admin.headers, { kind, rows: [["Banbury Road"]] });
    const res = (await send(admin.headers, { kind, rows: [["BANBURY ROAD"], ["Sonning  Lane"], ["Sonning Lane"], ["a"]] })).json();
    expect(res).toEqual({
      added: ["Sonning Lane"],
      existing: 2,
      errors: [{ row: 3, message: `The ${kind.slice(0, -1)} needs a name of at least 2 characters.` }],
    });
    expect(await names(path)).toEqual(["Banbury Road", "Sonning Lane"]);
  });
});

describe("who can import", () => {
  it("is admins only", async () => {
    const { club } = await t.createClub("Oxford Hawks");
    for (const user of [await t.createUser(), await t.createUser({ roles: ["club_admin"], clubId: club.id })]) {
      expect((await send(user.headers, { kind: "venues", rows: [["Banbury Road"]] })).statusCode).toBe(403);
    }
    expect((await t.app.inject({ method: "POST", url: "/v1/import", payload: { kind: "venues", rows: [["Banbury Road"]] } })).statusCode).toBe(401);
  });
});
