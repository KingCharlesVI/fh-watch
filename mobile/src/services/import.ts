import type { MatchDocument } from "@fh/shared";
import { randomUUID } from "expo-crypto";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { type ImportSummary, importData } from "@/core/backup";
import { sync } from "./index";

/**
 * "Import from file": a backup from this or another phone, a match exported
 * from the app or the website, or one shared from the watch some other way.
 * Null if cancelled.
 */
export async function importFromFile(): Promise<ImportSummary | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: ["application/json", "text/plain", "*/*"], copyToCacheDirectory: true });
  if (picked.canceled || !picked.assets[0]) return null;
  let data: unknown;
  try {
    data = JSON.parse(await new File(picked.assets[0].uri).text());
  } catch {
    return { added: 0, duplicate: 0, invalid: ["That file isn't a match or a backup (it isn't JSON)."] };
  }
  return importData(sync, data);
}

/** Development only: a realistic match that has just finished, to try the app without a watch. */
export function sampleMatch(): MatchDocument {
  const end = Date.now() - 5 * 60_000;
  const start = end - 80 * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  return {
    schemaVersion: 1,
    id: randomUUID(),
    createdOn: "mobile",
    settings: {
      periods: 4,
      periodLengthSec: 900,
      breakLengthsSec: [120, 300, 120],
      cardDurationsSec: { green: 120, yellowShort: 300, yellowLong: 600 },
      shootoutIfDrawn: false,
    },
    teams: {
      home: { name: "Hawks M2", teamId: null, color: "#1E40AF" },
      away: { name: "Witney M1", teamId: null, color: "#B91C1C" },
    },
    venue: "Oxford Hawks, Pitch 1",
    competition: "South League Division 2",
    startedAt: iso(start),
    endedAt: iso(end),
    events: [
      { seq: 1, type: "period_start", period: 1, clockMs: 0, wallTime: iso(start) },
      { seq: 2, type: "goal", team: "home", player: 10, method: "field", period: 1, clockMs: 380000 },
      { seq: 3, type: "penalty_corner", team: "away", period: 2, clockMs: 120000 },
      { seq: 4, type: "goal", team: "away", player: 5, method: "pc", period: 2, clockMs: 125000 },
      { seq: 5, type: "card", team: "away", player: 8, color: "green", durationSec: 120, period: 3, clockMs: 400000 },
      { seq: 6, type: "goal", team: "home", player: 9, method: "field", period: 4, clockMs: 700000 },
      { seq: 7, type: "period_end", period: 4, clockMs: 900000, wallTime: iso(end) },
    ],
  };
}
