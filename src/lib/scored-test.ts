import { arms as MODEL_ARMS, ranAt as MODEL_ARMS_RAN_AT } from "../../docs/receipts/model-arms-2026-10-30.json";
import { parseEs003 } from "./parse";
import { validateEntries } from "./validate";
import { scoreArm, type Scored, type Truth } from "./score-metrics";
import type { Lane } from "./types";

/** Runs the deterministic rules engine over a CSV and scores it against the hand-labelled truth. The truth never goes through validate.ts. */
export function scoreRulesEngine(csvText: string, meta: { asOf: string; filerCodes: string[] }, truth: Truth): Scored {
  const { entries } = parseEs003(csvText);
  const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
  const pred = new Map<string, Lane>();
  for (const v of pf.verdicts) pred.set(entries[v.entryIdx].entryNumberRaw, v.lane);
  return scoreArm(truth, pred);
}

/**
 * What the first scored run found, kept so the page stays honest about it. The first run scored the engine 66 of 69 strict (95.7%).
 * The three misses (#62, #64, #67) were one rule mismatch: any positive other-duty underpayment went to NET_BILL_RISK, a lane
 * whose own text says the duties could cost more than the refund. These three entries still net a refund. The labels were not changed.
 */
export const RULE_FIX_HISTORY = {
  commit: "e701c1e",
  before: { correct: 66, total: 69, accuracy: 66 / 69 },
  entries: [62, 64, 67],
} as const;

/** The AI-alone arm cannot run without Token Factory credit. It carries no numbers on purpose. */
/** The model-alone arms, read from the committed receipt written by scripts/model-arms.ts (live Token Factory run). */
export const AI_ALONE_ARM = {
  id: "ai-alone",
  label: "AI alone",
  status: "measured" as const,
  ranAt: MODEL_ARMS_RAN_AT,
  receipt: "docs/receipts/model-arms-2026-10-30.json",
  arms: [MODEL_ARMS.ultra, MODEL_ARMS.lightning].map((a) => ({
    id: a.id, label: a.label, model: a.model, n: a.n,
    laneCorrect: a.lane.strictCorrect, exactDeadlines: a.deadline.exactCorrect, liquidated: a.deadline.liquidatedN, costUsd: a.costUsd,
  })),
};
