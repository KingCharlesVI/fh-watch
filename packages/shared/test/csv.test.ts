import { describe, expect, it } from "vitest";
import { matchEventsToCsv, matchListToCsv, parseCsv, toCsv } from "../src/csv.js";
import { leagueMatch, shootoutMatch } from "./fixtures.js";

const lines = (csv: string) => csv.split("\r\n").slice(0, -1);

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "two\nlines", "plain"]])).toBe('"a,b","say ""hi""","two\nlines",plain\r\n');
  });

  it("writes numbers as-is and empty cells for null and undefined", () => {
    expect(toCsv([[1, -2, null, undefined, 0]])).toBe("1,-2,,,0\r\n");
  });

  it("stops spreadsheets running user text as a formula", () => {
    expect(toCsv([["=HYPERLINK(\"x\")", "+1", "-1", "@SUM(A1)", "ok"]])).toBe(
      `"'=HYPERLINK(""x"")",'+1,'-1,'@SUM(A1),ok\r\n`,
    );
  });
});

describe("matchEventsToCsv", () => {
  it("writes one row per counting event in match order", () => {
    const rows = lines(matchEventsToCsv(leagueMatch()));
    expect(rows[0]).toBe("seq,period,clock,team,type,player,detail");
    expect(rows.slice(1, 8)).toEqual([
      "1,1,0:00,,period_start,,",
      "2,1,6:52,Oxford Hawks M1,goal,9,Field goal",
      "3,1,8:50,Reading M1,card,4,\"Yellow, 5 min\"",
      "4,1,10:01,Oxford Hawks M1,penalty_corner,,",
      "5,1,10:05,Oxford Hawks M1,goal,11,Penalty corner",
      "6,1,13:50,,card_end,,Suspension ended (card 3)",
      "7,1,15:00,,period_end,,",
    ]);
    expect(rows).toContain("9,2,2:00,,clock_stop,,injury");
    expect(rows).toContain("13,2,8:20,Reading M1,penalty_stroke,,Scored");
    expect(rows).toContain("19,3,3:20,Oxford Hawks M1,card,5,Red");
    expect(rows.at(-1)).toBe("24,,,,note,,Floodlights on pitch 1 failed briefly at half time.");
    // Voided goal (11) and the void (12) are left out.
    expect(rows.some((r) => r.startsWith("11,") || r.startsWith("12,"))).toBe(false);
    expect(rows).toHaveLength(1 + 22);
  });

  it("marks shootout attempts with period SO and no clock", () => {
    const rows = lines(matchEventsToCsv(shootoutMatch()));
    expect(rows).toContain('7,SO,,Bath Buccaneers L1,shootout_attempt,10,"Round 1, scored"');
    expect(rows).toContain('9,SO,,Bath Buccaneers L1,shootout_attempt,6,"Round 2, missed"');
  });

  it("marks cards and forfeits in the shootout with period SO and no clock", () => {
    const m = shootoutMatch();
    m.events = m.events.filter((e) => e.seq <= 12);
    m.events.push(
      { seq: 13, type: "card", team: "home", player: 10, color: "yellow", period: 2, clockMs: 2100000, shootout: true },
      { seq: 14, type: "shootout_attempt", team: "home", round: 4, scored: false, forfeit: true },
    );
    const rows = lines(matchEventsToCsv(m));
    expect(rows).toContain('13,SO,,Bath Buccaneers L1,card,10,"Yellow, in the shootout"');
    expect(rows).toContain('14,SO,,Bath Buccaneers L1,shootout_attempt,,"Round 4, forfeited"');
  });
});

describe("matchListToCsv", () => {
  it("writes one row per match with score and totals", () => {
    const rows = lines(matchListToCsv([leagueMatch(), shootoutMatch()]));
    expect(rows).toHaveLength(3);
    expect(rows[0]!.split(",")).toHaveLength(19);
    expect(rows[1]).toBe(
      "0192a1b4-7c3e-7d2a-9f10-3b5e8c1d2a47,2026-09-19T13:02:11Z,South League Premier,\"Oxford Hawks, Pitch 1\"," +
        "Oxford Hawks M1,Reading M1,2,1,,,Oxford Hawks M1,1,1,1,0,1,0,1,0",
    );
    expect(rows[2]).toBe(
      "0192b3c9-1a2b-7c3d-8e4f-5a6b7c8d9e0f,2026-09-20T10:00:00Z,,," +
        "Bath Buccaneers L1,Bristol University L1,1,1,2,3,Bristol University L1,0,0,0,0,0,0,0,0",
    );
  });

  it("writes just the header for no matches", () => {
    expect(lines(matchListToCsv([]))).toEqual([
      "match_id,started_at,competition,venue,home_team,away_team,home_score,away_score,shootout_home,shootout_away,winner," +
        "home_penalty_corners,away_penalty_corners,home_green,home_yellow,home_red,away_green,away_yellow,away_red",
    ]);
  });
});

describe("parseCsv", () => {
  it("reads cells, quoted ones with commas, quotes and line breaks", () => {
    expect(parseCsv('club,team\r\n"Hawks, Oxford",M1\r\n"The ""Saints""","Ladies\n1s"\r\n')).toEqual([
      ["club", "team"],
      ["Hawks, Oxford", "M1"],
      ['The "Saints"', "Ladies\n1s"],
    ]);
  });

  it("trims cells and skips a byte-order mark and blank lines", () => {
    expect(parseCsv("﻿ name \n\n Banbury Road \n,\n")).toEqual([["name"], ["Banbury Road"]]);
  });

  it("reads semicolon-separated files", () => {
    expect(parseCsv("club;team\nHawks;M1\n")).toEqual([
      ["club", "team"],
      ["Hawks", "M1"],
    ]);
  });

  it("reads back what toCsv writes", () => {
    const rows = [
      ["a", 'b "c"'],
      ["d, e", "f"],
    ];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});
