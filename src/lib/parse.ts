import type { Entry, Line } from "./types";
import { parseDate } from "./dates";

/** Minimal RFC-4180 CSV parser (quotes, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQ) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

export function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function toBool(v: string | undefined): boolean {
  return /^(y|yes|true|1|x|t|checked)$/i.test((v ?? "").trim());
}
export function toCents(v: string | undefined): number {
  const s = (v ?? "").replace(/[$,\s]/g, "");
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s) || s.startsWith("-");
  const n = Number(s.replace(/[()\-]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) * (neg ? -1 : 1);
}
export function toNum(v: string | undefined): number {
  const n = Number((v ?? "").replace(/[%\s,]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normEntryType(v: string | undefined): string {
  const s = (v ?? "").trim().replace(/^'/, "");
  if (!s) return "";
  const n = s.replace(/^0+/, "");
  return (n || "0").padStart(2, "0");
}

/** Strip every non-alphanumeric char and a leading apostrophe, uppercase. This is how ACE normalizes before the 11-char check ([QRG]). */
export function normalizeEntryNumber(raw: string): string {
  return raw.replace(/^['\u2018\u2019]/, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

export function normStatus(v: string | undefined, map: Record<string, string>, fallback: string): string {
  const k = (v ?? "").trim().toLowerCase();
  if (!k) return fallback;
  return map[k] ?? (v ?? "").trim();
}

const PROTEST = { none: "None", open: "Open", suspended: "Suspended", denied: "Denied", granted: "Granted", "": "None" } as Record<string, string>;
const LIQ = {
  unliquidated: "Unliquidated", "not liquidated": "Not Liquidated", liquidated: "Liquidated", extended: "Extended",
  suspended: "Suspended", pending: "Pending", reliquidated: "Liquidated",
} as Record<string, string>;
const SUMMARY = { accepted: "Accepted", cancelled: "Cancelled", canceled: "Cancelled", rejected: "Rejected", "not found": "Not Found" } as Record<string, string>;

export interface ParseResult { entries: Entry[]; issues: string[]; headers: string[] }

export const EXPECTED_HEADERS = [
  "entry_number", "entry_type", "ior_number", "entry_summary_status", "control_status", "liquidation_status",
  "liquidation_date", "projected_liquidation_date", "suspension_record", "court_injunction", "adjusted_status",
  "statement_pending", "drawback_claim", "drawback_planned", "recon_flag", "recon_entry_filed", "recon_deadline",
  "protest_status", "afr_box", "psc_needed_non_ieepa", "ior_open_debt_usd", "broker_note", "line_no", "hts_number",
  "country_of_origin", "ieepa_indicator", "ieepa_hts", "entered_value", "col1_rate_pct", "general_duty", "ieepa_duty",
  "sec232_duty", "sec301_duty", "sec201_duty", "ch99_goods_value", "hts_valid", "hts_relationship_ok",
  "non_ieepa_underpaid_usd", "framework_group",
];

const LINE_COLS = new Set(["line_no","hts_number","country_of_origin","ieepa_indicator","ieepa_hts","entered_value","col1_rate_pct","general_duty","ieepa_duty","sec232_duty","sec301_duty","sec201_duty","ch99_goods_value","hts_valid","hts_relationship_ok","non_ieepa_underpaid_usd","framework_group"]);

export function parseEs003(csvText: string): ParseResult {
  const table = parseCsv(csvText);
  const issues: string[] = [];
  if (table.length < 2) return { entries: [], issues: ["No data rows found"], headers: [] };
  const headers = table[0].map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  if (!headers.includes("entry_number")) issues.push("Missing required column: entry_number");
  const entries: Entry[] = [];
  const cur = new Map<string, { entry: Entry; lineNos: Set<number> }>();
  const seqCount = new Map<string, number>();

  for (let r = 1; r < table.length; r++) {
    const g: Record<string, string> = {};
    headers.forEach((h, i) => { g[h] = (table[r][i] ?? "").trim(); });
    const raw = g.entry_number;
    if (!raw) { issues.push(`Row ${r + 1}: empty entry_number`); continue; }
    const lineNo = Number(g.line_no) || 1;
    let slot = cur.get(raw);
    if (!slot || slot.lineNos.has(lineNo)) {
      // new entry block (first sighting, or the same line number repeats = a duplicate entry block)
      const seq = seqCount.get(raw) ?? 0;
      seqCount.set(raw, seq + 1);
      const parseNotes: string[] = [];
      const dateField = (name: string): string | null => {
        const p = parseDate(g[name]);
        if (g[name] && !p.iso) parseNotes.push(`${name}: could not read date "${g[name]}"`);
        if (p.iso && p.reformatted) parseNotes.push(`${name}: "${g[name]}" read as ${p.iso}`);
        return p.iso;
      };
      const entry: Entry = {
        entryNumberRaw: raw,
        seq,
        entryType: normEntryType(g.entry_type),
        ior: g.ior_number ?? "",
        summaryStatus: normStatus(g.entry_summary_status, SUMMARY, "Accepted"),
        controlStatus: /^cbp$/i.test(g.control_status ?? "") || !g.control_status ? "CBP" : g.control_status,
        liquidationStatus: normStatus(g.liquidation_status, LIQ, "Unliquidated"),
        liquidationDate: dateField("liquidation_date"),
        projectedLiquidationDate: dateField("projected_liquidation_date"),
        suspensionRecord: toBool(g.suspension_record),
        injunction: toBool(g.court_injunction),
        adjustedStatus: toBool(g.adjusted_status),
        statementPending: toBool(g.statement_pending),
        drawbackClaim: toBool(g.drawback_claim),
        drawbackPlanned: toBool(g.drawback_planned),
        reconFlag: toBool(g.recon_flag),
        reconEntryFiled: toBool(g.recon_entry_filed),
        reconDeadline: dateField("recon_deadline"),
        protestStatus: normStatus(g.protest_status, PROTEST, "None"),
        afrBox: toBool(g.afr_box),
        pscNeededNonIeepa: toBool(g.psc_needed_non_ieepa),
        iorOpenDebtCents: toCents(g.ior_open_debt_usd),
        notes: g.broker_note ?? "",
        lines: [],
        raw: Object.fromEntries(Object.entries(g).filter(([k]) => !LINE_COLS.has(k))),
        parseNotes,
      };
      slot = { entry, lineNos: new Set() };
      cur.set(raw, slot);
      entries.push(entry);
    }
    slot.lineNos.add(lineNo);
    const fw = (g.framework_group ?? "").toUpperCase();
    const line: Line = {
      lineNo,
      hts: g.hts_number ?? "",
      country: g.country_of_origin ?? "",
      ieepaIndicator: toBool(g.ieepa_indicator),
      ieepaHts: g.ieepa_hts ?? "",
      enteredValueCents: toCents(g.entered_value),
      col1RatePct: toNum(g.col1_rate_pct),
      generalDutyCents: toCents(g.general_duty),
      ieepaDutyCents: toCents(g.ieepa_duty),
      s232Cents: toCents(g.sec232_duty),
      s301Cents: toCents(g.sec301_duty),
      s201Cents: toCents(g.sec201_duty),
      ch99GoodsValueCents: toCents(g.ch99_goods_value),
      htsValid: g.hts_valid === "" ? true : toBool(g.hts_valid),
      htsRelationshipOk: g.hts_relationship_ok === "" ? true : toBool(g.hts_relationship_ok),
      underpaidOtherCents: toCents(g.non_ieepa_underpaid_usd),
      frameworkGroup: (["EU", "JP", "KR", "CH"].includes(fw) ? fw : "") as Line["frameworkGroup"],
    };
    slot.entry.lines.push(line);
  }
  return { entries, issues, headers };
}
