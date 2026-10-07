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

/** Where matches are played: one list, not tied to clubs, offered when an umpire sets up a match. */
export interface Venue {
  id: string;
  name: string;
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
