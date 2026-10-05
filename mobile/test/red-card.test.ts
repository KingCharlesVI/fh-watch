import type { MatchDocument } from "@fh/shared";
import { describe, expect, it } from "vitest";
import { importData, makeBackup } from "../src/core/backup";
import {
  type ReporterDetails,
  draftReport,
  missingAnswers,
  offenceSummary,
  redCards,
  renderRedCardReport,
  reportAnswers,
  reportText,
} from "../src/core/red-card";
import { matchDoc, setup } from "./helpers";

const me: ReporterDetails = { name: "Sam Smith", qualification: "England Hockey Level 1", contact: "sam@example.com" };

/** A match with two red cards, one of them cancelled. */
function withReds(): MatchDocument {
  const doc = { ...matchDoc(), competition: "South Men's Division 2", venue: "Iffley Road" };
  doc.events.push(
    { seq: 8, type: "card", team: "away", player: 14, color: "red", reason: "physical", period: 2, clockMs: 1_200_000 },
    { seq: 9, type: "card", team: "home", color: "red", period: 2, clockMs: 1_300_000 },
    { seq: 10, type: "void", refSeq: 9 },
  );
  return doc;
}

describe("red card reports", () => {
  it("finds the red cards that still stand", () => {
    expect(redCards(withReds()).map((c) => c.seq)).toEqual([8]);
    expect(redCards(matchDoc())).toEqual([]);
  });

  it("starts from what the match already says", async () => {
    const t = await setup({ signIn: false });
    const doc = withReds();
    await t.engine.importMatch(doc, "watch");
    await t.engine.setUmpireNames(doc.id, ["Sam Smith", "Alex Jones"]);
    const row = (await t.engine.get(doc.id))!;
    const report = draftReport(row, redCards(doc)[0]!, me, new Date("2026-09-19T12:00:00Z"));
    expect(report).toMatchObject({
      cardSeq: 8,
      colleague: "Alex Jones",
      shirtNumber: "14",
      team: "Reading M1",
      league: "South Men's Division 2",
      fixture: "Oxford Hawks M1 vs. Reading M1",
      under18: null,
      submittedAt: null,
    });
    // Without the reporter's name, it can't tell which umpire is the colleague.
    expect(draftReport(row, redCards(doc)[0]!, { ...me, name: "" }, new Date()).colleague).toBe("");
  });

  it("answers in the checklist's order, with the card's time and reason first in the details", async () => {
    const t = await setup({ signIn: false });
    const doc = withReds();
    await t.engine.importMatch(doc, "watch");
    const card = redCards(doc)[0]!;
    const report = { ...draftReport((await t.engine.get(doc.id))!, card, me, new Date()), details: "Struck an opponent with the stick." };
    const answers = reportAnswers(doc, card, report, me);
    expect(answers.map((a) => a.label)).toEqual([
      "Name",
      "Umpiring qualification",
      "Contact details",
      "Name",
      "Name of offender",
      "Shirt number",
      "Over or under 18",
      "Club",
      "Team",
      "Date of match",
      "Area",
      "League and division",
      "Fixture",
      "Details",
    ]);
    expect(answers.find((a) => a.label === "Date of match")!.value).toBe("19 September 2026");
    expect(answers.at(-1)!.value).toBe("Red card at H2 20:00, physical misconduct. Venue: Iffley Road.\n\nStruck an opponent with the stick.");
    expect(missingAnswers(answers).map((a) => a.label)).toEqual(["Name", "Name of offender", "Over or under 18", "Club", "Area"]);
    expect(reportText(answers)).toContain("OFFENDER AND CLUB\nName of offender: (not given)\nShirt number: 14");
  });

  it("says a red card in the shootout was in the shootout, not at a time", async () => {
    const t = await setup({ signIn: false });
    const doc = { ...matchDoc(), venue: "Iffley Road" };
    doc.events.push({ seq: 8, type: "card", team: "away", player: 14, color: "red", reason: "dissent", period: 2, clockMs: 2_100_000, shootout: true });
    await t.engine.importMatch(doc, "watch");
    const card = redCards(doc)[0]!;
    expect(offenceSummary(doc, card)).toBe("Shootout, dissent");
    const report = { ...draftReport((await t.engine.get(doc.id))!, card, me, new Date()), details: "Swore at the umpire." };
    expect(reportAnswers(doc, card, report, me).at(-1)!.value).toBe("Red card in the shootout, dissent. Venue: Iffley Road.\n\nSwore at the umpire.");
  });

  it("escapes what the umpire typed in the PDF", async () => {
    const doc = withReds();
    const card = redCards(doc)[0]!;
    const t = await setup({ signIn: false });
    await t.engine.importMatch(doc, "watch");
    const report = { ...draftReport((await t.engine.get(doc.id))!, card, me, new Date()), offenderName: "<script>x</script>" };
    const html = renderRedCardReport(doc, reportAnswers(doc, card, report, me), new Date());
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps one report per card, and brings them back from a backup", async () => {
    const from = await setup({ signIn: false });
    const doc = withReds();
    await from.engine.importMatch(doc, "watch");
    const draft = draftReport((await from.engine.get(doc.id))!, redCards(doc)[0]!, me, new Date());
    await from.engine.saveRedCardReport(doc.id, draft);
    await from.engine.saveRedCardReport(doc.id, { ...draft, offenderName: "Jo Bloggs" });
    expect((await from.engine.get(doc.id))!.redCardReports).toEqual([{ ...draft, offenderName: "Jo Bloggs" }]);

    const file = JSON.parse(JSON.stringify(makeBackup(await from.engine.list(), new Date())));
    const to = await setup({ signIn: false });
    await importData(to.engine, file);
    expect((await to.engine.get(doc.id))!.redCardReports).toEqual([{ ...draft, offenderName: "Jo Bloggs" }]);
  });
});
