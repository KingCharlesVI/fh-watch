import { type Match, type MatchDocument, type ValidationIssue, parseMatch } from "@fh/shared";
import { type ApiClient, ApiError, NetworkError, errorMessage } from "./api";
import type { LocalMatch, MatchStore } from "./store";

/**
 * Keeps the phone's matches and the server in step. Everything is saved on the
 * phone first; uploads happen in the background and retry with backoff, so the
 * app works at a ground with no signal. Plain TypeScript, tested without a device.
 */

export type SyncState = "pending" | "uploading" | "synced" | "conflict" | "error" | "server";

export interface ImportResult {
  status: "added" | "duplicate" | "invalid";
  errors?: string[];
}

const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 15 * 60_000;
const LIST_PAGE = 100;
const LIST_MAX_PAGES = 5;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export class SyncEngine {
  private readonly listeners = new Set<() => void>();
  private readonly uploadingIds = new Set<string>();
  private uploadRun: Promise<void> | null = null;
  private userId: string | null = null;

  constructor(
    private readonly api: ApiClient,
    private readonly store: MatchStore,
    private readonly now: () => number = Date.now,
  ) {}

  // ---- Observing ----

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private changed() {
    for (const l of this.listeners) l();
  }

  list = () => this.store.list();
  get = (id: string) => this.store.get(id);

  state(m: LocalMatch): SyncState {
    if (this.uploadingIds.has(m.id)) return "uploading";
    if (m.conflict) return "conflict";
    if (m.lastError) return "error";
    if (m.dirty) return "pending";
    return m.source === "server" && !m.document ? "server" : "synced";
  }

  /** Whose matches to list from the server. Null when signed out. */
  setUser(userId: string | null) {
    this.userId = userId;
  }

  // ---- Changes made on the phone ----

  /** A match from the watch or a file. The match id is the key, so receiving it twice is harmless. */
  async importMatch(input: unknown, source: "watch" | "file"): Promise<ImportResult> {
    const parsed = parseMatch(input);
    if (!parsed.ok) return { status: "invalid", errors: parsed.errors.map((e) => e.message) };
    if (await this.store.get(parsed.match.id)) return { status: "duplicate" };
    const at = new Date(this.now()).toISOString();
    await this.store.put({
      id: parsed.match.id,
      document: parsed.match,
      original: parsed.match,
      source,
      baseRevision: null,
      server: null,
      dirty: true,
      conflict: null,
      lastError: null,
      warnings: parsed.warnings,
      attempts: 0,
      nextAttemptAt: null,
      seen: false,
      receivedAt: at,
      updatedAt: at,
    });
    this.changed();
    return { status: "added" };
  }

  /** Saves an edit on the phone and queues it for upload. Refuses documents with errors. */
  async saveEdit(id: string, document: MatchDocument): Promise<{ ok: true; warnings: ValidationIssue[] } | { ok: false; errors: string[] }> {
    const parsed = parseMatch(document);
    if (!parsed.ok) return { ok: false, errors: parsed.errors.map((e) => e.message) };
    const row = await this.require(id);
    await this.store.put({
      ...row,
      document: parsed.match,
      dirty: true,
      lastError: null,
      warnings: parsed.warnings,
      attempts: 0,
      nextAttemptAt: null,
      updatedAt: new Date(this.now()).toISOString(),
    });
    this.changed();
    return { ok: true, warnings: parsed.warnings };
  }

  async markSeen(id: string) {
    const row = await this.store.get(id);
    if (row && !row.seen) {
      await this.store.put({ ...row, seen: true });
      this.changed();
    }
  }

  /** Clears a refused upload's error so it's tried again. */
  async retry(id: string) {
    const row = await this.require(id);
    await this.store.put({ ...row, lastError: null, attempts: 0, nextAttemptAt: null });
    this.changed();
  }

  /** Settles a conflict: keep the phone's version (it's uploaded over theirs) or take the server's. */
  async resolveConflict(id: string, keep: "mine" | "theirs") {
    const row = await this.require(id);
    if (!row.conflict) return;
    await this.store.put(
      keep === "theirs"
        ? { ...row, document: row.conflict.document, baseRevision: row.conflict.revision, dirty: false, conflict: null, lastError: null }
        : { ...row, baseRevision: row.conflict.revision, dirty: true, conflict: null, lastError: null, attempts: 0, nextAttemptAt: null },
    );
    this.changed();
  }

  // ---- Talking to the server ----

  /** Uploads every match with changes, one at a time. Concurrent calls share one run. */
  uploadPending(options: { force?: boolean } = {}): Promise<void> {
    this.uploadRun ??= (async () => {
      try {
        for (const row of await this.store.list()) {
          if (!row.dirty || row.conflict || row.lastError || !row.document) continue;
          if (!options.force && row.nextAttemptAt && row.nextAttemptAt > this.now()) continue;
          const keepGoing = await this.upload(row);
          if (!keepGoing) break;
        }
      } finally {
        this.uploadRun = null;
      }
    })();
    return this.uploadRun;
  }

  /** Uploads one match. Returns false when there's no point trying the others (offline, signed out). */
  private async upload(row: LocalMatch): Promise<boolean> {
    this.uploadingIds.add(row.id);
    this.changed();
    const uploaded = row.document!;
    try {
      let revision = row.baseRevision ?? undefined;
      let result: { match: Match; warnings: ValidationIssue[] };
      if (revision === undefined && row.original && !same(row.original, uploaded)) {
        // Edited before its first upload: send the watch's original first, so it's revision 1.
        const first = await this.api.putMatch(row.id, row.original, "watch");
        revision = first.match.currentRevision;
      }
      if (revision === undefined) {
        result = await this.api.putMatch(row.id, uploaded, row.source === "server" ? "mobile" : "watch");
      } else {
        result = await this.api.putMatch(row.id, uploaded, "mobile", revision);
      }
      // The umpire may have edited again while this was uploading; keep that edit queued.
      const current = (await this.store.get(row.id)) ?? row;
      await this.store.put({
        ...current,
        server: result.match,
        baseRevision: result.match.currentRevision,
        dirty: !same(current.document, uploaded),
        warnings: result.warnings,
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
      });
      return true;
    } catch (err) {
      return this.uploadFailed(row, err);
    } finally {
      this.uploadingIds.delete(row.id);
      this.changed();
    }
  }

  private async uploadFailed(row: LocalMatch, err: unknown): Promise<boolean> {
    const current = (await this.store.get(row.id)) ?? row;
    const status = err instanceof ApiError ? err.status : 0;

    if (err instanceof NetworkError || status >= 500 || status === 429) {
      const attempts = current.attempts + 1;
      const delay = Math.min(BACKOFF_BASE_MS * 2 ** (attempts - 1), BACKOFF_MAX_MS);
      await this.store.put({ ...current, attempts, nextAttemptAt: this.now() + delay });
      return !(err instanceof NetworkError);
    }
    if (status === 401) return false;
    if (status === 412 || status === 428) {
      // Someone saved a newer version (or the match already exists with different content).
      try {
        const latest = await this.api.getMatch(row.id);
        if (same(latest.document, row.document)) {
          // An earlier upload got through but its reply was lost: nothing to resolve.
          const dirty = !same(current.document, latest.document);
          await this.store.put({ ...current, server: latest.match, baseRevision: latest.match.currentRevision, dirty, attempts: 0, nextAttemptAt: null });
          return true;
        }
        await this.store.put({
          ...current,
          server: latest.match,
          conflict: { revision: latest.match.currentRevision, document: latest.document },
        });
      } catch (fetchErr) {
        await this.store.put({ ...current, lastError: errorMessage(fetchErr) });
      }
      return true;
    }
    const message =
      status === 410
        ? "This match was deleted on the website."
        : status === 403
          ? "You don't have permission to change this match."
          : errorMessage(err);
    const details = err instanceof ApiError ? (err.problem.errors ?? []).slice(0, 3).map((e) => e.message) : [];
    await this.store.put({ ...current, lastError: [message, ...details].join("\n") });
    return true;
  }

  /** Uploads what's waiting, then fetches the umpire's matches from the server. */
  async refresh(): Promise<void> {
    await this.uploadPending({ force: true });
    if (!this.userId) return;

    const seen = new Set<string>();
    let cursor: string | undefined;
    let complete = false;
    for (let page = 0; page < LIST_MAX_PAGES; page++) {
      const res = await this.api.listMatches({ umpireId: this.userId, limit: LIST_PAGE, cursor });
      for (const m of res.items) {
        seen.add(m.id);
        await this.mergeServer(m);
      }
      if (!res.nextCursor) {
        complete = true;
        break;
      }
      cursor = res.nextCursor;
    }

    // Uploaded, unchanged matches that the server no longer lists (deleted, or no longer ours) go too.
    if (complete) {
      for (const row of await this.store.list()) {
        if (!seen.has(row.id) && row.baseRevision !== null && !row.dirty && !row.conflict) await this.store.remove(row.id);
      }
    }
    this.changed();
  }

  private async mergeServer(m: Match) {
    const row = await this.store.get(m.id);
    if (!row) {
      const at = new Date(this.now()).toISOString();
      await this.store.put({
        id: m.id,
        document: null,
        original: null,
        source: "server",
        baseRevision: m.currentRevision,
        server: m,
        dirty: false,
        conflict: null,
        lastError: null,
        warnings: [],
        attempts: 0,
        nextAttemptAt: null,
        seen: true,
        receivedAt: m.createdAt,
        updatedAt: at,
      });
      return;
    }
    const stale = !row.dirty && row.baseRevision !== m.currentRevision;
    // A newer revision from elsewhere: drop the local copy; it's fetched again when opened.
    await this.store.put({ ...row, server: m, ...(stale ? { document: null, baseRevision: m.currentRevision } : {}) });
  }

  /** Makes sure the full document is on the phone, fetching it if needed. */
  async ensureDocument(id: string): Promise<LocalMatch> {
    const row = await this.require(id);
    if (row.document) return row;
    const full = await this.api.getMatch(id);
    const updated = { ...row, document: full.document, baseRevision: full.match.currentRevision, server: full.match };
    await this.store.put(updated);
    this.changed();
    return updated;
  }

  /** Publishes (after uploading any changes, so the published version is the latest). Needs a connection. */
  async publish(id: string, publish: boolean): Promise<Match> {
    await this.syncOne(id);
    const res = publish ? await this.api.publish(id) : await this.api.unpublish(id);
    await this.setServer(id, res.match);
    return res.match;
  }

  async setSecondUmpire(id: string, value: { userId: string } | { name: string } | null): Promise<Match> {
    await this.syncOne(id);
    const res = await this.api.setSecondUmpire(id, value);
    await this.setServer(id, res.match);
    return res.match;
  }

  /** Uploads one match now, and explains if it can't be. */
  private async syncOne(id: string) {
    let row = await this.require(id);
    if (row.dirty && !row.conflict && !row.lastError) {
      await this.upload({ ...row, nextAttemptAt: null });
      row = await this.require(id);
    }
    if (row.conflict) throw new Error("Resolve the conflict with the server's version first.");
    if (row.lastError) throw new Error(row.lastError);
    if (row.dirty) throw new NetworkError("Your changes haven't uploaded yet. Check your connection.");
  }

  private async setServer(id: string, match: Match) {
    const row = await this.require(id);
    await this.store.put({ ...row, server: match });
    this.changed();
  }

  private async require(id: string): Promise<LocalMatch> {
    const row = await this.store.get(id);
    if (!row) throw new Error("This match isn't on this phone.");
    return row;
  }

  /** Forgets everything, for signing out. */
  async clear() {
    await this.store.clear();
    this.userId = null;
    this.changed();
  }
}
