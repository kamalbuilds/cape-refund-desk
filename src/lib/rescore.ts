import type { Entry, Lane, RuleOverrides, Verdict } from "./types";
import { validateEntries, type Portfolio } from "./validate";

/**
 * Rule-watch re-scoring: run the SAME deterministic engine twice on the SAME entries, once under the rules
 * before an event and once after, and report every entry that changed lane. No model is involved, so the diff is exact.
 * "real" scenarios replay a change CBP actually published (found by the rule-watch diff). "whatif" scenarios are labelled
 * simulations of a change CBP could make; they are never presented as CBP guidance.
 */
export interface Scenario {
  id: string;
  kind: "real" | "whatif";
  title: string;
  summary: string;
  sourceId?: string;
  /** Rules before the event / after the event. */
  from: RuleOverrides;
  to: RuleOverrides;
}

export const SCENARIOS: Scenario[] = [
  {
    id: "csms-69127837",
    kind: "real",
    title: "Real CBP change: warehouse entries (types 21/22) rejected",
    summary: "CSMS 69127837 (2 Jul 2026) says CAPE rejects warehouse entry types 21 and 22 from 7 Jul 2026. Replays the board as it was scored before that message, then after it.",
    sourceId: "CSMS-69127837",
    from: { warehouseBlocked: false },
    to: { warehouseBlocked: true },
  },
  {
    id: "window-60",
    kind: "whatif",
    title: "What-if (simulation): CBP shortens the liquidation window to 60 days",
    summary: "Not a CBP announcement. Shows how fast entries fall out of Phase 1 if the 80-day window (CBP FAQ) were tightened to 60 days.",
    sourceId: "FAQ",
    from: {},
    to: { windowDays: 60 },
  },
  {
    id: "window-90",
    kind: "whatif",
    title: "What-if (simulation): CBP widens the liquidation window to 90 days",
    summary: "Not a CBP announcement. Shows which finalized shipments would come back into Phase 1 if the 80-day window were widened to 90 days.",
    sourceId: "FAQ",
    from: {},
    to: { windowDays: 90 },
  },
];

export interface Move {
  entryIdx: number;
  displayNumber: string;
  from: Lane;
  to: Lane;
  /** Safe-to-claim refund gained (+) or lost (-) by this entry. */
  safeRefundDeltaCents: number;
  why: string;
}
export interface LaneDelta { beforeCount: number; afterCount: number; beforeRefundCents: number; afterRefundCents: number }
export interface RescoreResult {
  scenario: Scenario;
  before: Portfolio;
  after: Portfolio;
  moves: Move[];
  lanes: Record<Lane, LaneDelta>;
  safeRefundDeltaCents: number;
}

const LANES: Lane[] = ["FILE_NOW", "WAIT", "NET_BILL_RISK", "BLOCKED"];
const safeCents = (v: Verdict | undefined) => (v && v.lane === "FILE_NOW" ? v.money.netRefundCents : 0);

export function rescore(entries: Entry[], base: { asOf: string; filerCodes: string[] }, scenario: Scenario): RescoreResult {
  const before = validateEntries(entries, { ...base, rules: scenario.from });
  const after = validateEntries(entries, { ...base, rules: scenario.to });
  const b = new Map(before.verdicts.map((v) => [v.entryIdx, v]));
  const moves: Move[] = [];
  for (const a of after.verdicts) {
    const o = b.get(a.entryIdx);
    if (!o || o.lane === a.lane) continue;
    const newCodes = a.findings.filter((f) => !o.findings.some((x) => x.code === f.code));
    const gone = o.findings.filter((f) => !a.findings.some((x) => x.code === f.code));
    const why = newCodes[0]?.cbpError ?? newCodes[0]?.detail ?? (gone[0] ? `Cleared: ${gone[0].cbpError ?? gone[0].code}` : "Deadline arithmetic changed");
    moves.push({ entryIdx: a.entryIdx, displayNumber: a.displayNumber, from: o.lane, to: a.lane, safeRefundDeltaCents: safeCents(a) - safeCents(o), why });
  }
  moves.sort((x, y) => Math.abs(y.safeRefundDeltaCents) - Math.abs(x.safeRefundDeltaCents) || x.displayNumber.localeCompare(y.displayNumber));
  const lanes = Object.fromEntries(LANES.map((l) => [l, {
    beforeCount: before.lanes[l].count, afterCount: after.lanes[l].count,
    beforeRefundCents: before.lanes[l].refundCents, afterRefundCents: after.lanes[l].refundCents,
  }])) as Record<Lane, LaneDelta>;
  return { scenario, before, after, moves, lanes, safeRefundDeltaCents: after.lanes.FILE_NOW.refundCents - before.lanes.FILE_NOW.refundCents };
}
