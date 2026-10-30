import type { Verdict } from "./types";
import { SOURCES } from "./cbp-rules";
import { buildDeclarations, declarationName, type CapeBuild } from "./cape-template";
import { fmtUsd } from "./money";
import { csvEscape } from "./parse";
import type { Portfolio } from "./validate";

export const DISCLAIMER = "Not legal or customs advice. Verify with your licensed customs broker.";
export const PREPARED_FOR = "Prepared for licensed customs broker review. Not legal or customs advice.";
export const IRREVERSIBLE =
  "A CAPE declaration cannot be amended once accepted, entries cannot be removed from it, and PSCs and protests on those entries are blocked until liquidation. Decide include vs hold BEFORE you upload.";

/** Plain-English versions for the UI. The broker handoff note keeps the technical wording above. */
export const IRREVERSIBLE_PLAIN =
  "Once Customs accepts the file, you can't edit it or take shipments back out. Corrections and appeals on those shipments are blocked until Customs finalizes them. Decide what goes in BEFORE you upload.";
export const PREPARED_FOR_PLAIN = "Not legal or customs advice. Have your licensed customs broker review the list before it is uploaded.";

export interface CapeFile { name: string; content: string; count: number; bytes: number; ok: boolean; problems: string[] }

/**
 * CAPE upload CSV in CBP's exact template (see cape-template.ts for the quoted sources): header "Entry Number",
 * one column, 11 characters, no dashes, an apostrophe before a leading zero, max 9,999 entries and under 1MB
 * per file. Validates first and refuses (one empty file marked not ok, with the reasons) rather than exporting
 * something CBP would reject.
 */
export function buildCapeFiles(verdicts: Verdict[], include: Set<string>): CapeFile[] {
  const r = buildCapeDeclaration(verdicts, include);
  if (r.ok) return r.files;
  return [{ name: declarationName(1, 1), content: "", count: 0, bytes: 0, ok: false, problems: [r.message] }];
}

export function buildCapeDeclaration(verdicts: Verdict[], include: Set<string>): CapeBuild {
  return buildDeclarations(verdicts.filter((v) => include.has(v.id)).map((v) => v.csvValue || v.key));
}

export function defaultInclude(p: Portfolio): Set<string> {
  return new Set(p.verdicts.filter((v) => v.lane === "FILE_NOW").map((v) => v.id));
}

export function deadlineCsv(p: Portfolio): string {
  const head = ["order", "entry_number", "lane", "what", "date", "days_left", "source"];
  const rows: string[][] = [];
  for (const v of p.verdicts) {
    const d = v.deadlines;
    if (d.capeDaysLeft !== null && d.capeDaysLeft >= 0 && v.lane !== "BLOCKED")
      rows.push([String(v.order), v.displayNumber, v.lane, "CAPE Phase 1 window closes (liquidated + 80 days)", d.capeCutoffDate!, String(d.capeDaysLeft), SOURCES.FAQ.url]);
    if (d.reconDeadlineDaysLeft !== null && v.lane !== "BLOCKED")
      rows.push([String(v.order), v.displayNumber, v.lane, "Reconciliation filing deadline", "", String(d.reconDeadlineDaysLeft), SOURCES.FAQ.url]);
    if (d.protestDaysLeft !== null && d.protestDaysLeft >= 0)
      rows.push([String(v.order), v.displayNumber, v.lane, "Protest window (liquidated + 180 days)", d.protestDeadlineDate!, String(d.protestDaysLeft), SOURCES.FAQ.url]);
  }
  rows.sort((a, b) => Number(a[5]) - Number(b[5]));
  return [head, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n") + "\r\n";
}

export function handoffNote(p: Portfolio, asOf: string, include: Set<string>): string {
  const inc = p.verdicts.filter((v) => include.has(v.id));
  const sum = (f: (v: Verdict) => number) => inc.reduce((s, v) => s + f(v), 0);
  const L: string[] = [];
  L.push(`# CAPE pre-flight note for broker review (as of ${asOf})`);
  L.push(`_${PREPARED_FOR}_`, "", `**Irreversible:** ${IRREVERSIBLE}`, "");
  L.push(`Proposed declaration: ${inc.length} entries, estimated IEEPA refund before interest ${fmtUsd(sum((v) => v.money.netRefundCents))}`
    + (sum((v) => v.money.billCents) ? `, possible bills ${fmtUsd(sum((v) => v.money.billCents))}` : "") + ".", "");
  const sec = (title: string, vs: Verdict[], line: (v: Verdict) => string) => {
    if (!vs.length) return;
    L.push(`## ${title} (${vs.length})`);
    vs.forEach((v) => L.push(line(v)));
    L.push("");
  };
  sec("Step 0: fix before any CAPE upload (PSC / Recon first)", p.verdicts.filter((v) => v.lane === "WAIT" && v.order <= 20 && /Step 0/.test(v.filingStep)),
    (v) => `- ${v.displayNumber}: ${v.findings.map((f) => f.cbpError ?? f.detail).join("; ")} -> ${v.findings.find((f) => f.fix)?.fix ?? ""}`);
  sec("File now, in this order", p.verdicts.filter((v) => v.lane === "FILE_NOW"),
    (v) => `- ${v.order}. ${v.displayNumber} ${fmtUsd(v.money.netRefundCents)}: ${v.filingStep}${v.leadingZeroFix ? " (leading zero: apostrophe in CSV)" : ""}`);
  sec("Broker decision: may net to a bill", p.verdicts.filter((v) => v.lane === "NET_BILL_RISK"),
    (v) => `- ${v.displayNumber}: refundable ${fmtUsd(v.money.ieepaRefundableCents)}, other duty ACE may recalculate as owed ${fmtUsd(v.money.underpaidOtherCents)}, net ${fmtUsd(v.money.netCents)}${v.diversionRisk ? "; IOR has open debt CBP may offset (19 CFR 24.72)" : ""}`);
  sec("Hold: clear the CBP error first", p.verdicts.filter((v) => v.lane === "WAIT" && !/Step 0/.test(v.filingStep)),
    (v) => `- ${v.displayNumber}: ${v.findings.map((f) => f.cbpError ?? f.code).join("; ")}`);
  sec("Do not include", p.verdicts.filter((v) => v.lane === "BLOCKED"),
    (v) => `- ${v.displayNumber}: ${v.findings.map((f) => f.cbpError ?? f.code).join("; ")}`);
  if (p.iors.length) {
    L.push("## IOR debts that may absorb refunds (19 CFR 24.72)");
    p.iors.forEach((i) => L.push(`- ${i.ior}: open debt ${fmtUsd(i.openDebtCents)} vs eligible refund ${fmtUsd(i.eligibleRefundCents)}; expected diversion up to ${fmtUsd(i.expectedDiversionCents)}`));
    L.push("");
  }
  L.push("Interest under 19 U.S.C. 1505 is added by CBP and is not estimated. Upload to ACE is done by the broker or IOR; this tool never asks for ACE credentials, bank details or EIN.", "", DISCLAIMER);
  return L.join("\n");
}
