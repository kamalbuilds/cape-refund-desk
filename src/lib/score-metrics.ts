import type { Lane } from "./types";

export const LANE_ORDER: Lane[] = ["FILE_NOW", "WAIT", "NET_BILL_RISK", "BLOCKED"];

export interface TruthEntry { n: number; entryNumber: string; lane: Lane; reason: string; alsoDefensible?: Lane }
export interface Truth { asOf: string; method: string; laneDefinitions: Record<Lane, string>; entries: TruthEntry[] }
export interface LaneScore { tp: number; fp: number; fn: number; support: number; predicted: number; precision: number | null; recall: number | null; f1: number | null }
export interface Mismatch { n: number; entryNumber: string; truth: Lane; predicted: Lane; reason: string; alsoDefensible?: Lane; defensible: boolean }
export interface ScoreResult {
  total: number;
  correct: number;
  accuracy: number;
  perLane: Record<Lane, LaneScore>;
  macroPrecision: number;
  macroRecall: number;
  /** matrix[truth][predicted] */
  matrix: Record<Lane, Record<Lane, number>>;
  mismatches: Mismatch[];
}
export interface Scored { strict: ScoreResult; lenient: ScoreResult }

const div = (a: number, b: number) => (b === 0 ? null : a / b);

function score(truthLane: (t: TruthEntry) => Lane, truth: TruthEntry[], pred: Map<string, Lane>): ScoreResult {
  const matrix = {} as ScoreResult["matrix"];
  for (const t of LANE_ORDER) { matrix[t] = {} as Record<Lane, number>; for (const p of LANE_ORDER) matrix[t][p] = 0; }
  const mismatches: Mismatch[] = [];
  for (const t of truth) {
    const p = pred.get(t.entryNumber);
    if (!p) throw new Error(`no engine verdict for entry ${t.entryNumber}`);
    const tl = truthLane(t);
    matrix[tl][p]++;
    if (tl !== p) mismatches.push({ n: t.n, entryNumber: t.entryNumber, truth: tl, predicted: p, reason: t.reason, alsoDefensible: t.alsoDefensible, defensible: t.alsoDefensible === p });
  }
  const perLane = {} as Record<Lane, LaneScore>;
  let correct = 0;
  for (const l of LANE_ORDER) {
    const tp = matrix[l][l];
    const predicted = LANE_ORDER.reduce((a, t) => a + matrix[t][l], 0);
    const support = LANE_ORDER.reduce((a, p) => a + matrix[l][p], 0);
    const precision = div(tp, predicted), recall = div(tp, support);
    const f1 = precision !== null && recall !== null && precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : null;
    perLane[l] = { tp, fp: predicted - tp, fn: support - tp, support, predicted, precision, recall, f1 };
    correct += tp;
  }
  const avg = (k: "precision" | "recall") => { const v = LANE_ORDER.map((l) => perLane[l][k]).filter((x): x is number => x !== null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0; };
  return { total: truth.length, correct, accuracy: truth.length ? correct / truth.length : 0, perLane, macroPrecision: avg("precision"), macroRecall: avg("recall"), matrix, mismatches };
}

/** pred: entry number as written in the CSV -> lane the arm assigned. Strict uses the primary label; lenient also accepts `alsoDefensible`. */
export function scoreArm(truth: Truth, pred: Map<string, Lane>): Scored {
  const strict = score((t) => t.lane, truth.entries, pred);
  const lenient = score((t) => (t.alsoDefensible && pred.get(t.entryNumber) === t.alsoDefensible ? t.alsoDefensible : t.lane), truth.entries, pred);
  return { strict, lenient };
}

export const pct = (x: number | null, d = 1) => (x === null ? "n/a" : `${(x * 100).toFixed(d)}%`);
