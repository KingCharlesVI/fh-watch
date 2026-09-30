import { SCHEMA_VERSION } from "@fh/shared";
import { type Fitness, parseFitness } from "./fitness";
import type { ImportResult } from "./sync";

/** A match the watch sent, as the native module holds it. */
export interface InboxItem {
  id: string;
  json: string;
  receivedAt: number;
  /** The umpire's workout during the match (JSON), if the watch recorded one. */
  fitness?: string | null;
}

/** The native module's inbox (or a fake in tests). */
export interface NativeInbox {
  listInbox(): Promise<InboxItem[]>;
  removeFromInbox(id: string): Promise<void>;
  pullPending(): Promise<number>;
}

/**
 * A match that couldn't be stored. It stays in the native inbox (it's never
 * dropped) so it can be exported, or picked up once the app is updated.
 */
export interface InboxProblem {
  id: string;
  receivedAt: number;
  kind: "needs_update" | "invalid";
  details: string[];
  json: string;
}

/**
 * Document versions this app can read: the current one and, once there is one,
 * the version before (see docs/design.md). Newer ones wait for an app update.
 */
export const SUPPORTED_SCHEMA_VERSIONS = [SCHEMA_VERSION - 1, SCHEMA_VERSION].filter((v) => v >= 1);

export interface DrainResult {
  added: string[];
  problems: InboxProblem[];
}

/**
 * Moves matches from the watch inbox into the phone's store. Each is removed
 * from the inbox only once it's stored (or known already), so a crash part-way
 * loses nothing, and a watch's resend of a match the phone has is ignored.
 */
export async function drainInbox(
  inbox: NativeInbox,
  engine: {
    importMatch(input: unknown, source: "watch"): Promise<ImportResult>;
    setFitness(id: string, fitness: Fitness): Promise<void>;
  },
): Promise<DrainResult> {
  // Picks up anything the Data Layer holds that the listener missed.
  await inbox.pullPending().catch(() => 0);
  const added: string[] = [];
  const problems: InboxProblem[] = [];
  for (const item of await inbox.listInbox()) {
    const problem = (kind: InboxProblem["kind"], details: string[]) =>
      problems.push({ id: item.id, receivedAt: item.receivedAt, kind, details, json: item.json });

    let doc: unknown;
    try {
      doc = JSON.parse(item.json);
    } catch {
      problem("invalid", ["The watch sent something that isn't a match (not JSON)."]);
      continue;
    }
    const version = doc && typeof doc === "object" ? (doc as { schemaVersion?: unknown }).schemaVersion : undefined;
    if (typeof version !== "number" || !SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
      problem("needs_update", [`The watch uses match format ${String(version)}; this app reads ${SUPPORTED_SCHEMA_VERSIONS.join(" and ")}. Update the phone app.`]);
      continue;
    }
    const result = await engine.importMatch(doc, "watch");
    if (result.status === "invalid") {
      problem("invalid", result.errors ?? []);
      continue;
    }
    // A workout that can't be read is dropped: the match matters more.
    const fitness = item.fitness ? parseFitness(item.fitness) : null;
    if (fitness) await engine.setFitness(item.id, fitness);
    await inbox.removeFromInbox(item.id);
    if (result.status === "added") added.push(item.id);
  }
  return { added, problems };
}
