import { type Actor, hasRole } from "./policy.js";

/**
 * Club umpiring: each club's umpire list, its fixtures, and who's appointed to them. Club
 * admins run it for their club. It's extra: umpires still set up and umpire any match
 * themselves, for any club or none.
 */

/** Qualification levels, lowest first. A club umpire's level and a competition's minimum are stored as an index into this. */
export const UMPIRE_LEVELS = ["Trainee", "Level 1", "Level 2", "Level 3", "National"] as const;

/** A level's name, or null for none recorded. */
export function umpireLevelName(level: number | null | undefined): string | null {
  return level === null || level === undefined ? null : (UMPIRE_LEVELS[level] ?? null);
}

/** Run a club's umpiring (its umpire list, fixtures and appointments): its club admins, and admins. */
export function canManageUmpiring(actor: Actor | null | undefined, clubId: string): boolean {
  return hasRole(actor, "admin") || (hasRole(actor, "club_admin") && actor!.clubId === clubId);
}
