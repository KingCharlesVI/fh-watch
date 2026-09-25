import type { MatchDocument } from "@fh/shared";
import type { LocalMatch } from "./store";
import type { ImportResult } from "./sync";

/**
 * A copy of every match on the phone in one JSON file, so nothing is lost
 * with the phone (or when the app is reinstalled), and matches can move to
 * another phone. "Import from file" reads it back.
 */
export const BACKUP_FORMAT = "fh-match-centre-backup";

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  matches: { document: MatchDocument; umpireNames?: string[] }[];
}

export function makeBackup(rows: LocalMatch[], now: Date): Backup {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    matches: rows
      .filter((r) => r.document)
      .map((r) => ({ document: r.document!, ...(r.umpireNames?.length ? { umpireNames: r.umpireNames } : {}) })),
  };
}

export function isBackup(data: unknown): data is Backup {
  return !!data && typeof data === "object" && (data as { format?: unknown }).format === BACKUP_FORMAT;
}

export interface ImportSummary {
  added: number;
  duplicate: number;
  invalid: string[];
}

interface Engine {
  importMatch(input: unknown, source: "file"): Promise<ImportResult>;
  setUmpireNames(id: string, names: string[]): Promise<void>;
}

/**
 * Reads a file's contents: a backup, one match document, or the website's
 * JSON download (a document wrapped with its summary). Matches the phone
 * already has are left as they are.
 */
export async function importData(engine: Engine, data: unknown): Promise<ImportSummary> {
  const summary: ImportSummary = { added: 0, duplicate: 0, invalid: [] };
  const entries: { document: unknown; umpireNames?: string[] }[] = isBackup(data)
    ? data.matches
    : [{ document: data && typeof data === "object" && "document" in data ? (data as { document: unknown }).document : data }];
  for (const entry of entries) {
    const result = await engine.importMatch(entry.document, "file");
    if (result.status === "added") {
      summary.added++;
      const id = (entry.document as MatchDocument).id;
      if (entry.umpireNames?.length) await engine.setUmpireNames(id, entry.umpireNames);
    } else if (result.status === "duplicate") {
      summary.duplicate++;
    } else {
      summary.invalid.push(...(result.errors ?? ["Not a match."]));
    }
  }
  return summary;
}
