import type { MatchDocument } from "@fh/shared";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { clubLogos, clubs, users } from "../src/db/schema.js";
import { matchDoc, setupTestApp } from "./helpers.js";

const t = await setupTestApp();

const put = (doc: MatchDocument, headers: Record<string, string>, ifMatch?: number) =>
  t.app.inject({
    method: "PUT",
    url: `/v1/matches/${doc.id}`,
    headers: { ...headers, ...(ifMatch === undefined ? {} : { "if-match": `"${ifMatch}"` }) },
    payload: { source: "watch", document: doc },
  });
const post = (url: string, headers: Record<string, string>, payload: Record<string, string>) => t.app.inject({ method: "POST", url, headers, payload });
const match = async (id: string, headers: Record<string, string>) => (await t.app.inject({ method: "GET", url: `/v1/matches/${id}`, headers })).json();

describe.each([
  { path: "venues", field: "venue" as const, keep: "Banbury Road, Oxford", duplicate: "Banbury Rd" },
  { path: "competitions", field: "competition" as const, keep: "South Men's Division 2", duplicate: "South Mens Div 2" },
])("merging $path", ({ path, field, keep, duplicate }) => {
  it("moves the duplicate's matches to the other name, in a new revision, and deletes it", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser();
    const kept = (await post(`/v1/${path}`, admin.headers, { name: keep })).json();
    const dup = (await post(`/v1/${path}`, admin.headers, { name: duplicate })).json();
    // Matches name it in any capitals; one elsewhere is left alone.
    const a = { ...matchDoc(), [field]: duplicate.toUpperCase() };
    const b = { ...matchDoc(), [field]: "Somewhere else" };
    await put(a, umpire.headers);
    await put(b, umpire.headers);

    const res = await post(`/v1/${path}/${dup.id}/merge`, admin.headers, { into: kept.id });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ into: kept, matches: 1 });

    const after = await match(a.id, umpire.headers);
    expect(after.match[field]).toBe(keep);
    expect(after.document[field]).toBe(keep);
    expect(after.match.currentRevision).toBe(2);
    expect((await match(b.id, umpire.headers)).match.currentRevision).toBe(1);
    const list = (await t.app.inject({ method: "GET", url: `/v1/${path}` })).json().items;
    expect(list).toEqual([kept]);

    // The umpire's phone, still on revision 1, is told the match changed.
    expect((await put({ ...a, [field]: duplicate }, umpire.headers, 1)).statusCode).toBe(412);
  });

  it("is for admins only, and needs two different ones", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser();
    const kept = (await post(`/v1/${path}`, admin.headers, { name: keep })).json();
    const dup = (await post(`/v1/${path}`, admin.headers, { name: duplicate })).json();
    expect((await post(`/v1/${path}/${dup.id}/merge`, umpire.headers, { into: kept.id })).statusCode).toBe(403);
    expect((await post(`/v1/${path}/${dup.id}/merge`, admin.headers, { into: dup.id })).statusCode).toBe(400);
    expect((await post(`/v1/${path}/${dup.id}/merge`, admin.headers, { into: crypto.randomUUID() })).statusCode).toBe(404);
  });
});

describe("merging teams", () => {
  it("relinks the duplicate's matches to the other team, in a new revision, and deletes it", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser();
    const { club, teams } = await t.createClub("Oxford Hawks", ["Men's 1s", "M1"]);
    const [kept, dup] = teams;
    const { teams: others } = await t.createClub("Reading", ["M1"]);
    const doc = matchDoc({ homeTeamId: dup!.id, awayTeamId: others[0]!.id });
    await put(doc, umpire.headers);

    const res = await post(`/v1/clubs/${club.id}/teams/${dup!.id}/merge`, admin.headers, { into: kept!.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().matches).toBe(1);

    const after = await match(doc.id, umpire.headers);
    expect(after.match.home).toMatchObject({ teamId: kept!.id, name: "Oxford Hawks M1" });
    expect(after.match.away.teamId).toBe(others[0]!.id);
    expect(after.document.teams.home.teamId).toBe(kept!.id);
    expect(after.match.currentRevision).toBe(2);
    const left = (await t.app.inject({ method: "GET", url: `/v1/clubs/${club.id}/teams` })).json().items;
    expect(left.map((x: { id: string }) => x.id)).toEqual([kept!.id]);
  });

  it("is for admins only, not club admins", async () => {
    const { club, teams } = await t.createClub("Oxford Hawks", ["Men's 1s", "M1"]);
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    expect((await post(`/v1/clubs/${club.id}/teams/${teams[1]!.id}/merge`, clubAdmin.headers, { into: teams[0]!.id })).statusCode).toBe(403);
  });
});

describe("merging clubs", () => {
  it("moves teams, admins and the logo across, merging teams with the same slug", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser();
    const { club: dup, teams: dupTeams } = await t.createClub("Oxford Hawks HC", ["M1", "Ladies 1"]);
    const { club: kept, teams: keptTeams } = await t.createClub("Oxford Hawks", ["M1"]);
    const dupAdmin = await t.createUser({ roles: ["club_admin"], clubId: dup.id });
    await t.db.insert(clubLogos).values({ clubId: dup.id, contentType: "image/png", data: Buffer.from("png") });
    await t.db.update(clubs).set({ logoUpdatedAt: t.clock.now }).where(eq(clubs.id, dup.id));
    const doc = matchDoc({ homeTeamId: dupTeams[0]!.id, awayTeamId: dupTeams[1]!.id });
    await put(doc, umpire.headers);

    const res = await post(`/v1/clubs/${dup.id}/merge`, admin.headers, { into: kept.id });
    expect(res.statusCode).toBe(200);
    expect(res.json().matches).toBe(1);
    expect(res.json().into.logoUrl).not.toBeNull();

    // M1 is merged into the kept club's M1; Ladies 1 moves across as it is.
    const after = await match(doc.id, umpire.headers);
    expect(after.match.home.teamId).toBe(keptTeams[0]!.id);
    expect(after.match.away.teamId).toBe(dupTeams[1]!.id);
    const club = (await t.app.inject({ method: "GET", url: `/v1/clubs/${kept.id}` })).json();
    expect(club.teams.map((x: { name: string }) => x.name).sort()).toEqual(["Ladies 1", "M1"]);
    expect((await t.app.inject({ method: "GET", url: `/v1/clubs/${dup.id}` })).statusCode).toBe(404);

    const [movedAdmin] = await t.db.select().from(users).where(eq(users.id, dupAdmin.user.id));
    expect(movedAdmin!.clubId).toBe(kept.id);
    expect(movedAdmin!.roles).toContain("club_admin");
  });

  it("keeps the other club's own logo", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const { club: dup } = await t.createClub("Hawks");
    const { club: kept } = await t.createClub("Oxford Hawks");
    for (const [club, data] of [
      [dup, "dup"],
      [kept, "kept"],
    ] as const) {
      await t.db.insert(clubLogos).values({ clubId: club.id, contentType: "image/png", data: Buffer.from(data) });
      await t.db.update(clubs).set({ logoUpdatedAt: t.clock.now }).where(eq(clubs.id, club.id));
    }
    await post(`/v1/clubs/${dup.id}/merge`, admin.headers, { into: kept.id });
    const logo = await t.app.inject({ method: "GET", url: `/v1/clubs/${kept.id}/logo` });
    expect(logo.rawPayload.toString()).toBe("kept");
  });

  it("is for admins only, and needs two different clubs", async () => {
    const umpire = await t.createUser();
    const admin = await t.createUser({ roles: ["admin"] });
    const { club: a } = await t.createClub("Hawks");
    const { club: b } = await t.createClub("Oxford Hawks");
    expect((await post(`/v1/clubs/${a.id}/merge`, umpire.headers, { into: b.id })).statusCode).toBe(403);
    expect((await post(`/v1/clubs/${a.id}/merge`, admin.headers, { into: a.id })).statusCode).toBe(400);
  });
});
