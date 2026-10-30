import { ENTRY_ERRORS, ERROR_DEFINITIONS, FILE_ERRORS } from "./cbp-rules";

/**
 * Honest coverage of CBP's published CAPE rejection causes.
 * M is COUNTED from CBP's two error tables (live page "File Validation Errors" and "Entry Validation Errors"; the May 2026 ACE
 * quick reference guide PDF carries the same file table). "Entry Summary Not Found or Archived in ACE" is in both tables and is counted once.
 *  - "data": the engine checks it from the uploaded ACE report columns (finding code in src/lib/validate.ts).
 *  - "export": the exported CSV is built so the cause cannot occur (header row, .csv, size, entries per file).
 *  - "none": cannot be checked from an ACE report. Said so, with the reason.
 */
export type CoverageStatus = "data" | "export" | "none";
export interface Cause { id: string; table: "File Validation" | "Entry Validation" | "Both tables"; cbp: string; definition: string; status: CoverageStatus; code?: string; how: string }

const d = (k: string) => ERROR_DEFINITIONS[k] ?? "";
export const CAUSES: Cause[] = [
  { id: "EMPTY", table: "File Validation", cbp: FILE_ERRORS.EMPTY, definition: "CSV file is empty or has no header", status: "export", how: "The exported file always starts with the \"Entry Number\" header row." },
  { id: "NOT_CSV", table: "File Validation", cbp: FILE_ERRORS.NOT_CSV, definition: "Upload must be a .csv", status: "export", how: "Exports are written as .csv files." },
  { id: "TOO_BIG", table: "File Validation", cbp: FILE_ERRORS.TOO_BIG, definition: "File over 1 MB", status: "export", how: "File size is measured and the list is split before it can pass 1 MB." },
  { id: "UNSAFE", table: "File Validation", cbp: FILE_ERRORS.UNSAFE, definition: "ACE's safety scan of the upload", status: "none", how: "Not checkable from this file: ACE scans the upload itself and says nothing about what trips it." },
  { id: "TOO_MANY", table: "File Validation", cbp: FILE_ERRORS.TOO_MANY, definition: "More than the allowed entry numbers in one file", status: "export", how: "Lists are split at 9,999 entries per file (the FAQ limit; the error table says 10,000, so the lower number is used)." },
  { id: "FILER_CODE", table: "File Validation", cbp: FILE_ERRORS.FILER_CODE, definition: d(FILE_ERRORS.FILER_CODE), status: "data", code: "FILER_CODE", how: "Compares the first 3 characters with the filer codes you give." },
  { id: "DUPLICATE", table: "File Validation", cbp: FILE_ERRORS.DUPLICATE, definition: d(FILE_ERRORS.DUPLICATE), status: "data", code: "DUPLICATE", how: "Strips dashes, then flags repeats." },
  { id: "NOT_11", table: "File Validation", cbp: FILE_ERRORS.NOT_11, definition: d(FILE_ERRORS.NOT_11), status: "data", code: "NOT_11", how: "Counts characters after dashes are removed." },
  { id: "ACCOUNT_MISMATCH", table: "File Validation", cbp: FILE_ERRORS.ACCOUNT_MISMATCH, definition: "Entry does not belong to the ACE account that uploads", status: "none", how: "Not checkable from this file: needs the importer behind your ACE account. The filer-code check is the closest thing." },
  { id: "NOT_FOUND", table: "Both tables", cbp: FILE_ERRORS.NOT_FOUND, definition: d(ENTRY_ERRORS.NOT_FOUND), status: "data", code: "NOT_FOUND", how: "Flags entries whose summary status is Not Found." },
  { id: "DRAWBACK", table: "Entry Validation", cbp: ENTRY_ERRORS.DRAWBACK, definition: d(ENTRY_ERRORS.DRAWBACK), status: "data", code: "DRAWBACK", how: "Drawback-claim column." },
  { id: "RECON_FILED", table: "Entry Validation", cbp: ENTRY_ERRORS.RECON_FILED, definition: d(ENTRY_ERRORS.RECON_FILED), status: "data", code: "RECON_FILED", how: "Recon flag with a Type 09 on file." },
  { id: "CANCELLED", table: "Entry Validation", cbp: ENTRY_ERRORS.CANCELLED, definition: d(ENTRY_ERRORS.CANCELLED), status: "data", code: "CANCELLED", how: "Summary status other than Accepted." },
  { id: "FINAL_LIQ", table: "Entry Validation", cbp: ENTRY_ERRORS.FINAL_LIQ, definition: d(ENTRY_ERRORS.FINAL_LIQ), status: "data", code: "FINAL_LIQ", how: "Liquidation date more than 80 days before the as-of date." },
  { id: "TRADE_CONTROL", table: "Entry Validation", cbp: ENTRY_ERRORS.TRADE_CONTROL, definition: d(ENTRY_ERRORS.TRADE_CONTROL), status: "data", code: "TRADE_CONTROL", how: "Control status other than CBP." },
  { id: "INJUNCTION", table: "Entry Validation", cbp: ENTRY_ERRORS.INJUNCTION, definition: d(ENTRY_ERRORS.INJUNCTION), status: "data", code: "INJUNCTION", how: "Injunction flag." },
  { id: "SUSPENSION", table: "Entry Validation", cbp: ENTRY_ERRORS.SUSPENSION, definition: d(ENTRY_ERRORS.SUSPENSION), status: "data", code: "SUSPENSION", how: "Pending or not-liquidated status together with a suspension record." },
  { id: "UNDER_REVIEW", table: "Entry Validation", cbp: ENTRY_ERRORS.UNDER_REVIEW, definition: d(ENTRY_ERRORS.UNDER_REVIEW), status: "data", code: "UNDER_REVIEW", how: "Adjusted-status flag." },
  { id: "TYPE_NOT_ALLOWED", table: "Entry Validation", cbp: ENTRY_ERRORS.TYPE_NOT_ALLOWED, definition: d(ENTRY_ERRORS.TYPE_NOT_ALLOWED), status: "data", code: "TYPE_NOT_ALLOWED", how: "Entry types 08, 09, 23, 47, plus warehouse 21 and 22 (CSMS 69127837)." },
  { id: "VALUE_ON_HTS", table: "Entry Validation", cbp: ENTRY_ERRORS.VALUE_ON_HTS, definition: d(ENTRY_ERRORS.VALUE_ON_HTS), status: "data", code: "VALUE_ON_HTS", how: "Goods value above $0.00 on a chapter 99 line." },
  { id: "NO_IEEPA", table: "Entry Validation", cbp: ENTRY_ERRORS.NO_IEEPA, definition: d(ENTRY_ERRORS.NO_IEEPA), status: "data", code: "NO_IEEPA", how: "No line with IEEPA duty." },
  { id: "PROTEST", table: "Entry Validation", cbp: ENTRY_ERRORS.PROTEST, definition: d(ENTRY_ERRORS.PROTEST), status: "data", code: "PROTEST", how: "Open or Suspended protest, or Denied with the AFR box checked." },
  { id: "STATEMENT", table: "Entry Validation", cbp: ENTRY_ERRORS.STATEMENT, definition: d(ENTRY_ERRORS.STATEMENT), status: "data", code: "STATEMENT", how: "Statement-pending flag." },
  { id: "INVALID_HTS", table: "Entry Validation", cbp: ENTRY_ERRORS.INVALID_HTS, definition: d(ENTRY_ERRORS.INVALID_HTS), status: "data", code: "INVALID_HTS", how: "Line action date outside the HTS begin/end dates." },
  { id: "HTS_RELATIONSHIP", table: "Entry Validation", cbp: ENTRY_ERRORS.HTS_RELATIONSHIP, definition: d(ENTRY_ERRORS.HTS_RELATIONSHIP), status: "data", code: "HTS_RELATIONSHIP", how: "Add/replace/derived HTS without its pair." },
  { id: "UNABLE_CALC", table: "Entry Validation", cbp: ENTRY_ERRORS.UNABLE_CALC, definition: "ACE could not compute the duty for a line with an 'X' duty comp code", status: "none", how: "Not checkable from this file: needs ACE's duty computation codes per line." },
  { id: "UNEXPECTED", table: "Entry Validation", cbp: ENTRY_ERRORS.UNEXPECTED, definition: "A CBP system error; CBP says to try again", status: "none", how: "Not checkable from this file: it is a system error, not a property of the entry." },
  { id: "SPI_OR_HTS", table: "Entry Validation", cbp: ENTRY_ERRORS.SPI_OR_HTS, definition: "A special program indicator or additional HTS is required on a line", status: "none", how: "Not checkable from this file: the report has no special-program-indicator column." },
];

export interface CoverageSummary { covered: number; total: number; byData: number; byExport: number; notCheckable: Cause[]; line: string }
export function coverage(): CoverageSummary {
  const ids = new Set(CAUSES.map((c) => c.cbp.toLowerCase()));
  const total = ids.size;
  const byData = CAUSES.filter((c) => c.status === "data").length;
  const byExport = CAUSES.filter((c) => c.status === "export").length;
  const covered = byData + byExport;
  return { covered, total, byData, byExport, notCheckable: CAUSES.filter((c) => c.status === "none"), line: `Catches ${covered} of ${total} published CAPE rejection causes` };
}
