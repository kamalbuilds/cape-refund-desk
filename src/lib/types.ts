export type Lane = "FILE_NOW" | "WAIT" | "BLOCKED" | "NET_BILL_RISK";
export type Disposition = "block" | "wait";

export interface Line {
  lineNo: number;
  hts: string;
  country: string;
  ieepaIndicator: boolean;
  ieepaHts: string;
  enteredValueCents: number;
  col1RatePct: number;
  generalDutyCents: number;
  ieepaDutyCents: number;
  s232Cents: number;
  s301Cents: number;
  s201Cents: number;
  ch99GoodsValueCents: number;
  htsValid: boolean;
  htsRelationshipOk: boolean;
  underpaidOtherCents: number;
  frameworkGroup: "" | "EU" | "JP" | "KR" | "CH";
}

export interface Entry {
  /** exact text from the CSV (may contain dashes / apostrophe) */
  entryNumberRaw: string;
  /** block index among entries sharing the same raw text (duplicates) */
  seq: number;
  entryType: string; // two-digit canonical ("01","09","23","47")
  ior: string;
  summaryStatus: string; // Accepted | Cancelled | Rejected | Not Found
  controlStatus: string; // CBP | Trade
  liquidationStatus: string; // Unliquidated | Liquidated | Extended | Suspended | Pending | Not Liquidated
  liquidationDate: string | null; // ISO yyyy-mm-dd (ES-701)
  projectedLiquidationDate: string | null;
  suspensionRecord: boolean;
  injunction: boolean;
  adjustedStatus: boolean;
  statementPending: boolean;
  drawbackClaim: boolean;
  drawbackPlanned: boolean;
  reconFlag: boolean;
  reconEntryFiled: boolean;
  reconDeadline: string | null;
  protestStatus: string; // None | Open | Suspended | Denied | Granted
  afrBox: boolean;
  pscNeededNonIeepa: boolean;
  iorOpenDebtCents: number;
  notes: string;
  lines: Line[];
  /** entry-level raw cell text, as uploaded (fed to Lightning for normalization) */
  raw: Record<string, string>;
  /** parse-time observations (e.g. date reformatted) */
  parseNotes: string[];
}

export interface Finding {
  code: string;
  /** exact CBP error-table string, or null for filing-order guidance that is not an ACE error */
  cbpError: string | null;
  sourceId: string;
  disposition: Disposition;
  detail: string;
  fix?: string;
}

export interface Money {
  grossIeepaCents: number; // IEEPA duty paid on lines, before framework carve-out
  frameworkCarveOutCents: number; // Column 1 portion that stays owed on framework lines
  ieepaRefundableCents: number;
  underpaidOtherCents: number; // 232/301/201 or other duty ACE will recalculate as owed
  netCents: number; // refundable - underpaid (negative = bill)
  billCents: number; // max(0, -net)
  netRefundCents: number; // max(0, net)
  thinMargin: boolean;
  frameworkGroups: string[];
  otherDutyOnEntryCents: number; // 232+301+201 paid
}

export interface Deadlines {
  daysSinceLiquidation: number | null;
  capeCutoffDate: string | null; // liq + 80
  capeDaysLeft: number | null;
  reliquidationLimitDate: string | null; // liq + 90
  protestDeadlineDate: string | null; // liq + 180
  protestDaysLeft: number | null;
  reconDeadlineDaysLeft: number | null;
  projectedLiquidationDaysLeft: number | null;
}

export interface Verdict {
  id: string; // `${key}#${order}`
  entryIdx: number; // index into the parsed entries array
  ior: string;
  key: string; // normalized 11-char entry number (or best effort)
  displayNumber: string;
  csvValue: string; // what goes into the CAPE CSV (apostrophe for leading zero)
  lane: Lane;
  findings: Finding[];
  money: Money;
  deadlines: Deadlines;
  filingStep: string;
  order: number;
  leadingZeroFix: boolean;
  diversionRisk: boolean; // IOR has an open non-IEEPA debt CBP may offset (19 CFR 24.72)
}

/** Rule overrides used by rule-watch re-scoring. Omitted = the rules as CBP publishes them today. */
export interface RuleOverrides {
  /** CAPE Phase 1 liquidation window in days (published: 80). */
  windowDays?: number;
  /** Warehouse entry types 21/22 rejected (CSMS 69127837, effective 2026-07-07). Default true. */
  warehouseBlocked?: boolean;
}
export interface ValidationOptions {
  asOf: string; // ISO date
  filerCodes: string[]; // first 3 chars of entry number must match
  rules?: RuleOverrides;
}
