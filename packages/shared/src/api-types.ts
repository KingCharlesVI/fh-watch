import type { Role } from "./policy.js";
import type { MatchDocument } from "./schema.js";
import type { MatchSummary } from "./summary.js";
import type { ValidationIssue } from "./validate.js";

// Shapes of the API's JSON responses (see the API's OpenAPI docs at /v1/docs), for the website and phone app.

export interface User {
  id: string;
  email: string;
  displayName: string;
  roles: Role[];
  clubId: string | null;
  emailVerified: boolean;
  deletionRequested: boolean;
  createdAt: string;
}

export interface MatchSide {
  name: string;
  teamId: string | null;
  score: number;
  shootout: number | null;
}

export interface Umpire {
  slot: number;
  userId: string | null;
  name: string;
}

export interface Match {
  id: string;
  status: "draft" | "published";
  playedAt: string;
  endedAt: string | null;
  home: MatchSide;
  away: MatchSide;
  venue: string | null;
  competition: string | null;
  umpires: Umpire[];
  currentRevision: number;
  shareCode: string | null;
  shareUrl: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FullMatch {
  match: Match;
  document: MatchDocument;
  summary: MatchSummary;
}

export interface Revision {
  revision: number;
  source: "watch" | "mobile" | "web";
  createdAt: string;
  createdBy: { id: string; displayName: string | null } | null;
}

export interface Club {
  id: string;
  name: string;
  slug: string;
  /** Path to the club's logo on the API's host (`/v1/clubs/{id}/logo?v=…`), or null for none. */
  logoUrl: string | null;
}

export interface ClubTeam {
  id: string;
  clubId: string;
  name: string;
  slug: string;
}

export interface ClubWithTeams extends Club {
  teams: ClubTeam[];
}

export interface TeamWithClub extends ClubTeam {
  club: Club;
}

/** Where matches are played: one list, not tied to clubs, offered when an umpire sets up or edits a match. */
export interface Venue {
  id: string;
  name: string;
}

/** What a match is played in: one list, offered when an umpire edits a match. */
export interface Competition {
  id: string;
  name: string;
}

/** The lowest umpire level (an index into UMPIRE_LEVELS) suggested for a competition's fixtures. */
export interface CompetitionUmpireLevel {
  competitionId: string;
  minLevel: number;
}

/** Someone on a club's umpire list. Only the club's admins (and admins) see the list. */
export interface ClubUmpire {
  userId: string;
  displayName: string;
  email: string;
  /** An index into UMPIRE_LEVELS, or null if not recorded. */
  level: number | null;
  /** The club's team they play for, so they aren't suggested for its matches. */
  playsForTeamId: string | null;
  addedAt: string;
  /** Appointments for this club they've accepted this season, for spreading them fairly. */
  seasonAppointments: number;
}

/** An umpire on the club's list, as a choice for one fixture, best first. */
export interface UmpireSuggestion {
  userId: string;
  displayName: string;
  level: number | null;
  availability: "available" | "unavailable" | "unknown";
  /** Appointments for this club they've accepted this season. */
  seasonAppointments: number;
  /** Reasons they may not suit, e.g. "Plays for M1 in this match". Empty when there are none. */
  clashes: string[];
}

export interface ClubRequest {
  id: string;
  userId: string;
  user?: { displayName: string; email: string };
  clubId: string | null;
  clubName: string | null;
  wantsAdmin: boolean;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  reviewedAt: string | null;
}

/** Someone asking to join a test, from the landing page's form. Admins only. */
export interface AccessRequest {
  id: string;
  kind: "google-play" | "testflight";
  name: string;
  email: string;
  /** Their watch and phone, as they described them. */
  devices: string;
  notes: string | null;
  status: "pending" | "approved" | "denied";
  /** What they were told when it was decided, if anything was added. */
  decisionNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

/** How a fixture is played, sent to the watch with its setup. */
export interface FixtureFormat {
  periods: number;
  periodMinutes: number;
  breakMinutes: number;
  /** With an even number of periods over 2, the middle break. */
  halfTimeMinutes: number;
  shootoutIfDrawn: boolean;
}

export interface FixtureSide {
  name: string;
  /** Linked to one of the site's teams, when it is one. */
  teamId: string | null;
}

/** A match a club needs umpires for. Its club's admins (and admins) see and change it. */
export interface Fixture {
  id: string;
  clubId: string;
  /** The local day, "2026-10-11". */
  date: string;
  /** Local kick-off, "14:00", or null if not known yet. */
  time: string | null;
  home: FixtureSide;
  away: FixtureSide;
  venue: string | null;
  competition: string | null;
  /** Null to leave it to the umpire's setup. */
  format: FixtureFormat | null;
  /** 2, or 1 when the other side provides one. */
  umpiresNeeded: 1 | 2;
  notes: string | null;
  createdAt: string;
  /** Who's been asked, and what they said. Given up appointments (taken over as cover) are left out. */
  appointments: Appointment[];
}

/**
 * offered: waiting for the umpire to say. accepted. declined. released: given up, and
 * someone else took it over as cover.
 */
export type AppointmentStatus = "offered" | "accepted" | "declined" | "released";

/** An umpire asked to umpire a fixture. */
export interface Appointment {
  id: string;
  fixtureId: string;
  userId: string;
  displayName: string;
  /** "watch" runs the watch app and gets the match set up on their phone; "second" is named on the match. */
  role: "watch" | "second";
  /** A newer umpire alongside an experienced one. */
  mentoring: boolean;
  status: AppointmentStatus;
  /** Accepted, but asking for someone to cover it. */
  coverRequested: boolean;
  createdAt: string;
  respondedAt: string | null;
}

/** One of your appointments, with its fixture and the club that asked. */
export interface MyAppointment extends Appointment {
  fixture: Omit<Fixture, "appointments">;
  club: { id: string; name: string; slug: string };
  /** The other umpire on it, when there is one: offered or accepted. */
  colleague: { displayName: string; role: "watch" | "second"; status: AppointmentStatus } | null;
}

/** A day an umpire has said they can, or can't, umpire. */
export interface AvailabilityDay {
  /** "2026-10-11". */
  date: string;
  available: boolean;
  /** When available, the hours they can do, "10:00" to "16:00"; null for all day. */
  from: string | null;
  to: string | null;
}

/** An umpire's availability: days they've marked, and weekdays they're never free. */
export interface Availability {
  days: AvailabilityDay[];
  /** 0 for Sunday to 6 for Saturday. */
  unavailableWeekdays: number[];
}

/** What a bulk import added (or, as a dry run, would add). Admins only. */
export interface ImportResult {
  /** As shown to the admin: a club's name, "Club Team" for a team, or a venue's or competition's name. */
  added: string[];
  /** Rows naming something that's already there, or repeated in the import. */
  existing: number;
  /** Rows that can't be imported, by their index in the rows sent. */
  errors: { row: number; message: string }[];
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Items<T> {
  items: T[];
}

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  user: User;
}

/** RFC 9457 problem details as the API sends them. */
export interface Problem {
  type: string;
  title: string;
  status: number;
  errors?: (ValidationIssue | { path: string; message: string })[];
  warnings?: ValidationIssue[];
  currentRevision?: number;
}
