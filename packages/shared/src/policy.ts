/**
 * Who may do what. The API enforces these rules; the website and phone app
 * call the same functions only to decide which buttons to show.
 */

export const ROLES = ["admin", "umpire", "club_admin"] as const;
export type Role = (typeof ROLES)[number];

export interface Actor {
  id: string;
  roles: readonly Role[];
  /** The club this user administers. Set only when roles include `club_admin`. */
  clubId: string | null;
}

/** The facts about a match that permissions depend on. */
export interface MatchAccess {
  status: "draft" | "published";
  /** Registered umpires (slot 1 and, if set, slot 2). */
  umpireUserIds: readonly string[];
  /** Clubs of the linked home and away teams. */
  clubIds: readonly string[];
}

export type MatchAction = "view" | "edit" | "publish" | "delete" | "view_history";

export function hasRole(actor: Actor | null | undefined, role: Role): boolean {
  return !!actor && actor.roles.includes(role);
}

/**
 * Adding a venue or competition the lists don't have yet, while setting up or editing a
 * match: umpires and admins. Renaming and deleting stay with admins.
 */
export function canAddToLists(actor: Actor | null | undefined): boolean {
  return hasRole(actor, "umpire") || hasRole(actor, "admin");
}

const isMatchUmpire = (actor: Actor, match: MatchAccess) =>
  hasRole(actor, "umpire") && match.umpireUserIds.includes(actor.id);

const isMatchClubAdmin = (actor: Actor, match: MatchAccess) =>
  hasRole(actor, "club_admin") && actor.clubId !== null && match.clubIds.includes(actor.clubId);

/** Permissions are the union of the actor's roles. `null` is the public. */
export function canOnMatch(actor: Actor | null | undefined, action: MatchAction, match: MatchAccess): boolean {
  if (hasRole(actor, "admin")) return true;
  switch (action) {
    case "view":
      return match.status === "published" || (!!actor && (isMatchUmpire(actor, match) || isMatchClubAdmin(actor, match)));
    case "view_history":
      return !!actor && (isMatchUmpire(actor, match) || isMatchClubAdmin(actor, match));
    case "edit":
    case "publish":
      return !!actor && isMatchUmpire(actor, match);
    case "delete":
      return false;
  }
}

export function canUploadMatch(actor: Actor | null | undefined): boolean {
  return hasRole(actor, "admin") || hasRole(actor, "umpire");
}

/** Add or edit teams in a club. Deleting them is admin-only. */
export function canEditTeams(actor: Actor | null | undefined, clubId: string): boolean {
  return hasRole(actor, "admin") || (hasRole(actor, "club_admin") && actor!.clubId === clubId);
}
