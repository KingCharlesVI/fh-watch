import type { Match, MatchDocument, ValidationIssue } from "@fh/shared";
import type { Fitness } from "./fitness";
import type { RedCardReport } from "./red-card";

/** One match as this phone knows it: what's been received or edited here, plus the server's view. */
export interface LocalMatch {
  id: string;
  /** The current document. Null for a match known only from the server list until it's opened. */
  document: MatchDocument | null;
  /** The document exactly as it arrived from the watch or file, uploaded first so the original is kept. */
  original: MatchDocument | null;
  source: "watch" | "file" | "server";
  /** The server revision `document` is based on. Null until the first successful upload. */
  baseRevision: number | null;
  /** The server's last answer about this match. */
  server: Match | null;
  /** `document` has changes the server doesn't have yet. */
  dirty: boolean;
  /**
   * The umpire asked for these changes to be uploaded. Nothing leaves the phone
   * without that; once asked, it retries by itself until it gets through. Cleared
   * by a successful upload, so later edits wait to be asked again. Absent on rows
   * saved by older versions of the app, which means not asked.
   */
  uploadRequested?: boolean;
  /**
   * Umpire names kept on the phone, for match reports made here. The server keeps
   * its own list once a match is uploaded.
   */
  umpireNames?: string[];
  /** The umpire's workout, recorded by the watch. Only ever on this phone. */
  fitness?: Fitness;
  /** Reports on this match's red cards. Only ever on this phone. */
  redCardReports?: RedCardReport[];
  /** When the workout was last saved to Health Connect. */
  healthSavedAt?: string;
  /** The server has a newer version than `baseRevision`: the umpire picks which to keep. */
  conflict: { revision: number; document: MatchDocument } | null;
  /** Why the last upload was refused (not a network problem). Uploads pause until the next edit or retry. */
  lastError: string | null;
  /** Warnings from the last successful upload. */
  warnings: ValidationIssue[];
  /** Failed upload attempts in a row, for backoff. */
  attempts: number;
  /** Epoch ms before which not to retry. */
  nextAttemptAt: number | null;
  /** The umpire has opened it on this phone. Unseen matches show under "New". */
  seen: boolean;
  receivedAt: string;
  updatedAt: string;
}

/** Where the phone keeps its matches. SQLite in the app, memory in tests. */
export interface MatchStore {
  list(): Promise<LocalMatch[]>;
  get(id: string): Promise<LocalMatch | null>;
  put(match: LocalMatch): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  /**
   * Matches the umpire deleted here. The watch keeps a match until the phone
   * confirms it, and a Data Layer item the watch couldn't clear is read again
   * every time the app looks, so without this a deleted match comes straight
   * back under "New". Kept after a sign-out: a match id is a UUID, so it can
   * never be another umpire's.
   */
  wasDeleted(id: string): Promise<boolean>;
  markDeleted(id: string): Promise<void>;
  forgetDeleted(id: string): Promise<void>;
}

export class MemoryMatchStore implements MatchStore {
  private readonly rows = new Map<string, string>();
  private readonly deleted = new Set<string>();
  async list() {
    return [...this.rows.values()].map((r) => JSON.parse(r) as LocalMatch);
  }
  async get(id: string) {
    const row = this.rows.get(id);
    return row ? (JSON.parse(row) as LocalMatch) : null;
  }
  async put(match: LocalMatch) {
    this.rows.set(match.id, JSON.stringify(match));
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
  async clear() {
    this.rows.clear();
  }
  async wasDeleted(id: string) {
    return this.deleted.has(id);
  }
  async markDeleted(id: string) {
    this.deleted.add(id);
  }
  async forgetDeleted(id: string) {
    this.deleted.delete(id);
  }
}
