import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type InboxItem, type NativeInbox, drainInbox } from "../src/core/watch-inbox";
import { matchDoc, setup } from "./helpers";

/** The native inbox, in memory. `pending` stands for items only the Data Layer holds so far. */
class FakeInbox implements NativeInbox {
  items: InboxItem[] = [];
  pending: InboxItem[] = [];
  removed: string[] = [];
  put(json: string, id = `id-${this.items.length}`) {
    this.items.push({ id, json, receivedAt: 1 });
  }
  async listInbox() {
    return [...this.items];
  }
  async removeFromInbox(id: string) {
    this.removed.push(id);
    this.items = this.items.filter((i) => i.id !== id);
  }
  async pullPending() {
    const n = this.pending.length;
    this.items.push(...this.pending);
    this.pending = [];
    return n;
  }
}

/**
 * What the Wear OS app produces for a match using every event type: written by
 * its unit tests (watch-wear/app/build/match-fixtures/full-match.json) and copied
 * here, so the phone is tested against the watch's real output.
 */
const wearFixture = readFileSync(new URL("./fixtures/wear-full-match.json", import.meta.url), "utf8");

describe("the watch inbox", () => {
  it("stores a match from the Wear OS app and empties the inbox", async () => {
    const t = await setup();
    const inbox = new FakeInbox();
    const doc = JSON.parse(wearFixture);
    inbox.put(wearFixture, doc.id);

    const result = await drainInbox(inbox, t.engine);
    expect(result).toEqual({ added: [doc.id], problems: [] });
    expect(inbox.items).toEqual([]);
    const row = (await t.engine.get(doc.id))!;
    expect(row).toMatchObject({ source: "watch", seen: false, warnings: [] });
    expect(row.document!.events.length).toBe(doc.events.length);
  });

  it("picks up matches the listener missed", async () => {
    const t = await setup();
    const inbox = new FakeInbox();
    const doc = matchDoc();
    inbox.pending.push({ id: doc.id, json: JSON.stringify(doc), receivedAt: 1 });
    expect((await drainInbox(inbox, t.engine)).added).toEqual([doc.id]);
  });

  it("removes a resend of a match it already has, without adding it twice", async () => {
    const t = await setup();
    const inbox = new FakeInbox();
    const doc = matchDoc();
    inbox.put(JSON.stringify(doc), doc.id);
    await drainInbox(inbox, t.engine);
    inbox.put(JSON.stringify(doc), doc.id);
    const again = await drainInbox(inbox, t.engine);
    expect(again).toEqual({ added: [], problems: [] });
    expect(inbox.removed).toEqual([doc.id, doc.id]);
    expect(await t.engine.list()).toHaveLength(1);
  });

  it("keeps a match from a newer watch app until the phone app is updated", async () => {
    const t = await setup();
    const inbox = new FakeInbox();
    inbox.put(JSON.stringify({ ...matchDoc(), schemaVersion: 2 }), "newer");
    const result = await drainInbox(inbox, t.engine);
    expect(result.problems).toMatchObject([{ id: "newer", kind: "needs_update" }]);
    expect(inbox.items.map((i) => i.id)).toEqual(["newer"]);
    expect(await t.engine.list()).toHaveLength(0);
  });

  it("keeps an invalid document, with the reasons, for export", async () => {
    const t = await setup();
    const inbox = new FakeInbox();
    const broken = { ...matchDoc(), settings: { ...matchDoc().settings, periods: 99 } };
    inbox.put(JSON.stringify(broken), "broken");
    inbox.put("{not json", "garbage");
    const result = await drainInbox(inbox, t.engine);
    expect(result.problems.map((p) => [p.id, p.kind])).toEqual([
      ["broken", "invalid"],
      ["garbage", "invalid"],
    ]);
    expect(result.problems[0]!.details.length).toBeGreaterThan(0);
    expect(result.problems[1]!.json).toBe("{not json");
    expect(inbox.items).toHaveLength(2);
  });

  it("still processes the rest when one item is bad", async () => {
    const t = await setup();
    const inbox = new FakeInbox();
    const good = matchDoc();
    inbox.put("[]", "bad");
    inbox.put(JSON.stringify(good), good.id);
    expect((await drainInbox(inbox, t.engine)).added).toEqual([good.id]);
  });
});
