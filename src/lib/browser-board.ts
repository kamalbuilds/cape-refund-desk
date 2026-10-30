import { fmtUsd } from "./money";
import { checkUpload, parseEs003 } from "./parse";
import { validateEntries } from "./validate";
import type { EntryInfo, RunResult } from "./pipeline";

/** Deterministic board only. Runs entirely in the browser; the CSV never leaves the machine. */
export function browserBoard(csv: string, asOf: string, filerCodes: string[], label: string): Omit<RunResult, "receipt" | "explanations" | "portfolioNote"> {
  const chk = checkUpload(csv);
  if (!chk.ok) throw new Error(chk.error);
  const { entries, issues } = parseEs003(csv);
  const portfolio = validateEntries(entries, { asOf, filerCodes });
  const entryInfo: Record<string, EntryInfo> = {};
  for (const v of portfolio.verdicts) {
    const e = entries[v.entryIdx];
    entryInfo[v.id] = {
      notes: e.notes, parseNotes: e.parseNotes, ior: e.ior, entryType: e.entryType, liquidationStatus: e.liquidationStatus, liquidationDate: e.liquidationDate,
      lines: e.lines.map((l) => ({ lineNo: l.lineNo, hts: l.hts, country: l.country, value: fmtUsd(l.enteredValueCents), ieepaDuty: fmtUsd(l.ieepaDutyCents), framework: l.frameworkGroup })),
      noteSignals: [], noteSummary: "", noteConflicts: [],
    };
  }
  return { asOf, filerCodes, label, parseIssues: issues, portfolio, entryInfo, normalization: { checked: 0, agree: 0, disagreements: [] } };
}
