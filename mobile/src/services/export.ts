import { type MatchDocument, matchEventsToCsv, renderMatchReport, summarizeMatch } from "@fh/shared";
import { Directory, File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { makeBackup } from "@/core/backup";
import type { LocalMatch } from "@/core/store";
import { sync } from "./index";

/**
 * Getting matches off the phone as files: a match report (PDF, the same one the
 * website prints), its events (CSV), the match data (JSON), or a backup of every
 * match. Each can be saved to a folder the umpire picks, or shared (email, Drive,
 * WhatsApp and so on).
 */

export type ExportKind = "pdf" | "csv" | "json";

const TYPES = {
  pdf: { mime: "application/pdf", ext: "pdf" },
  csv: { mime: "text/csv", ext: "csv" },
  json: { mime: "application/json", ext: "json" },
} as const;

/** "2026-09-24 Hawks M1 v Reading M1", safe as a file name. */
export function fileBaseName(doc: MatchDocument): string {
  const date = doc.startedAt.slice(0, 10);
  const name = `${date} ${doc.teams.home.name} v ${doc.teams.away.name}`;
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Writes the export to the app's cache and returns it. */
async function build(match: LocalMatch, kind: ExportKind): Promise<{ file: File; name: string }> {
  const doc = match.document;
  if (!doc) throw new Error("This match isn't on the phone yet.");
  const name = `${fileBaseName(doc)}.${TYPES[kind].ext}`;
  const dir = new Directory(Paths.cache, "exports");
  if (!dir.exists) dir.create({ intermediates: true });
  const file = new File(dir, name);
  if (file.exists) file.delete();

  if (kind === "pdf") {
    const umpires = match.server?.umpires.length
      ? match.server.umpires.map((u) => ({ slot: u.slot, name: u.name }))
      : (match.umpireNames ?? []).map((name, i) => ({ slot: i + 1, name }));
    const html = renderMatchReport({
      document: doc,
      umpires,
      revision: null,
      shareUrl: match.server?.shareUrl ?? null,
      generatedAt: new Date(),
    });
    const printed = await Print.printToFileAsync({ html });
    new File(printed.uri).move(file);
  } else if (kind === "csv") {
    // The byte-order mark makes Excel read accented names correctly.
    file.write(`﻿${matchEventsToCsv(doc)}`);
  } else {
    // The same shape as the website's JSON download, so "Import from file" reads it back.
    file.write(JSON.stringify({ document: doc, summary: summarizeMatch(doc) }, null, 2));
  }
  return { file, name };
}

async function share(file: File, mimeType: string, title: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: title });
}

/**
 * Asks for a folder and writes the file there. Returns false if the umpire
 * backed out of choosing a folder.
 */
async function saveToFolder(file: File, name: string, mimeType: string): Promise<boolean> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    return false;
  }
  const out = folder.createFile(name, mimeType);
  out.write(await file.bytes());
  return true;
}

export async function shareMatch(match: LocalMatch, kind: ExportKind) {
  const { file } = await build(match, kind);
  await share(file, TYPES[kind].mime, "Send the match");
}

export async function saveMatch(match: LocalMatch, kind: ExportKind): Promise<boolean> {
  const { file, name } = await build(match, kind);
  return saveToFolder(file, name, TYPES[kind].mime);
}

async function buildBackup(): Promise<{ file: File; name: string; count: number }> {
  const backup = makeBackup(await sync.list(), new Date());
  const name = `FH Match Centre backup ${backup.exportedAt.slice(0, 10)}.json`;
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.write(JSON.stringify(backup));
  return { file, name, count: backup.matches.length };
}

/** Saves a backup of every match. Returns how many it holds, or null if cancelled. */
export async function saveBackup(): Promise<number | null> {
  const { file, name, count } = await buildBackup();
  return (await saveToFolder(file, name, "application/json")) ? count : null;
}

export async function shareBackup(): Promise<number> {
  const { file, count } = await buildBackup();
  await share(file, "application/json", "Send the backup");
  return count;
}
