import { describe, expect, it } from "vitest";
import { UPLOAD_REMINDER_AFTER_MS, awaitingUpload, overdueUploads, remindAt } from "../src/core/upload-reminders";
import { matchDoc, setup } from "./helpers";

const HOUR = 60 * 60 * 1000;

describe("upload reminders", () => {
  it("are due two hours after a match from the watch arrives, until it's uploaded", async () => {
    const t = await setup();
    const doc = matchDoc();
    await t.engine.importMatch(doc, "watch");
    const row = (await t.engine.get(doc.id))!;
    const arrived = Date.parse(row.receivedAt);

    expect(awaitingUpload(row)).toBe(true);
    expect(remindAt(row)).toBe(arrived + UPLOAD_REMINDER_AFTER_MS);
    expect(overdueUploads([row], arrived + HOUR)).toEqual([]);
    expect(overdueUploads([row], arrived + 2 * HOUR).map((m) => m.id)).toEqual([doc.id]);

    // Asked to upload (even with no signal yet): no more reminders.
    await t.engine.requestUpload(doc.id);
    const asked = (await t.engine.get(doc.id))!;
    expect(awaitingUpload(asked)).toBe(false);
    expect(overdueUploads([asked], arrived + 3 * HOUR)).toEqual([]);
  });

  it("leave out matches imported from a file, and ones already on the server", async () => {
    const t = await setup();
    const fromFile = matchDoc();
    await t.engine.importMatch(fromFile, "file");
    const row = (await t.engine.get(fromFile.id))!;
    expect(awaitingUpload(row)).toBe(false);
    expect(awaitingUpload({ ...row, source: "watch", baseRevision: 1 })).toBe(false);
  });

  it("list the oldest first", async () => {
    const t = await setup();
    const a = matchDoc();
    const b = matchDoc();
    await t.engine.importMatch(a, "watch");
    await t.engine.importMatch(b, "watch");
    const rows = [(await t.engine.get(a.id))!, (await t.engine.get(b.id))!];
    rows[1] = { ...rows[1]!, receivedAt: new Date(Date.parse(rows[0]!.receivedAt) - HOUR).toISOString() };
    expect(overdueUploads(rows, Date.parse(rows[0]!.receivedAt) + 3 * HOUR).map((m) => m.id)).toEqual([b.id, a.id]);
  });
});
