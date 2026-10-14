import { describe, expect, it } from "vitest";
import { describeChanges } from "../src/changes.js";
import { addEvent, cancelEvent, restoreEvent, setCardReason, setEventPlayer } from "../src/edit.js";
import { leagueMatch } from "./fixtures.js";

describe("describeChanges", () => {
  it("is empty when nothing changed", () => {
    expect(describeChanges(leagueMatch(), leagueMatch())).toEqual([]);
  });

  it("names changed details, with what they were and are", () => {
    const before = leagueMatch();
    const after = leagueMatch();
    after.teams.away.name = "Reading Men's 1s";
    after.teams.home.captain = 10;
    after.teams.away.teamId = "0192f8c4-0000-7000-8000-000000000001";
    after.venue = null;
    after.competition = "South League Division 1";
    expect(describeChanges(before, after)).toEqual([
      "Home team's captain: #7 → #10",
      "Away team: “Reading M1” → “Reading Men's 1s”",
      "Away team linked to a club",
      "Venue: “Oxford Hawks, Pitch 1” → none",
      "Competition: “South League Premier” → “South League Division 1”",
    ]);
  });

  it("shows an added goal and the score it makes", () => {
    const before = leagueMatch();
    const after = addEvent(before, { type: "goal", team: "away", player: 7, period: 4, clockMs: 900000 });
    const lines = describeChanges(before, after);
    expect(lines[0]).toMatch(/^Score: \d+–\d+ → \d+–\d+$/);
    expect(lines.at(-1)).toBe("Added: Q4 15:00 Goal, Reading M1 #7");
  });

  it("shows a cancelled goal, and the goal again when it's restored", () => {
    const before = leagueMatch();
    const cancelled = cancelEvent(before, 2, new Set(before.events.map((e) => e.seq)));
    expect(describeChanges(before, cancelled)).toContain("Cancelled: Q1 6:52 Goal, Oxford Hawks M1 #9");
    expect(describeChanges(cancelled, restoreEvent(cancelled, 2))).toContain("Restored: Q1 6:52 Goal, Oxford Hawks M1 #9");
  });

  it("shows a corrected shirt number or card reason as a change to the event", () => {
    const before = leagueMatch();
    expect(describeChanges(before, setEventPlayer(before, 2, 10))).toEqual(["Changed: Q1 6:52 Goal, Oxford Hawks M1 #9 → Q1 6:52 Goal, Oxford Hawks M1 #10"]);
    expect(describeChanges(before, setCardReason(before, 3, "dissent"))).toEqual([
      "Changed: Q1 8:50 Yellow card (5 min), Reading M1 #4 → Q1 8:50 Yellow card (5 min): dissent, Reading M1 #4",
    ]);
  });
});
