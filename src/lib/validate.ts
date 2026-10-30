import type { Deadlines, Entry, Finding, Lane, ValidationOptions, Verdict } from "./types";
import { ENTRY_ERRORS, FILE_ERRORS, LIMITS } from "./cbp-rules";
import { addDays, diffDays } from "./dates";
import { computeMoney } from "./money";
import { normalizeEntryNumber } from "./parse";
import { customsFor } from "./customs-checks";

export interface IorSummary {
  ior: string;
  openDebtCents: number;
  eligibleRefundCents: number;
  expectedDiversionCents: number;
}
export interface LaneTotals { count: number; grossCents: number; refundCents: number; billCents: number }
export interface Portfolio {
  verdicts: Verdict[];
  lanes: Record<Lane, LaneTotals>;
  iors: IorSummary[];
  declarations: { index: number; entries: number }[];
}

function find(code: string, cbpError: string | null, sourceId: string, disposition: Finding["disposition"], detail: string, fix?: string): Finding {
  return { code, cbpError, sourceId, disposition, detail, fix };
}

export function computeDeadlines(entry: Entry, asOf: string, windowDays: number = LIMITS.liquidationWindowDays): Deadlines {
  const d: Deadlines = {
    daysSinceLiquidation: null, capeCutoffDate: null, capeDaysLeft: null, reliquidationLimitDate: null,
    protestDeadlineDate: null, protestDaysLeft: null, reconDeadlineDaysLeft: null, projectedLiquidationDaysLeft: null,
  };
  if (entry.liquidationDate) {
    d.daysSinceLiquidation = diffDays(asOf, entry.liquidationDate);
    d.capeCutoffDate = addDays(entry.liquidationDate, windowDays);
    d.capeDaysLeft = windowDays - d.daysSinceLiquidation;
    d.reliquidationLimitDate = addDays(entry.liquidationDate, LIMITS.reliquidationLimitDays);
    d.protestDeadlineDate = addDays(entry.liquidationDate, LIMITS.protestDays);
    d.protestDaysLeft = LIMITS.protestDays - d.daysSinceLiquidation;
  }
  if (entry.reconDeadline) d.reconDeadlineDaysLeft = diffDays(entry.reconDeadline, asOf);
  if (entry.projectedLiquidationDate) d.projectedLiquidationDaysLeft = diffDays(entry.projectedLiquidationDate, asOf);
  return d;
}

/** Entry-level + file-level rules for one entry. Dispositions: block = no Phase 1 path; wait = fix/sequence first. */
export function findingsFor(entry: Entry, key: string, opts: ValidationOptions, isDuplicate: boolean, deadlines: Deadlines): Finding[] {
  const f: Finding[] = [];
  // ---- File Validation Errors (QRG Topic 2/3, FAQ) ----
  if (key.length !== 11) {
    f.push(find("NOT_11", FILE_ERRORS.NOT_11, "QRG", "block",
      `"${entry.entryNumberRaw}" is ${key.length} characters after dashes/special characters are stripped; ACE needs exactly 11 alphanumeric.`,
      "Correct the entry number at the source (filer code + 7 digits + check digit)."));
  } else if (opts.filerCodes.length && !opts.filerCodes.includes(key.slice(0, 3))) {
    f.push(find("FILER_CODE", FILE_ERRORS.FILER_CODE, "QRG", "block",
      `Prefix ${key.slice(0, 3)} is not one of the filer codes for this ACE account (${opts.filerCodes.join(", ")}).`,
      "Only the IOR or the broker that filed the entry can declare it. Upload from the account whose filer code matches."));
  }
  if (isDuplicate) {
    f.push(find("DUPLICATE", FILE_ERRORS.DUPLICATE, "QRG", "block",
      `${key} appears more than once in this file (ACE strips dashes before comparing).`,
      "Keep one copy. Each entry can sit on only one accepted declaration."));
  }
  // ---- Entry Validation Errors (FAQ table, in CBP's order) ----
  if (entry.summaryStatus === "Not Found") {
    f.push(find("NOT_FOUND", ENTRY_ERRORS.NOT_FOUND, "FAQ", "block", "Entry summary is not in ACE (or is archived).", "Confirm the number against ACE ES-003 before filing."));
  } else if (entry.summaryStatus !== "Accepted") {
    f.push(find("CANCELLED", ENTRY_ERRORS.CANCELLED, "FAQ", "block", `Entry summary status is ${entry.summaryStatus}; it must be "Accepted".`));
  }
  const whOff = opts.rules?.warehouseBlocked === false && (entry.entryType === "21" || entry.entryType === "22");
  if (LIMITS.excludedEntryTypes.includes(entry.entryType as never) && !whOff) {
    const label = { "08": "Duty Deferral (08)", "09": "Reconciliation (09)", "21": "Warehouse (21)", "22": "Warehouse (22)", "23": "TIB (23)", "47": "Drawback (047)" }[entry.entryType] ?? entry.entryType;
    const wh = entry.entryType === "21" || entry.entryType === "22";
    f.push(find("TYPE_NOT_ALLOWED", ENTRY_ERRORS.TYPE_NOT_ALLOWED, wh ? "CSMS-69127837" : "FAQ", "block", `Entry type ${label} is excluded from CAPE.`,
      wh ? "Since 2026-07-07 CBP rejects warehouse entries (types 21/22) with this message. File the warehouse withdrawals (31, 32, 34, 38) instead; refunds are paid when CBP (re)liquidates the warehouse entry." : undefined));
  }
  if (entry.drawbackClaim) {
    f.push(find("DRAWBACK", ENTRY_ERRORS.DRAWBACK, "FAQ", "block", "Entry is already designated on a drawback claim."));
  }
  if (entry.reconFlag && entry.reconEntryFiled) {
    f.push(find("RECON_FILED", ENTRY_ERRORS.RECON_FILED, "FAQ", "block",
      "Flagged for reconciliation and the Type 09 is already on file. CBP: not included until a future phase."));
  }
  if (deadlines.daysSinceLiquidation !== null && deadlines.daysSinceLiquidation > (opts.rules?.windowDays ?? LIMITS.liquidationWindowDays)) {
    f.push(find("FINAL_LIQ", ENTRY_ERRORS.FINAL_LIQ, "FAQ", "block",
      `Liquidated ${deadlines.daysSinceLiquidation} days ago (${entry.liquidationDate}); CAPE Phase 1 accepts entries liquidated within the preceding ${opts.rules?.windowDays ?? LIMITS.liquidationWindowDays} days. Cutoff was ${deadlines.capeCutoffDate}.`,
      `CBP gives no guidance for final-liquidation entries on the CIT question. Protest window under 19 U.S.C. 1514 is 180 days from liquidation (${deadlines.protestDeadlineDate}): ask the broker.`));
  }
  if (entry.controlStatus !== "CBP") {
    f.push(find("TRADE_CONTROL", ENTRY_ERRORS.TRADE_CONTROL, "FAQ", "wait", `Control status is "${entry.controlStatus}"; it must be with CBP.`));
  }
  if (entry.injunction) {
    f.push(find("INJUNCTION", ENTRY_ERRORS.INJUNCTION, "FAQ", "wait", "Entry is flagged for a court injunction."));
  }
  const unliq = ["Pending", "Not Liquidated", "Unliquidated"].includes(entry.liquidationStatus);
  if (entry.suspensionRecord && unliq) {
    f.push(find("SUSPENSION", ENTRY_ERRORS.SUSPENSION, "FAQ", "wait",
      `Liquidation status "${entry.liquidationStatus}" with a Suspension record.`,
      "Hold until the suspension is resolved. (Suspended/extended liquidation status on its own is accepted.)"));
  }
  if (entry.adjustedStatus) {
    f.push(find("UNDER_REVIEW", ENTRY_ERRORS.UNDER_REVIEW, "FAQ", "wait", "Entry summary is in adjusted status."));
  }
  const ps = entry.protestStatus;
  if (ps === "Open" || ps === "Suspended" || (ps === "Denied" && entry.afrBox)) {
    f.push(find("PROTEST", ENTRY_ERRORS.PROTEST, "FAQ", "wait",
      ps === "Denied" ? "Protest is Denied with the AFR box checked." : `Protest is ${ps}.`,
      "CAPE rejects entries on an Open/Suspended protest. Hold; the protest outcome decides the path. Ask the broker."));
  }
  if (entry.statementPending) {
    f.push(find("STATEMENT", ENTRY_ERRORS.STATEMENT, "FAQ", "wait", "On a statement authorized for payment that has not processed yet.", "Re-check after the statement payment posts."));
  }
  const ieepaLines = entry.lines.filter((l) => l.ieepaIndicator && l.ieepaDutyCents > 0);
  if (!ieepaLines.length) {
    f.push(find("NO_IEEPA", ENTRY_ERRORS.NO_IEEPA, "FAQ", "block", "No line carries a dutiable IEEPA chapter 99 provision.", "Nothing to refund under CAPE."));
  }
  if (entry.lines.some((l) => l.ieepaIndicator && l.ch99GoodsValueCents > 0)) {
    f.push(find("VALUE_ON_HTS", ENTRY_ERRORS.VALUE_ON_HTS, "FAQ", "wait", "A chapter 99 IEEPA line reports a goods value above $0.00.", "File a PSC to correct the line, then include the entry."));
  }
  if (entry.lines.some((l) => !l.htsValid)) {
    f.push(find("INVALID_HTS", ENTRY_ERRORS.INVALID_HTS, "FAQ", "wait",
      "A line's action date falls outside the begin/end dates of its HTS code (end-dated and replaced).",
      "CBP guidance (CSMS 69056483): file a PSC replacing the expired HTS, then resubmit on a new CAPE declaration."));
  }
  if (entry.lines.some((l) => !l.htsRelationshipOk)) {
    f.push(find("HTS_RELATIONSHIP", ENTRY_ERRORS.HTS_RELATIONSHIP, "FAQ", "wait",
      "An add/replace/derived HTS code is on the entry without its corresponding HTS code.",
      "CBP guidance (CSMS 69056483): file a PSC to provide the corresponding HTS code(s), then resubmit."));
  }
  // ---- Filing-order guidance (not ACE errors) ----
  if (entry.pscNeededNonIeepa) {
    f.push(find("PSC_FIRST", null, "FAQ", "wait",
      "A non-IEEPA correction (PSC) is pending on this entry.",
      "File the PSC BEFORE the CAPE Declaration: after CAPE is accepted, PSCs and protests are blocked for the entry."));
  }
  if (entry.reconFlag && !entry.reconEntryFiled && deadlines.reconDeadlineDaysLeft !== null && deadlines.reconDeadlineDaysLeft < LIMITS.reconPriorityDays) {
    f.push(find("RECON_FIRST", null, "FAQ", "wait",
      `Reconciliation filing deadline is ${deadlines.reconDeadlineDaysLeft} days away (< ${LIMITS.reconPriorityDays}).`,
      "Your broker decides, two valid paths. (1) File the reconciliation first (CBP's priority guidance); once the Type 09 is filed this entry leaves CAPE Phase 1. (2) Claim now: CBP's CAPE FAQ accepts Recon-flagged entries even when no Type 09 has been filed yet. Pick (2) if the refund matters more than the reconciliation."));
  }
  return f;
}

export function validateEntries(entries: Entry[], opts: ValidationOptions): Portfolio {
  const seen = new Map<string, number>();
  const prelim = entries.map((entry, idx) => {
    const key = normalizeEntryNumber(entry.entryNumberRaw);
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    const deadlines = computeDeadlines(entry, opts.asOf, opts.rules?.windowDays);
    const findings = findingsFor(entry, key, opts, n > 0, deadlines);
    const money = computeMoney(entry);
    let lane: Lane;
    if (findings.some((x) => x.disposition === "block")) lane = "BLOCKED";
    else if (findings.some((x) => x.disposition === "wait")) lane = "WAIT";
    else if (money.netCents < 0 || money.underpaidOtherCents > 0) lane = "NET_BILL_RISK";
    else lane = "FILE_NOW";
    return { entry, idx, key, deadlines, findings, money, lane };
  });

  // ---- steps and ordering ----
  const waveOf = (p: (typeof prelim)[number]): { wave: number; step: string } => {
    const { entry, lane, deadlines, findings } = p;
    if (lane === "BLOCKED") return { wave: 90, step: "Do not include in a declaration" };
    if (lane === "WAIT") {
      if (findings.some((x) => ["PSC_FIRST", "INVALID_HTS", "HTS_RELATIONSHIP", "VALUE_ON_HTS"].includes(x.code))) return { wave: 10, step: "Step 0: PSC first, then re-check" };
      if (findings.some((x) => x.code === "RECON_FIRST")) return { wave: 11, step: "Step 0: Recon first (deadline < 30 days)" };
      return { wave: 60, step: "Hold: clear the CBP error, then re-check" };
    }
    if (lane === "NET_BILL_RISK") return { wave: 50, step: "Broker decision: may net to a bill; cannot be undone" };
    if (entry.liquidationDate && deadlines.capeDaysLeft !== null) return { wave: 20, step: `Step 1: file now, CAPE window closes in ${deadlines.capeDaysLeft} days` };
    if (entry.reconFlag) return { wave: 30, step: "Step 2: file now, before the Type 09 is filed" };
    if (entry.drawbackPlanned) return { wave: 31, step: "Step 3: file now, before the drawback claim" };
    return { wave: 40, step: "Step 4: file now (unliquidated)" };
  };
  const waved = prelim.map((p) => ({ p, ...waveOf(p) }));
  waved.sort((a, b) =>
    a.wave - b.wave ||
    (a.p.deadlines.capeDaysLeft ?? 9999) - (b.p.deadlines.capeDaysLeft ?? 9999) ||
    b.p.money.ieepaRefundableCents - a.p.money.ieepaRefundableCents);

  const iorDebt = new Map<string, number>();
  for (const p of prelim) iorDebt.set(p.entry.ior, Math.max(iorDebt.get(p.entry.ior) ?? 0, p.entry.iorOpenDebtCents));

  const verdicts: Verdict[] = waved.map((w, i) => {
    const { p } = w;
    const leadingZero = p.key.startsWith("0");
    return {
      id: `${p.key}#${i + 1}`,
      entryIdx: p.idx,
      ior: p.entry.ior,
      key: p.key,
      displayNumber: p.key.length === 11 ? `${p.key.slice(0, 3)}-${p.key.slice(3, 10)}-${p.key.slice(10)}` : p.entry.entryNumberRaw,
      csvValue: leadingZero ? `'${p.key}` : p.key,
      lane: p.lane,
      findings: p.findings,
      money: p.money,
      deadlines: p.deadlines,
      filingStep: w.step,
      order: i + 1,
      leadingZeroFix: leadingZero,
      diversionRisk: (iorDebt.get(p.entry.ior) ?? 0) > 0,
      customs: customsFor(p.entry, p.deadlines, { windowDays: opts.rules?.windowDays, warehouseBlocked: opts.rules?.warehouseBlocked }),
    };
  });

  const lanes: Portfolio["lanes"] = {
    FILE_NOW: z(), WAIT: z(), BLOCKED: z(), NET_BILL_RISK: z(),
  };
  for (const v of verdicts) {
    const l = lanes[v.lane];
    l.count++; l.grossCents += v.money.ieepaRefundableCents; l.refundCents += v.money.netRefundCents; l.billCents += v.money.billCents;
  }
  const byIor = new Map<string, number>();
  for (const v of verdicts) {
    if (v.lane !== "FILE_NOW" && v.lane !== "NET_BILL_RISK") continue;
    byIor.set(v.ior, (byIor.get(v.ior) ?? 0) + v.money.netRefundCents);
  }
  const iors: IorSummary[] = [...new Set(entries.map((e) => e.ior))].map((ior) => {
    const debt = iorDebt.get(ior) ?? 0;
    const refund = byIor.get(ior) ?? 0;
    return { ior, openDebtCents: debt, eligibleRefundCents: refund, expectedDiversionCents: Math.min(debt, refund) };
  }).filter((x) => x.openDebtCents > 0);

  const fileable = lanes.FILE_NOW.count;
  const declarations = [];
  for (let i = 0, n = 0; i < fileable; i += LIMITS.maxEntriesPerDeclaration) declarations.push({ index: ++n, entries: Math.min(LIMITS.maxEntriesPerDeclaration, fileable - i) });
  return { verdicts, lanes, iors, declarations };
}
function z() { return { count: 0, grossCents: 0, refundCents: 0, billCents: 0 }; }
