// Generates data/sample-es003.csv: SYNTHETIC entries shaped like ACE ES-003 (Entry Summary Line Tariff Details,
// with the IEEPA tariff indicator) joined with ES-701 liquidation dates. Nothing here is real trade data.
// As-of date is fixed so countdowns are reproducible.
import fs from "node:fs";
export const AS_OF = "2026-10-29";
const day = (iso) => Math.floor(Date.parse(iso + "T00:00:00Z") / 86400000);
const iso = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const ago = (d) => iso(day(AS_OF) - d);
const ahead = (d) => iso(day(AS_OF) + d);
let seed = 20261029;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const num7 = () => String(Math.floor(rnd() * 9000000) + 1000000);

const COLS = ["entry_number","entry_type","ior_number","entry_summary_status","control_status","liquidation_status","liquidation_date","projected_liquidation_date","suspension_record","court_injunction","adjusted_status","statement_pending","drawback_claim","drawback_planned","recon_flag","recon_entry_filed","recon_deadline","protest_status","afr_box","psc_needed_non_ieepa","ior_open_debt_usd","broker_note","line_no","hts_number","country_of_origin","ieepa_indicator","ieepa_hts","entered_value","col1_rate_pct","general_duty","ieepa_duty","sec232_duty","sec301_duty","sec201_duty","ch99_goods_value","hts_valid","hts_relationship_ok","non_ieepa_underpaid_usd","framework_group"];

const GOODS = [
  ["8708.30.5030", "DE", "brake parts"], ["8501.10.2040", "CN", "micro motors"], ["6403.99.9065", "VN", "leather footwear"],
  ["9403.60.8081", "VN", "wood furniture"], ["8516.60.4070", "CN", "kitchen appliances"], ["3926.90.9990", "TH", "plastic housewares"],
  ["7318.15.2095", "IN", "steel fasteners"], ["8544.42.9090", "MY", "cable assemblies"], ["6110.20.2079", "BD", "cotton sweaters"],
  ["9503.00.0073", "CN", "toys"], ["8471.30.0100", "TW", "tablet computers"], ["4202.92.3131", "KH", "backpacks"],
  ["2933.39.6100", "IN", "chemical intermediates"], ["8302.41.6015", "IT", "cabinet hardware"], ["9018.90.7580", "JP", "medical instruments"],
  ["9102.11.2500", "CH", "wrist watches"], ["8479.89.9499", "KR", "industrial machinery"], ["7326.90.8688", "CN", "steel articles"],
];
const RATE = { CN: 20, VN: 20, TH: 19, IN: 25, MY: 19, BD: 20, KH: 19, TW: 20, DE: 15, IT: 15, JP: 15, CH: 15, KR: 15 };
const CH99 = { CN: "9903.01.24", default: "9903.01.25" };

let ior = 0;
const rows = [];
let entryCounter = 0;
function money(c) { return (Math.round(c) / 100).toFixed(2); }

/**
 * mk({...}) -> pushes rows for one entry.
 * opts.prefix, opts.n (digits override), raw (override entry_number text), lines: [{good, value, rate, fw, s232, s301, under, ...}]
 */
function mk(o) {
  entryCounter++;
  const prefix = o.prefix ?? "A7K";
  const digits = o.n ?? num7();
  const full = o.full ?? `${prefix}${digits}${(Number(digits) % 10)}`; // 11 chars
  const entryNumber = o.raw ?? full;
  const nLines = o.lines?.length ?? 1;
  const projDays = o.projIn ?? 150 + Math.floor(rnd() * 120);
  const lines = o.lines ?? [{}];
  const iorNo = o.ior ?? `IOR-${String(100 + (o.iorIdx ?? (entryCounter % 6) + 1)).padStart(4, "0")}`;
  lines.forEach((ln, idx) => {
    const g = GOODS[ln.good ?? (entryCounter + idx) % GOODS.length];
    const value = ln.value ?? Math.round((8000 + rnd() * 92000) / 100) * 100;
    const country = ln.country ?? g[1];
    const rate = ln.rate ?? RATE[country] ?? 10;
    const col1 = ln.col1 ?? [0, 2.5, 3.4, 4.2, 5][Math.floor(rnd() * 5)];
    const valC = value * 100;
    const fw = ln.fw ?? "";
    const hts99 = ln.hts99 ?? (CH99[country] ?? CH99.default);
    const isIeepa = ln.ieepa ?? true;
    const ieepaDuty = !isIeepa ? 0 : fw ? Math.round(valC * 0.15) : Math.round(valC * rate / 100);
    const general = fw ? 0 : Math.round(valC * col1 / 100);
    const s232 = ln.s232 ? Math.round(valC * ln.s232 / 100) : 0;
    const s301 = ln.s301 ? Math.round(valC * ln.s301 / 100) : 0;
    const rec = {
      entry_number: entryNumber, entry_type: o.type ?? "01", ior_number: iorNo,
      entry_summary_status: o.status ?? "Accepted", control_status: o.control ?? "CBP",
      liquidation_status: o.liqStatus ?? (o.liqAgo !== undefined ? "Liquidated" : "Unliquidated"),
      liquidation_date: o.liqDateText ?? (o.liqAgo !== undefined ? ago(o.liqAgo) : ""),
      projected_liquidation_date: o.projText ?? (o.liqAgo === undefined ? ahead(projDays) : ""),
      suspension_record: o.suspension ?? "N", court_injunction: o.injunction ?? "N", adjusted_status: o.adjusted ?? "N",
      statement_pending: o.statement ?? "N", drawback_claim: o.drawback ?? "N", drawback_planned: o.drawbackPlanned ?? "N",
      recon_flag: o.recon ?? "N", recon_entry_filed: o.reconFiled ?? "N", recon_deadline: o.reconDeadline ?? "",
      protest_status: o.protest ?? "None", afr_box: o.afr ?? "N", psc_needed_non_ieepa: o.psc ?? "N",
      ior_open_debt_usd: o.debt ?? "", broker_note: idx === 0 ? (o.note ?? "") : "",
      line_no: String(idx + 1), hts_number: g[0], country_of_origin: country,
      ieepa_indicator: isIeepa ? (o.yn ?? "Y") : "N", ieepa_hts: isIeepa ? hts99 : "",
      entered_value: o.moneyFmt ? `$${value.toLocaleString("en-US")}.00` : money(valC),
      col1_rate_pct: String(col1), general_duty: money(general), ieepa_duty: money(ieepaDuty),
      sec232_duty: money(s232), sec301_duty: money(s301), sec201_duty: "0.00",
      ch99_goods_value: ln.ch99Val ? money(ln.ch99Val * 100) : "0.00",
      hts_valid: ln.htsInvalid ? "N" : "Y", hts_relationship_ok: ln.relBad ? "N" : "Y",
      non_ieepa_underpaid_usd: ln.underFrac ? money(ieepaDuty * ln.underFrac) : ln.under ? money(ln.under * 100) : "0.00", framework_group: fw,
    };
    rows.push(rec);
  });
}

// ---- A. Clean unliquidated (FILE NOW, step 4): incl. 232 and 301 co-duties paid correctly ----
mk({ lines: [{ good: 1 }, { good: 4, s301: 25 }], note: "Importer confirmed 301 was declared on both lines." });
mk({ lines: [{ good: 7, s232: 25 }] });
mk({ lines: [{ good: 2 }] });
mk({ lines: [{ good: 3 }, { good: 5 }] });
mk({ lines: [{ good: 8 }], moneyFmt: true });
mk({ lines: [{ good: 9, s301: 7.5 }] });
mk({ lines: [{ good: 10 }] });
mk({ lines: [{ good: 11, s232: 50 }, { good: 17, s232: 25 }], note: "steel derivative, 232 declared." });
mk({ lines: [{ good: 12 }, { good: 0 }] });
mk({ lines: [{ good: 16 }] });
// ---- B. Liquidated entries: the 80-day clock (ES-701 liquidation dates) ----
mk({ liqAgo: 12, lines: [{ good: 2 }] });
mk({ liqAgo: 25, lines: [{ good: 3 }] });
mk({ liqAgo: 40, lines: [{ good: 4 }, { good: 6 }] });
mk({ liqAgo: 55, lines: [{ good: 5 }] });
mk({ liqAgo: 70, lines: [{ good: 1 }], liqDateText: "08/20/2026" });
mk({ liqAgo: 78, lines: [{ good: 7 }], note: "Liquidated per ES-701 courtesy notice; broker flagged as urgent." });
mk({ liqAgo: 80, lines: [{ good: 9 }] });
mk({ liqAgo: 81, lines: [{ good: 10 }, { good: 12 }], note: "TRAP: liquidated 81 days ago, one day past the CAPE window." });
mk({ liqAgo: 95, lines: [{ good: 13 }] });
mk({ liqAgo: 130, lines: [{ good: 14 }] });
// ---- C. Liquidation status variants ----
mk({ liqStatus: "Extended", lines: [{ good: 6 }], note: "liquidation extended by CBP; refund issues at liquidation" });
mk({ liqStatus: "Suspended", lines: [{ good: 8 }], suspension: "Y" });
mk({ suspension: "Y", lines: [{ good: 11 }], note: "AD/CVD scope inquiry opened, suspension record on file." });
// ---- D. Protests ----
mk({ protest: "Open", lines: [{ good: 3 }], note: "Protest 2704-26-000123 on classification still open." });
mk({ protest: "Suspended", lines: [{ good: 1 }] });
mk({ protest: "Denied", afr: "Y", lines: [{ good: 5 }], note: "Protest denied, AFR box checked." });
mk({ protest: "Denied", afr: "N", lines: [{ good: 4 }] });
mk({ protest: "Granted", lines: [{ good: 2 }] });
// ---- E. Reconciliation ----
mk({ recon: "Y", reconDeadline: ahead(120), lines: [{ good: 3 }], note: "Flagged for Recon; Type 09 not filed yet." });
mk({ recon: "Y", reconDeadline: ahead(95), lines: [{ good: 8 }, { good: 9 }] });
mk({ recon: "Y", reconDeadline: ahead(21), lines: [{ good: 10 }], note: "Recon due in 3 weeks; importer asked to file Recon first." });
mk({ recon: "Y", reconFiled: "Y", reconDeadline: ahead(-10), lines: [{ good: 7 }], note: "TRAP: Type 09 already filed for this flagged entry." });
mk({ type: "09", lines: [{ good: 4 }], note: "Reconciliation summary entry." });
// ---- F. Entry types / drawback ----
mk({ type: "23", lines: [{ good: 15 }], note: "TRAP: TIB entry type 23." });
mk({ type: "08", lines: [{ good: 15 }] });
mk({ type: "47", lines: [{ good: 13 }] });
mk({ drawback: "Y", lines: [{ good: 2 }], note: "Designated on drawback claim DBK-3321." });
mk({ drawbackPlanned: "Y", lines: [{ good: 12 }], note: "Importer plans a drawback claim in Q1; file CAPE first." });
mk({ drawbackPlanned: "Y", lines: [{ good: 6 }, { good: 1 }] });
// ---- G. Leading-zero entry numbers ----
mk({ prefix: "0P2", lines: [{ good: 1 }], note: "TRAP: leading zero; needs apostrophe in the CSV." });
mk({ prefix: "0P2", lines: [{ good: 3 }], raw: undefined });
mk({ prefix: "0P2", liqAgo: 33, lines: [{ good: 5 }] });
// ---- H. File-level and status errors ----
const dupN = num7();
mk({ n: dupN, lines: [{ good: 2 }] });
mk({ n: dupN, raw: `A7K-${dupN}-${Number(dupN) % 10}`, lines: [{ good: 2 }], note: "TRAP: same entry pasted again with dashes." });
mk({ full: "A7K12345678", raw: "A7K1234567", lines: [{ good: 4 }] }); // 10 chars
mk({ prefix: "Z3M", lines: [{ good: 6 }], note: "Filed by a different broker (Z3M)." });
mk({ status: "Cancelled", lines: [{ good: 7 }] });
mk({ control: "Trade", lines: [{ good: 9 }] });
mk({ injunction: "Y", lines: [{ good: 10 }] });
mk({ statement: "Y", lines: [{ good: 3 }] });
mk({ adjusted: "Y", lines: [{ good: 8 }] });
mk({ lines: [{ good: 11, htsInvalid: true }], note: "HTS end-dated Sept 1; PSC needed to replace." });
mk({ lines: [{ good: 5, relBad: true }] });
mk({ lines: [{ good: 14, ch99Val: 1500 }] });
mk({ lines: [{ good: 15, ieepa: false }], note: "No chapter 99 IEEPA line on this entry." });
mk({ psc: "Y", lines: [{ good: 7 }], note: "PSC for country of origin correction filed 10/12, awaiting acceptance." });
// ---- I. Framework (15% combined on one line; refund only the IEEPA portion) ----
mk({ lines: [{ good: 13, fw: "EU", col1: 5, country: "DE" }], note: "EU Framework: 15% all-in on one line." });
mk({ lines: [{ good: 14, fw: "EU", col1: 2.5, country: "IT" }, { good: 7, fw: "EU", col1: 3.4, country: "DE" }] });
mk({ liqAgo: 18, lines: [{ good: 14, fw: "JP", col1: 0, country: "JP" }], note: "Japan framework entry." });
mk({ lines: [{ good: 16, fw: "KR", col1: 8, country: "KR" }] });
mk({ lines: [{ good: 15, fw: "CH", col1: 4.5, country: "CH" }] });
// ---- J. Net-bill cases: underpaid 232/301/201, diversion (under = share of the IEEPA duty ACE will recalculate as owed) ----
mk({ iorIdx: 4, debt: "9500.00", lines: [{ good: 1, s301: 25 }, { good: 7, underFrac: 0.62 }], note: "TRAP: 301 on line 2 never declared; ACE recalculation will assess it." });
mk({ iorIdx: 4, debt: "9500.00", lines: [{ good: 17, value: 30000, underFrac: 1.5 }], note: "232 underpaid; may net to a bill." });
mk({ iorIdx: 4, lines: [{ good: 2, value: 40000, underFrac: 0.7 }], note: "301 underdeclared on this line." });
mk({ iorIdx: 7, debt: "4200.00", lines: [{ good: 3, value: 61000 }] });
mk({ iorIdx: 4, liqAgo: 44, lines: [{ good: 6, value: 42000, underFrac: 1.25 }], note: "301 underdeclared on liquidated entry." });
mk({ iorIdx: 7, lines: [{ good: 9, value: 38000, underFrac: 0.2 }] });

const header = COLS.join(",");
const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const out = [
  "# SYNTHETIC SAMPLE: realistic made-up entries shaped like ACE ES-003 + ES-701. Not real trade data. As-of " + AS_OF,
  header,
  ...rows.map((r) => COLS.map((c) => esc(r[c] ?? "")).join(",")),
];
// keep the file a clean CSV for upload: drop the comment line from the CSV but keep it in a sidecar
fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/sample-es003.csv", out.slice(1).join("\n") + "\n");
fs.writeFileSync("data/sample-meta.json", JSON.stringify({ asOf: AS_OF, filerCodes: ["A7K", "0P2"], label: out[0].slice(2), entries: entryCounter, rows: rows.length }, null, 1));
console.log("entries", entryCounter, "rows", rows.length);
