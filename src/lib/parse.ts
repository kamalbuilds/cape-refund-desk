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

const normHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const FLEXPORT_REQUIRED = ["entry_summary_number", "entry_summary_line_number", "tariff_ordinal_number", "hts_number_full", "line_tariff_goods_value_amount", "line_tariff_duty_amount"];

/** Which duty a chapter 99 heading carries. IEEPA: 9903.01 and 9903.02. Section 301: 9903.88, .89, .91. Section 232: 9903.76, .78, .80 to .85, .94. Section 201: 9903.45. */
function ch99Kind(hts: string): "ieepa" | "s301" | "s232" | "s201" | "other" {
  const h = hts.replace(/[^0-9]/g, "");
  if (!h.startsWith("9903")) return "other";
  const sub = h.slice(4, 6);
  if (sub === "01" || sub === "02") return "ieepa";
  if (["88", "89", "91"].includes(sub)) return "s301";
  if (["76", "78", "80", "81", "82", "83", "84", "85", "94"].includes(sub)) return "s232";
  if (sub === "45") return "s201";
  return "other";
}

/**
 * Flexport's custom ACE report (one row per tariff ordinal: Entry Summary Number, Entry Summary Line Number, Tariff Ordinal Number,
 * HTS Number - Full, Line Tariff Goods Value Amount, Line Tariff Duty Amount, optional Entry Type Code / Liquidation Date / Status)
 * rolled into this tool's one-row-per-line layout. Returns null when the file is not in that layout.
 */
export function fromFlexport(csvText: string): string | null {
  const table = parseCsv(csvText.replace(/^\uFEFF/, ""));
  if (table.length < 2) return null;
  const hs = table[0].map(normHeader);
  if (!FLEXPORT_REQUIRED.every((h) => hs.includes(h))) return null;
  const col = (row: string[], name: string) => (row[hs.indexOf(name)] ?? "").trim();
  const num = (v: string) => Number(v.replace(/[$,\s]/g, "")) || 0;
  type L = { entry: string; type: string; liqDate: string; liqStatus: string; line: string; hts: string; value: number; general: number; ieepa: number; ieepaHts: string; ch99Value: number; s232: number; s301: number; s201: number };
  const lines = new Map<string, L>();
  const rows = table.slice(1).filter((r) => r.some((c) => c.trim()))
    .sort((a, b) => num(col(a, "tariff_ordinal_number")) - num(col(b, "tariff_ordinal_number")));
  for (const r of rows) {
    const entry = col(r, "entry_summary_number"), line = col(r, "entry_summary_line_number") || "1";
    const k = `${entry}\u0000${line}`;
    let l = lines.get(k);
    if (!l) { l = { entry, type: col(r, "entry_type_code"), liqDate: col(r, "liquidation_date"), liqStatus: col(r, "liquidation_status"), line, hts: "", value: 0, general: 0, ieepa: 0, ieepaHts: "", ch99Value: 0, s232: 0, s301: 0, s201: 0 }; lines.set(k, l); }
    const hts = col(r, "hts_number_full"), value = num(col(r, "line_tariff_goods_value_amount")), duty = num(col(r, "line_tariff_duty_amount"));
    const kind = ch99Kind(hts);
    if (kind === "ieepa") { l.ieepa += duty; l.ieepaHts ||= hts; l.ch99Value += value; }
    else if (kind === "s301") l.s301 += duty;
    else if (kind === "s232") l.s232 += duty;
    else if (kind === "s201") l.s201 += duty;
    else if (!hts.replace(/[^0-9]/g, "").startsWith("9903") && !l.hts) { l.hts = hts; l.value = value; l.general += duty; }
    else l.general += duty;
  }
  const head = ["entry_number", "entry_type", "liquidation_status", "liquidation_date", "line_no", "hts_number", "ieepa_indicator", "ieepa_hts", "entered_value", "general_duty", "ieepa_duty", "sec232_duty", "sec301_duty", "sec201_duty", "ch99_goods_value"];
  const out = [...lines.values()].sort((a, b) => a.entry.localeCompare(b.entry) || num(a.line) - num(b.line)).map((l) => [
    l.entry, l.type, l.liqStatus, l.liqDate, l.line, l.hts, l.ieepaHts ? "Y" : "N", l.ieepaHts, l.value.toFixed(2), l.general.toFixed(2), l.ieepa.toFixed(2), l.s232.toFixed(2), l.s301.toFixed(2), l.s201.toFixed(2), l.ch99Value.toFixed(2),
  ].map(csvEscape).join(","));
  return [head.join(","), ...out].join("\n");
}

export function parseEs003(csvText: string): ParseResult {
  csvText = fromFlexport(csvText) ?? csvText;
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
      htsValid: !g.hts_valid ? true : toBool(g.hts_valid),
      htsRelationshipOk: !g.hts_relationship_ok ? true : toBool(g.hts_relationship_ok),
      underpaidOtherCents: toCents(g.non_ieepa_underpaid_usd),
      frameworkGroup: (["EU", "JP", "KR", "CH"].includes(fw) ? fw : "") as Line["frameworkGroup"],
    };
    slot.entry.lines.push(line);
  }
  return { entries, issues, headers };
}

export type UploadCheck = { ok: true; entries: number } | { ok: false; error: string };
/** Reject files that are not in the layout this tool reads, with a message a business owner can act on. */
export function checkUpload(csvText: string): UploadCheck {
  const raw = csvText.replace(/^\uFEFF/, "");
  if (!raw.trim()) return { ok: false, error: "That file is empty." };
  const t = fromFlexport(raw) ?? raw;
  const table = parseCsv(t);
  const headers = (table[0] ?? []).map((h) => h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const shown = (table[0] ?? []).slice(0, 6).map((h) => h.trim()).filter(Boolean).join(", ");
  if (!headers.includes("entry_number")) {
    return { ok: false, error: `This doesn't look like an entry-summary export: there is no "entry_number" column${shown ? ` (the first columns are: ${shown})` : ""}. Use "Download the sample CSV" to see the layout this tool reads.` };
  }
  if (!headers.some((h) => ["ieepa_duty", "entered_value", "hts_number"].includes(h))) {
    return { ok: false, error: "The file has an entry_number column but none of the duty columns (ieepa_duty, entered_value, hts_number), so there is nothing to check. Use \"Download the sample CSV\" to see the layout." };
  }
  const { entries } = parseEs003(t);
  if (entries.length === 0) return { ok: false, error: "No shipments could be read from that file. Check that the rows have an entry_number." };
  return { ok: true, entries: entries.length };
}
