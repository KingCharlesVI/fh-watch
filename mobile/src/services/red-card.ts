import { File } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import Storage from "expo-sqlite/kv-store";
import type { MatchDocument } from "@fh/shared";
import { FileShare } from "../../modules/file-share";
import { type Answer, EMPTY_REPORTER, type ReporterDetails, renderRedCardReport, reportText } from "@/core/red-card";
import { fileBaseName } from "./export";

const REPORTER_KEY = "redCard.reporter";

/** The umpire's name, qualification and contact details, as last entered on a report. */
export async function loadReporter(): Promise<ReporterDetails> {
  try {
    const raw = await Storage.getItem(REPORTER_KEY);
    return raw ? { ...EMPTY_REPORTER, ...(JSON.parse(raw) as Partial<ReporterDetails>) } : EMPTY_REPORTER;
  } catch {
    return EMPTY_REPORTER;
  }
}

export async function saveReporter(details: ReporterDetails): Promise<void> {
  await Storage.setItem(REPORTER_KEY, JSON.stringify(details));
}

/** The report as a PDF, to the share sheet: to the Area Disciplinary Administrator, or kept for the umpire's records. */
export async function shareRedCardReport(doc: MatchDocument, answers: Answer[]): Promise<void> {
  const printed = await Print.printToFileAsync({ html: renderRedCardReport(doc, answers, new Date()) });
  const file = new File(printed.uri);
  const named = new File(file.parentDirectory, `${fileBaseName(doc)} red card report.pdf`);
  if (named.exists) named.delete();
  file.move(named);
  const subject = `Red card report: ${doc.teams.home.name} v ${doc.teams.away.name}`;
  if (FileShare) await FileShare.shareFile(named.uri, "application/pdf", subject, reportText(answers), "Share the red card report");
  else {
    if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing isn't available on this phone.");
    await Sharing.shareAsync(named.uri, { mimeType: "application/pdf", dialogTitle: "Share the red card report" });
  }
}
