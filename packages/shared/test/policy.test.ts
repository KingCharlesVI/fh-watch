import { describe, expect, it } from "vitest";
import { type Actor, type MatchAccess, canEditTeams, canOnMatch, canUploadMatch } from "../src/policy.js";
import { canManageUmpiring, umpireLevelName } from "../src/umpiring.js";

const umpire: Actor = { id: "u1", roles: ["umpire"], clubId: null };
const otherUmpire: Actor = { id: "u2", roles: ["umpire"], clubId: null };
const clubAdmin: Actor = { id: "c1", roles: ["club_admin"], clubId: "club-a" };
const umpireAndClubAdmin: Actor = { id: "uc", roles: ["umpire", "club_admin"], clubId: "club-b" };
const admin: Actor = { id: "a1", roles: ["admin"], clubId: null };

const draft: MatchAccess = { status: "draft", umpireUserIds: ["u1", "uc"], clubIds: ["club-a"] };
const published: MatchAccess = { ...draft, status: "published" };

describe("canOnMatch", () => {
  it("lets the public view only published matches", () => {
    expect(canOnMatch(null, "view", published)).toBe(true);
    expect(canOnMatch(null, "view", draft)).toBe(false);
    expect(canOnMatch(null, "view_history", published)).toBe(false);
  });

  it("gives a match's umpires full control except delete", () => {
    for (const action of ["view", "view_history", "edit", "publish"] as const) {
      expect(canOnMatch(umpire, action, draft)).toBe(true);
    }
    expect(canOnMatch(umpire, "delete", draft)).toBe(false);
  });

  it("gives other umpires only public access", () => {
    expect(canOnMatch(otherUmpire, "view", draft)).toBe(false);
    expect(canOnMatch(otherUmpire, "view", published)).toBe(true);
    expect(canOnMatch(otherUmpire, "edit", published)).toBe(false);
  });

  it("lets a club admin read, but not change, their club's matches", () => {
    expect(canOnMatch(clubAdmin, "view", draft)).toBe(true);
    expect(canOnMatch(clubAdmin, "view_history", draft)).toBe(true);
    expect(canOnMatch(clubAdmin, "edit", draft)).toBe(false);
    expect(canOnMatch(clubAdmin, "view", { ...draft, clubIds: ["club-z"] })).toBe(false);
  });

  it("combines roles", () => {
    // Umpire on this match, club admin of an unrelated club.
    expect(canOnMatch(umpireAndClubAdmin, "edit", draft)).toBe(true);
    // Not umpire on this one, but it's their club's.
    const clubMatch: MatchAccess = { status: "draft", umpireUserIds: ["u1"], clubIds: ["club-b"] };
    expect(canOnMatch(umpireAndClubAdmin, "view", clubMatch)).toBe(true);
    expect(canOnMatch(umpireAndClubAdmin, "edit", clubMatch)).toBe(false);
  });

  it("ignores umpire slots for a user who has lost the umpire role", () => {
    expect(canOnMatch({ ...umpire, roles: [] }, "edit", draft)).toBe(false);
  });

  it("lets admins do everything", () => {
    for (const action of ["view", "view_history", "edit", "publish", "delete"] as const) {
      expect(canOnMatch(admin, action, draft)).toBe(true);
    }
  });
});

describe("global permissions", () => {
  it("lets umpires and admins upload", () => {
    expect(canUploadMatch(umpire)).toBe(true);
    expect(canUploadMatch(admin)).toBe(true);
    expect(canUploadMatch(clubAdmin)).toBe(false);
    expect(canUploadMatch(null)).toBe(false);
  });

  it("lets club admins edit only their own club's teams", () => {
    expect(canEditTeams(clubAdmin, "club-a")).toBe(true);
    expect(canEditTeams(clubAdmin, "club-b")).toBe(false);
    expect(canEditTeams(umpire, "club-a")).toBe(false);
    expect(canEditTeams(admin, "club-z")).toBe(true);
  });
});

describe("canManageUmpiring", () => {
  it("lets club admins run only their own club's umpiring, and admins any", () => {
    expect(canManageUmpiring(clubAdmin, "club-a")).toBe(true);
    expect(canManageUmpiring(clubAdmin, "club-b")).toBe(false);
    expect(canManageUmpiring(umpire, "club-a")).toBe(false);
    expect(canManageUmpiring(admin, "club-z")).toBe(true);
  });
});

describe("umpireLevelName", () => {
  it("names a level, or none", () => {
    expect(umpireLevelName(0)).toBe("Trainee");
    expect(umpireLevelName(2)).toBe("Level 2");
    expect(umpireLevelName(null)).toBeNull();
    expect(umpireLevelName(9)).toBeNull();
  });
});
