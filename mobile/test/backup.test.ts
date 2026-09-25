import { describe, expect, it } from "vitest";
import { importData, makeBackup } from "../src/core/backup";
import { matchDoc, setup } from "./helpers";

describe("backups", () => {
  it("restores every match with its umpire names on another phone", async () => {
    const from = await setup({ signIn: false });
    const a = matchDoc();
    const b = matchDoc();
    await from.engine.importMatch(a, "watch");
    await from.engine.importMatch(b, "watch");
    await from.engine.setUmpireNames(a.id, ["Sam Smith", " Alex Jones ", ""]);
    // Through JSON, as it goes via a file.
    const file = JSON.parse(JSON.stringify(makeBackup(await from.engine.list(), new Date("2026-09-25T10:00:00Z"))));

    const to = await setup({ signIn: false });
    expect(await importData(to.engine, file)).toEqual({ added: 2, duplicate: 0, invalid: [] });
    expect((await to.engine.get(a.id))!).toMatchObject({ document: a, umpireNames: ["Sam Smith", "Alex Jones"], source: "file" });
    expect((await to.engine.get(b.id))!.umpireNames).toBeUndefined();
  });

  it("skips matches the phone already has, and reports ones it can't read", async () => {
    const t = await setup({ signIn: false });
    const a = matchDoc();
    await t.engine.importMatch(a, "watch");
    const backup = makeBackup(await t.engine.list(), new Date());
    backup.matches.push({ document: { ...matchDoc(), schemaVersion: 99 } as never });
    const result = await importData(t.engine, backup);
    expect(result).toMatchObject({ added: 0, duplicate: 1 });
    expect(result.invalid.length).toBeGreaterThan(0);
  });

  it("still reads a single match, and the website's JSON download", async () => {
    const t = await setup({ signIn: false });
    const a = matchDoc();
    const b = matchDoc();
    expect(await importData(t.engine, a)).toMatchObject({ added: 1 });
    expect(await importData(t.engine, { document: b, summary: {} })).toMatchObject({ added: 1 });
  });
});
