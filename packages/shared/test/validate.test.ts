import { describe, expect, it } from "vitest";
import type { MatchDocument } from "../src/schema.js";
import { parseMatch } from "../src/validate.js";
import { leagueMatch, shootoutMatch } from "./fixtures.js";

function codes(doc: MatchDocument) {
  const result = parseMatch(doc);
  return {
    ok: result.ok,
    errors: result.ok ? [] : result.errors.map((e) => e.code),
    warnings: result.warnings.map((w) => w.code),
  };
}

function event(doc: MatchDocument, seq: number) {
  const e = doc.events.find((x) => x.seq === seq);
  if (!e) throw new Error(`no event ${seq}`);
  return e as Record<string, unknown>;
}

describe("parseMatch", () => {
  it("accepts both fixtures with no warnings", () => {
    expect(codes(leagueMatch())).toEqual({ ok: true, errors: [], warnings: [] });
    expect(codes(shootoutMatch())).toEqual({ ok: true, errors: [], warnings: [] });
  });

  it("reports schema failures with their path", () => {
    const doc = leagueMatch() as unknown as { events: { team?: string }[] };
    doc.events[1]!.team = "neutral";
    const result = parseMatch(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatchObject({ code: "schema", path: ["events", 1, "team"] });
    }
  });

  it("requires one break per gap between periods", () => {
    const doc = leagueMatch();
    doc.settings.breakLengthsSec = [120, 300];
    expect(codes(doc).errors).toEqual(["break_count"]);
  });

  it("rejects endedAt before startedAt", () => {
    const doc = leagueMatch();
    doc.endedAt = "2026-09-19T12:00:00Z";
    expect(codes(doc).errors).toEqual(["ended_before_started"]);
  });

  it("rejects duplicate and out-of-order seq", () => {
    const dup = leagueMatch();
    event(dup, 3).seq = 2;
    expect(codes(dup).errors).toContain("seq_order");

    const swapped = leagueMatch();
    [swapped.events[4], swapped.events[5]] = [swapped.events[5]!, swapped.events[4]!];
    expect(codes(swapped).errors).toContain("seq_order");
  });

  it("allows gaps in seq", () => {
    const doc = leagueMatch();
    event(doc, 24).seq = 40;
    expect(codes(doc).ok).toBe(true);
  });

  it("rejects events in a period beyond the match's periods", () => {
    const doc = leagueMatch();
    event(doc, 22).period = 5;
    expect(codes(doc).errors).toEqual(["period_range"]);
  });

  it("warns when the clock runs past the end of a period", () => {
    const doc = leagueMatch();
    event(doc, 22).clockMs = 905000;
    expect(codes(doc)).toMatchObject({ ok: true, warnings: ["clock_overrun"] });
  });

  it("requires a duration on green and yellow cards and forbids one on red", () => {
    const yellow = leagueMatch();
    delete event(yellow, 3).durationSec;
    expect(codes(yellow).errors).toContain("card_duration");

    const red = leagueMatch();
    event(red, 19).durationSec = 300;
    expect(codes(red).errors).toEqual(["card_duration"]);
  });

  it("warns when a card's duration differs from the match settings", () => {
    const doc = leagueMatch();
    event(doc, 3).durationSec = 420;
    event(doc, 15).durationSec = 180;
    expect(codes(doc)).toMatchObject({ ok: true, warnings: ["card_duration_setting", "card_duration_setting"] });
  });

  it("accepts a long yellow card", () => {
    const doc = leagueMatch();
    event(doc, 3).durationSec = 600;
    expect(codes(doc)).toMatchObject({ ok: true, warnings: [] });
  });

  it("rejects refSeq that points nowhere or forwards", () => {
    const missing = leagueMatch();
    event(missing, 12).refSeq = 99;
    expect(codes(missing).errors).toContain("ref_missing");

    const forward = leagueMatch();
    event(forward, 6).refSeq = 15;
    expect(codes(forward).errors).toContain("ref_missing");
  });

  it("rejects card_end that doesn't point at a green or yellow card", () => {
    const notCard = leagueMatch();
    event(notCard, 6).refSeq = 2;
    expect(codes(notCard).errors).toEqual(["ref_type"]);

    const red = leagueMatch();
    event(red, 23).type = "card_end";
    event(red, 23).refSeq = 19;
    expect(codes(red).errors).toEqual(["ref_type"]);
  });

  it("rejects voiding a void and warns on voiding twice", () => {
    const doc = leagueMatch();
    doc.events.push({ seq: 25, type: "void", refSeq: 12 });
    expect(codes(doc).errors).toEqual(["ref_type"]);

    const twice = leagueMatch();
    twice.events.push({ seq: 25, type: "void", refSeq: 11 });
    expect(codes(twice)).toMatchObject({ ok: true, warnings: ["double_void"] });
  });

  it("warns when scored strokes and penalty-stroke goals don't match", () => {
    const doc = leagueMatch();
    doc.events.push({ seq: 25, type: "void", refSeq: 14 });
    expect(codes(doc)).toMatchObject({ ok: true, warnings: ["stroke_goal_mismatch"] });
  });

  it("warns about a shootout the settings don't allow or after a decided match", () => {
    const notAllowed = shootoutMatch();
    notAllowed.settings.shootoutIfDrawn = false;
    expect(codes(notAllowed).warnings).toEqual(["unexpected_shootout"]);

    const notDrawn = shootoutMatch();
    notDrawn.events.push({ seq: 15, type: "void", refSeq: 5 });
    expect(codes(notDrawn).warnings).toEqual(["unexpected_shootout"]);
  });

  it("allows yellow and red cards in the shootout, without a duration", () => {
    const doc = shootoutMatch();
    doc.events.push({ seq: 15, type: "card", team: "home", player: 6, color: "yellow", period: 2, clockMs: 2100000, shootout: true });
    expect(codes(doc)).toEqual({ ok: true, errors: [], warnings: [] });

    const green = shootoutMatch();
    green.events.push({ seq: 15, type: "card", team: "home", color: "green", period: 2, clockMs: 2100000, shootout: true });
    expect(codes(green).errors).toEqual(["shootout_card"]);

    const timed = shootoutMatch();
    timed.events.push({ seq: 15, type: "card", team: "home", color: "yellow", durationSec: 300, period: 2, clockMs: 2100000, shootout: true });
    expect(codes(timed).errors).toEqual(["card_duration"]);
  });

  it("checks forfeited shoot-outs", () => {
    const doc = shootoutMatch();
    doc.events = doc.events.filter((e) => e.seq < 13);
    doc.events.push(
      { seq: 13, type: "card", team: "home", player: 10, color: "red", period: 2, clockMs: 2100000, shootout: true },
      { seq: 14, type: "shootout_attempt", team: "home", round: 4, scored: false, forfeit: true },
    );
    expect(codes(doc)).toEqual({ ok: true, errors: [], warnings: [] });

    const noCard = shootoutMatch();
    event(noCard, 13).forfeit = true;
    expect(codes(noCard).warnings).toEqual(["forfeit_without_card"]);

    const scored = shootoutMatch();
    Object.assign(event(scored, 13), { forfeit: true, scored: true });
    expect(codes(scored).errors).toEqual(["forfeit_scored"]);
  });

  it("warns once when shoot-outs are taken out of turn", () => {
    const doc = shootoutMatch();
    event(doc, 8).team = "home";
    event(doc, 9).team = "away";
    expect(codes(doc).warnings).toEqual(["shootout_order"]);
  });
});
