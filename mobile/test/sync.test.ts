import { describe, expect, it } from "vitest";
import { matchDoc, setup, withVenue } from "./helpers";

describe("receiving matches", () => {
  it("adds a match from the watch as new and waiting to upload", async () => {
    const t = await setup();
    const doc = matchDoc();
    expect(await t.engine.importMatch(doc, "watch")).toEqual({ status: "added" });
    const row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ dirty: true, seen: false, baseRevision: null, source: "watch" });
    expect(t.engine.state(row)).toBe("pending");
  });

  it("treats the match id as the key, so receiving it again changes nothing", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    expect(await t.engine.importMatch(withVenue(doc, "Somewhere else"), "file")).toEqual({ status: "duplicate" });
    expect((await t.engine.get(doc.id))!.document!.venue).toBeUndefined();
  });

  it("refuses an invalid document with readable errors", async () => {
    const t = await setup();
    const doc = matchDoc();
    doc.settings.breakLengthsSec = [];
    const res = await t.engine.importMatch(doc, "file");
    expect(res.status).toBe("invalid");
    expect(res.errors?.[0]).toContain("break lengths");
    expect(await t.engine.importMatch({ not: "a match" }, "file")).toMatchObject({ status: "invalid" });
  });
});

describe("uploading", () => {
  it("uploads a new match as revision 1 from the watch", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.uploadPending();
    const row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ dirty: false, baseRevision: 1, lastError: null });
    expect(row.server?.status).toBe("draft");
    expect(t.engine.state(row)).toBe("synced");
    expect(t.server.matches.get(doc.id)!.revisions.map((r) => r.source)).toEqual(["watch"]);
  });

  it("keeps the watch's original as revision 1 when edited before the first upload", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.saveEdit(doc.id, withVenue(doc, "Pitch 2"));
    await t.engine.uploadPending();
    const revs = t.server.matches.get(doc.id)!.revisions;
    expect(revs.map((r) => [r.source, r.document.venue])).toEqual([
      ["watch", undefined],
      ["mobile", "Pitch 2"],
    ]);
    expect((await t.engine.get(doc.id))!.baseRevision).toBe(2);
  });

  it("sends later edits with If-Match", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.uploadPending();
    await t.engine.saveEdit(doc.id, withVenue(doc, "Pitch 3"));
    await t.engine.uploadPending();
    expect(t.server.current(doc.id)!.venue).toBe("Pitch 3");
    expect((await t.engine.get(doc.id))!.baseRevision).toBe(2);
  });

  it("refuses to save an edit with errors", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    const bad = { ...doc, endedAt: "2026-09-19T09:00:00Z" };
    expect(await t.engine.saveEdit(doc.id, bad)).toEqual({ ok: false, errors: ["The match ends before it starts."] });
  });

  it("waits and retries with growing gaps while offline", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    t.server.offline = true;
    await t.engine.uploadPending();
    let row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ attempts: 1, nextAttemptAt: t.clock.now + 5_000 });

    // Too soon: not even tried.
    const calls = t.server.calls.length;
    await t.engine.uploadPending();
    expect(t.server.calls.length).toBe(calls);

    t.advance(5_000);
    await t.engine.uploadPending();
    row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ attempts: 2, nextAttemptAt: t.clock.now + 10_000 });

    t.server.offline = false;
    t.advance(10_000);
    await t.engine.uploadPending();
    expect((await t.engine.get(doc.id))!).toMatchObject({ dirty: false, attempts: 0, baseRevision: 1 });
  });

  it("stops after the first network failure instead of trying every match", async () => {
    const t = await setup();
    await t.engine.importMatch(matchDoc(), "watch");
    await t.engine.importMatch(matchDoc(), "watch");
    t.server.offline = true;
    await t.engine.uploadPending();
    expect(t.server.count("PUT")).toBe(1);
  });

  it("backs off on server errors but carries on with other matches", async () => {
    const t = await setup();
    const a = matchDoc();
    const b = matchDoc();
    await t.engine.importMatch(a, "watch");
    await t.engine.importMatch(b, "watch");
    t.server.failNext.push(503);
    await t.engine.uploadPending();
    const rows = await t.engine.list();
    expect(rows.filter((r) => r.dirty)).toHaveLength(1);
    expect(rows.find((r) => r.dirty)!.attempts).toBe(1);
  });

  it("pauses a match the server refuses and shows why, until retried", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    t.server.failNext.push(422);
    await t.engine.uploadPending();
    let row = (await t.engine.get(doc.id))!;
    expect(row.lastError).toBe("Failed with 422");
    expect(t.engine.state(row)).toBe("error");

    await t.engine.uploadPending({ force: true });
    expect(t.server.count("PUT")).toBe(1);

    await t.engine.retry(doc.id);
    await t.engine.uploadPending();
    row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ dirty: false, lastError: null });
  });

  it("keeps an edit made while its upload was in flight", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    t.server.duringNextPut = async () => {
      await t.engine.saveEdit(doc.id, withVenue(doc, "Edited mid-upload"));
    };
    await t.engine.uploadPending();
    let row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ dirty: true, baseRevision: 1 });
    await t.engine.uploadPending();
    row = (await t.engine.get(doc.id))!;
    expect(row.dirty).toBe(false);
    expect(t.server.current(doc.id)!.venue).toBe("Edited mid-upload");
  });

  it("recovers when an upload got through but its reply was lost", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.saveEdit(doc.id, withVenue(doc, "Pitch 2"));
    // Both the original and the edit reach the server, but the edit's reply is lost,
    // so the phone still thinks nothing was uploaded.
    t.server.dropPutReply = 2;
    await t.engine.uploadPending();
    expect((await t.engine.get(doc.id))!.baseRevision).toBeNull();
    t.advance(5_000);
    await t.engine.uploadPending();
    const row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ dirty: false, conflict: null, baseRevision: 2 });
    expect(t.server.matches.get(doc.id)!.revisions).toHaveLength(2);
  });
});

describe("conflicts", () => {
  async function conflicted() {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.uploadPending();
    t.server.editOnServer(doc.id, (d) => void (d.competition = "Edited on the website"));
    await t.engine.saveEdit(doc.id, withVenue(doc, "Edited on the phone"));
    await t.engine.uploadPending();
    return { t, doc };
  }

  it("spots a newer version on the server instead of overwriting it", async () => {
    const { t, doc } = await conflicted();
    const row = (await t.engine.get(doc.id))!;
    expect(t.engine.state(row)).toBe("conflict");
    expect(row.conflict).toMatchObject({ revision: 2, document: { competition: "Edited on the website" } });
    expect(t.server.current(doc.id)!.venue).toBeUndefined();
  });

  it("keeps the phone's version when asked", async () => {
    const { t, doc } = await conflicted();
    await t.engine.resolveConflict(doc.id, "mine");
    await t.engine.uploadPending();
    expect(t.server.current(doc.id)).toMatchObject({ venue: "Edited on the phone" });
    expect(t.server.matches.get(doc.id)!.revisions).toHaveLength(3);
  });

  it("takes the server's version when asked", async () => {
    const { t, doc } = await conflicted();
    await t.engine.resolveConflict(doc.id, "theirs");
    const row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ dirty: false, baseRevision: 2, conflict: null });
    expect(row.document).toMatchObject({ competition: "Edited on the website" });
  });
});

describe("refreshing from the server", () => {
  it("lists the umpire's matches, fetching documents only when opened", async () => {
    const t = await setup();
    const doc = matchDoc();
    const other = await setup();
    // Uploaded from another phone.
    await other.engine.importMatch(doc, "watch");
    await other.engine.uploadPending();
    t.server.matches.set(doc.id, other.server.matches.get(doc.id)!);

    await t.engine.refresh();
    let row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ source: "server", document: null, seen: true });
    expect(t.engine.state(row)).toBe("server");

    row = await t.engine.ensureDocument(doc.id);
    expect(row.document?.id).toBe(doc.id);
  });

  it("drops a local copy that's been changed elsewhere, so the new one is fetched", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.uploadPending();
    t.server.editOnServer(doc.id, (d) => void (d.venue = "Changed on the website"));
    await t.engine.refresh();
    expect((await t.engine.get(doc.id))!.document).toBeNull();
    expect((await t.engine.ensureDocument(doc.id)).document!.venue).toBe("Changed on the website");
  });

  it("forgets uploaded matches the server no longer lists, but never unsent ones", async () => {
    const t = await setup();
    const uploaded = matchDoc();
    const unsent = matchDoc();
    await t.engine.importMatch(uploaded, "watch");
    await t.engine.uploadPending();
    t.server.matches.delete(uploaded.id);
    t.server.offline = true;
    await t.engine.importMatch(unsent, "watch");
    t.server.offline = false;
    t.server.failNext.push(503); // the unsent one stays unsent
    await t.engine.refresh();
    const ids = (await t.engine.list()).map((r) => r.id);
    expect(ids).toEqual([unsent.id]);
  });
});

describe("publishing", () => {
  it("uploads waiting changes first, so the published version is the latest", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    await t.engine.uploadPending();
    await t.engine.saveEdit(doc.id, withVenue(doc, "Pitch 4"));
    const match = await t.engine.publish(doc.id, true);
    expect(match).toMatchObject({ status: "published", shareUrl: "https://fhmatchcentre.com/m/K7P2QX" });
    expect(t.server.current(doc.id)!.venue).toBe("Pitch 4");
    expect((await t.engine.get(doc.id))!.server?.status).toBe("published");
  });

  it("explains that publishing needs a connection", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    t.server.offline = true;
    await expect(t.engine.publish(doc.id, true)).rejects.toThrow("Check your connection");
  });
});
