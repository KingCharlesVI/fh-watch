import type { MatchDocument } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { purgeExpired } from "../src/services/matches.js";
import { matchDoc, setupTestApp } from "./helpers.js";

const t = await setupTestApp();
const HOUR = 60 * 60 * 1000;

function put(doc: MatchDocument, headers: Record<string, string>, ifMatch?: number, source = "watch") {
  return t.app.inject({
    method: "PUT",
    url: `/v1/matches/${doc.id}`,
    headers: { ...headers, ...(ifMatch === undefined ? {} : { "if-match": `"${ifMatch}"` }) },
    payload: { source, document: doc },
  });
}

const get = (url: string, headers: Record<string, string> = {}) => t.app.inject({ method: "GET", url, headers });
const post = (url: string, headers: Record<string, string>) => t.app.inject({ method: "POST", url, headers });

describe("uploading", () => {
  it("creates a draft with the uploader as umpire 1", async () => {
    const { user, headers } = await t.createUser({ name: "Sam" });
    const doc = matchDoc({ endedAt: "2026-09-19T11:30:00Z" });
    const res = await put(doc, headers);
    expect(res.statusCode).toBe(201);
    expect(res.headers.etag).toBe('"1"');
    expect(res.json().match).toMatchObject({
      id: doc.id,
      status: "draft",
      home: { name: "Oxford Hawks M1", score: 2 },
      away: { name: "Reading M1", score: 1 },
      umpires: [{ slot: 1, userId: user.id, name: "Sam" }],
      currentRevision: 1,
      shareCode: null,
    });
  });

  it("is idempotent: re-sending the same document changes nothing", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);
    const again = await put(doc, headers);
    expect(again.statusCode).toBe(200);
    expect(again.json().match.currentRevision).toBe(1);
  });

  it("needs If-Match with the current revision to change a match", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);
    doc.venue = "Pitch 2";

    const missing = await put(doc, headers);
    expect(missing.statusCode).toBe(428);

    const stale = await put(doc, headers, 0);
    expect(stale.statusCode).toBe(412);
    expect(stale.json()).toMatchObject({ type: "/problems/revision_conflict", currentRevision: 1 });

    const ok = await put(doc, headers, 1, "mobile");
    expect(ok.statusCode).toBe(200);
    expect(ok.headers.etag).toBe('"2"');
    expect(ok.json().match.venue).toBe("Pitch 2");
  });

  it("keeps every revision, so the watch original survives edits", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);
    const edited = structuredClone(doc);
    edited.events.push({ seq: 8, type: "note", text: "Corrected on the phone." });
    await put(edited, headers, 1, "mobile");

    const history = await get(`/v1/matches/${doc.id}/revisions`, headers);
    expect(history.json().items.map((r: { revision: number; source: string }) => [r.revision, r.source])).toEqual([
      [2, "mobile"],
      [1, "watch"],
    ]);
    const original = await get(`/v1/matches/${doc.id}/revisions/1`, headers);
    expect(original.json().document.events).toHaveLength(7);
  });

  it("rejects documents with errors and returns warnings on success", async () => {
    const { headers } = await t.createUser();
    const bad = matchDoc();
    bad.settings.breakLengthsSec = [];
    const res = await put(bad, headers);
    expect(res.statusCode).toBe(422);
    expect(res.json().errors[0]).toMatchObject({ code: "break_count" });

    const odd = matchDoc();
    odd.events.push({ seq: 8, type: "card", team: "home", player: 4, color: "yellow", durationSec: 420, period: 2, clockMs: 1000000 });
    const ok = await put(odd, headers);
    expect(ok.statusCode).toBe(201);
    expect(ok.json().warnings[0]).toMatchObject({ code: "card_duration_setting" });
  });

  it("rejects a structurally invalid document with the path of the problem", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc() as unknown as { id: string; events: { team?: string }[] };
    doc.events[1]!.team = "neutral";
    const res = await t.app.inject({ method: "PUT", url: `/v1/matches/${doc.id}`, headers, payload: { source: "watch", document: doc } });
    expect(res.statusCode).toBe(400);
    expect(res.json().errors[0].path).toBe("/document/events/1/team");
  });

  it("rejects a mismatched id, an unknown team, and uploads from non-umpires", async () => {
    const umpire = await t.createUser();
    const doc = matchDoc();
    const mismatch = await t.app.inject({
      method: "PUT",
      url: `/v1/matches/${crypto.randomUUID()}`,
      headers: umpire.headers,
      payload: { source: "watch", document: doc },
    });
    expect(mismatch.statusCode).toBe(400);

    const unknownTeam = await put(matchDoc({ homeTeamId: crypto.randomUUID() }), umpire.headers);
    expect(unknownTeam.statusCode).toBe(422);

    const { club } = await t.createClub("Oxford Hawks");
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    expect((await put(matchDoc(), clubAdmin.headers)).statusCode).toBe(403);
    expect((await put(matchDoc(), {})).statusCode).toBe(401);
  });

  it("won't let another umpire change someone else's match", async () => {
    const owner = await t.createUser();
    const other = await t.createUser();
    const doc = matchDoc();
    await put(doc, owner.headers);
    doc.venue = "Somewhere";
    expect((await put(doc, other.headers, 1)).statusCode).toBe(403);
  });
});

describe("visibility and publishing", () => {
  it("hides drafts from the public and shows them to their umpire", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);
    expect((await get(`/v1/matches/${doc.id}`)).statusCode).toBe(404);
    const mine = await get(`/v1/matches/${doc.id}`, headers);
    expect(mine.statusCode).toBe(200);
    expect(mine.json().summary.score).toEqual({ home: 2, away: 1 });
    expect((await get("/v1/matches")).json().items).toEqual([]);
  });

  it("publishes with a share code, and unpublishing hides it and cancels the timer", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);

    const published = await post(`/v1/matches/${doc.id}/publish`, headers);
    const { shareCode, shareUrl } = published.json().match;
    expect(shareCode).toMatch(/^[2-9A-HJ-NP-Z]{6}$/);
    expect(shareUrl).toBe(`https://hockey.test/m/${shareCode}`);

    const pub = await get(`/v1/m/${shareCode}`);
    expect(pub.statusCode).toBe(200);
    expect(pub.json().document.id).toBe(doc.id);
    expect((await get("/v1/matches")).json().items).toHaveLength(1);

    const unpublished = await post(`/v1/matches/${doc.id}/unpublish`, headers);
    expect(unpublished.json().match).toMatchObject({ status: "draft", shareCode });
    expect((await get(`/v1/m/${shareCode}`)).statusCode).toBe(404);

    // An edit doesn't publish it again.
    doc.venue = "Pitch 3";
    const edited = await put(doc, headers, 1);
    expect(edited.json().match.status).toBe("draft");
  });

  it("lets club admins read, but not change, their club's matches", async () => {
    const { club, teams } = await t.createClub("Oxford Hawks", ["M1"]);
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    const { club: otherClub } = await t.createClub("Elsewhere");
    const otherAdmin = await t.createUser({ roles: ["club_admin"], clubId: otherClub.id });
    const umpire = await t.createUser();
    const doc = matchDoc({ homeTeamId: teams[0]!.id });
    await put(doc, umpire.headers);

    expect((await get(`/v1/matches/${doc.id}`, clubAdmin.headers)).statusCode).toBe(200);
    expect((await get(`/v1/matches/${doc.id}/revisions`, clubAdmin.headers)).statusCode).toBe(200);
    expect((await post(`/v1/matches/${doc.id}/publish`, clubAdmin.headers)).statusCode).toBe(403);
    expect((await get(`/v1/matches/${doc.id}`, otherAdmin.headers)).statusCode).toBe(404);

    const list = await get(`/v1/matches?clubId=${club.id}`, clubAdmin.headers);
    expect(list.json().items.map((m: { id: string }) => m.id)).toEqual([doc.id]);
  });

  it("gives umpire 2 the same edit rights when they're registered", async () => {
    const one = await t.createUser({ name: "Sam" });
    const two = await t.createUser({ name: "Alex" });
    const doc = matchDoc();
    await put(doc, one.headers);

    const same = await t.app.inject({
      method: "PUT",
      url: `/v1/matches/${doc.id}/umpires/2`,
      headers: one.headers,
      payload: { userId: one.user.id },
    });
    expect(same.statusCode).toBe(400);

    const set = await t.app.inject({
      method: "PUT",
      url: `/v1/matches/${doc.id}/umpires/2`,
      headers: one.headers,
      payload: { userId: two.user.id },
    });
    expect(set.json().match.umpires).toEqual([
      { slot: 1, userId: one.user.id, name: "Sam" },
      { slot: 2, userId: two.user.id, name: "Alex" },
    ]);
    doc.venue = "Edited by umpire 2";
    expect((await put(doc, two.headers, 1)).statusCode).toBe(200);

    const byName = await t.app.inject({
      method: "PUT",
      url: `/v1/matches/${doc.id}/umpires/2`,
      headers: one.headers,
      payload: { name: "Pat (not registered)" },
    });
    expect(byName.json().match.umpires[1]).toEqual({ slot: 2, userId: null, name: "Pat (not registered)" });
    doc.venue = "Umpire 2 no longer has rights";
    expect((await put(doc, two.headers, 2)).statusCode).toBe(403);
  });

  it("pages through matches newest first", async () => {
    const { headers } = await t.createUser();
    const ids: string[] = [];
    for (let day = 1; day <= 5; day++) {
      const doc = matchDoc();
      doc.startedAt = `2026-09-0${day}T10:00:00Z`;
      doc.endedAt = `2026-09-0${day}T11:30:00Z`;
      await put(doc, headers);
      ids.unshift(doc.id);
    }
    const first = (await get("/v1/matches?limit=2", headers)).json();
    const second = (await get(`/v1/matches?limit=2&cursor=${first.nextCursor}`, headers)).json();
    const third = (await get(`/v1/matches?limit=2&cursor=${second.nextCursor}`, headers)).json();
    expect([...first.items, ...second.items, ...third.items].map((m: { id: string }) => m.id)).toEqual(ids);
    expect(third.nextCursor).toBeNull();

    const september2 = (await get("/v1/matches?from=2026-09-02T00:00:00Z&to=2026-09-03T00:00:00Z", headers)).json();
    expect(september2.items).toHaveLength(1);
  });
});

describe("publishing", () => {
  it("leaves a match a draft until its umpire publishes it, however long ago it ended", async () => {
    const { headers } = await t.createUser();
    await t.app.inject({ method: "POST", url: "/v1/me/push-tokens", headers, payload: { token: "tok", platform: "ios" } });
    const doc = matchDoc({ endedAt: "2026-09-19T08:00:00Z" });
    expect((await put(doc, headers)).json().match.status).toBe("draft");

    // Two days on (the sign-in has expired, so straight from the database): still a draft, and no one was told otherwise.
    t.advance(48 * HOUR);
    expect((await t.db.query.matches.findFirst())!.status).toBe("draft");
    expect(t.push.sent).toEqual([]);
  });
});

describe("deleting", () => {
  it("is admin-only, hides the match, and purges it after 30 days", async () => {
    const admin = await t.createUser({ roles: ["admin"] });
    const umpire = await t.createUser();
    const doc = matchDoc();
    await put(doc, umpire.headers);

    expect((await t.app.inject({ method: "DELETE", url: `/v1/matches/${doc.id}`, headers: umpire.headers })).statusCode).toBe(403);
    expect((await t.app.inject({ method: "DELETE", url: `/v1/matches/${doc.id}`, headers: admin.headers })).statusCode).toBe(204);
    expect((await get(`/v1/matches/${doc.id}`, admin.headers)).statusCode).toBe(404);
    expect((await put(doc, umpire.headers)).statusCode).toBe(410);

    t.advance(29 * 24 * HOUR);
    expect(await purgeExpired(t.deps)).toEqual({ matches: 0 });
    t.advance(2 * 24 * HOUR);
    expect(await purgeExpired(t.deps)).toEqual({ matches: 1 });
    expect(await t.db.query.matches.findMany()).toEqual([]);
  });
});

describe("exports", () => {
  it("downloads one match as CSV or JSON", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);
    const { shareCode } = (await post(`/v1/matches/${doc.id}/publish`, headers)).json().match;

    const csv = await get(`/v1/matches/${doc.id}/export.csv`);
    expect(csv.statusCode).toBe(200);
    expect(csv.headers["content-type"]).toBe("text/csv; charset=utf-8");
    expect(csv.headers["content-disposition"]).toBe(`attachment; filename="match-${shareCode}.csv"`);
    expect(csv.body.replace(/^﻿/, "").split("\r\n")[0]).toBe("seq,period,clock,team,type,player,detail");

    const json = await get(`/v1/matches/${doc.id}/export.json`);
    expect(JSON.parse(json.body).summary.score).toEqual({ home: 2, away: 1 });

    expect((await get(`/v1/matches/${doc.id}/export.xml`)).statusCode).toBe(400);
  });

  it("renders a PDF report once per match version and escapes what umpires typed", async () => {
    const { headers } = await t.createUser({ name: "Sam" });
    const doc = matchDoc();
    doc.teams.home.name = "<b>Hawks</b> & Co";
    await put(doc, headers);

    const first = await get(`/v1/matches/${doc.id}/export.pdf`, headers);
    expect(first.statusCode).toBe(200);
    expect(first.headers["content-type"]).toBe("application/pdf");
    expect(first.headers["content-disposition"]).toBe(`attachment; filename="match-${doc.id}.pdf"`);
    expect(first.rawPayload.subarray(0, 5).toString()).toBe("%PDF-");
    expect(t.pdf.rendered).toHaveLength(1);
    const html = t.pdf.rendered[0]!;
    expect(html).toContain("&lt;b&gt;Hawks&lt;/b&gt; &amp; Co");
    expect(html).not.toContain("<b>Hawks</b>");
    expect(html).toContain(">2–1<");
    expect(html).toContain("Sam");

    await get(`/v1/matches/${doc.id}/export.pdf`, headers);
    expect(t.pdf.rendered).toHaveLength(1);

    // Publishing changes the report (it now shows the share link), so it's rendered again.
    t.advance(1000);
    const { shareUrl } = (await post(`/v1/matches/${doc.id}/publish`, headers)).json().match;
    await get(`/v1/matches/${doc.id}/export.pdf`);
    expect(t.pdf.rendered).toHaveLength(2);
    expect(t.pdf.rendered[1]).toContain(shareUrl);
  });

  it("answers 503 when the PDF can't be rendered", async () => {
    const { headers } = await t.createUser();
    const doc = matchDoc();
    await put(doc, headers);
    const render = t.pdf.render;
    t.pdf.render = async () => {
      throw new Error("no browser");
    };
    try {
      const res = await get(`/v1/matches/${doc.id}/export.pdf`, headers);
      expect(res.statusCode).toBe(503);
      expect(res.json().type).toBe("/problems/pdf_unavailable");
    } finally {
      t.pdf.render = render;
    }
  });

  it("bulk-exports what the caller is responsible for", async () => {
    const { club, teams } = await t.createClub("Oxford Hawks", ["M1"]);
    const clubAdmin = await t.createUser({ roles: ["club_admin"], clubId: club.id });
    const umpire = await t.createUser();
    await put(matchDoc({ homeTeamId: teams[0]!.id }), umpire.headers);
    await put(matchDoc(), umpire.headers);

    const clubCsv = await get("/v1/matches/export.csv", clubAdmin.headers);
    expect(clubCsv.body.trim().split("\r\n")).toHaveLength(2);
    const umpireCsv = await get("/v1/matches/export.csv", umpire.headers);
    expect(umpireCsv.body.trim().split("\r\n")).toHaveLength(3);
    expect((await get("/v1/matches/export.csv")).statusCode).toBe(401);
  });
});
