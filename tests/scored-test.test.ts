import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEs003 } from "../src/lib/parse";
import { LANE_ORDER, scoreArm, type Truth } from "../src/lib/score-metrics";
import { AI_ALONE_ARM, RULE_FIX_HISTORY, scoreRulesEngine } from "../src/lib/scored-test";
import type { Lane } from "../src/lib/types";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const truth = JSON.parse(fs.readFileSync("data/sample-truth.json", "utf8")) as Truth;
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const { entries } = parseEs003(csv);

describe("sample-truth.json", () => {
  const uniqueRaw = [...new Set(entries.map((e) => e.entryNumberRaw))];
  it("labels every one of the 69 sample entries once, in file order", () => {
    expect(truth.entries).toHaveLength(69);
    expect(truth.entries.map((t) => t.entryNumber)).toEqual(uniqueRaw);
    expect(truth.entries.map((t) => t.n)).toEqual(truth.entries.map((_, i) => i + 1));
  });
  it("uses only known lanes, a one-line reason each, and a second lane that differs from the first", () => {
    for (const t of truth.entries) {
      expect(LANE_ORDER).toContain(t.lane);
      expect(t.reason.length).toBeGreaterThan(20);
      expect(t.reason.includes("\n")).toBe(false);
      if (t.alsoDefensible) { expect(LANE_ORDER).toContain(t.alsoDefensible); expect(t.alsoDefensible).not.toBe(t.lane); }
    }
  });
  it("documents how the labels were made", () => {
    expect(truth.method).toMatch(/Hand-labelled/);
    expect(truth.method).toMatch(/did not call, read or copy/);
  });
});

describe("score metrics", () => {
  const mk = (lanes: Lane[]): Truth => ({ asOf: "x", method: "", laneDefinitions: {} as Truth["laneDefinitions"], entries: lanes.map((lane, i) => ({ n: i + 1, entryNumber: `E${i}`, lane, reason: "r" })) });
  it("computes precision, recall, accuracy and the confusion matrix on a small hand-checked case", () => {
    // truth: F F F W B ; engine: F F W W F
    const t = mk(["FILE_NOW", "FILE_NOW", "FILE_NOW", "WAIT", "BLOCKED"]);
    const pred = new Map<string, Lane>([["E0", "FILE_NOW"], ["E1", "FILE_NOW"], ["E2", "WAIT"], ["E3", "WAIT"], ["E4", "FILE_NOW"]]);
    const { strict } = scoreArm(t, pred);
    expect(strict.correct).toBe(3);
    expect(strict.accuracy).toBeCloseTo(0.6);
    expect(strict.perLane.FILE_NOW).toMatchObject({ tp: 2, fp: 1, fn: 1 });
    expect(strict.perLane.FILE_NOW.precision).toBeCloseTo(2 / 3);
    expect(strict.perLane.FILE_NOW.recall).toBeCloseTo(2 / 3);
    expect(strict.perLane.WAIT.precision).toBeCloseTo(0.5);
    expect(strict.perLane.WAIT.recall).toBe(1);
    expect(strict.perLane.BLOCKED.recall).toBe(0);
    expect(strict.perLane.BLOCKED.precision).toBeNull();
    expect(strict.perLane.NET_BILL_RISK.precision).toBeNull();
    expect(strict.matrix.FILE_NOW.WAIT).toBe(1);
    expect(strict.matrix.BLOCKED.FILE_NOW).toBe(1);
    expect(strict.mismatches.map((m) => m.entryNumber)).toEqual(["E2", "E4"]);
  });
  it("lenient scoring only forgives the named second lane", () => {
    const t = mk(["FILE_NOW", "FILE_NOW"]);
    t.entries[0].alsoDefensible = "NET_BILL_RISK";
    const pred = new Map<string, Lane>([["E0", "NET_BILL_RISK"], ["E1", "NET_BILL_RISK"]]);
    const r = scoreArm(t, pred);
    expect(r.strict.correct).toBe(0);
    expect(r.lenient.correct).toBe(1);
    expect(r.strict.mismatches[0].defensible).toBe(true);
    expect(r.strict.mismatches[1].defensible).toBe(false);
  });
});

describe("scored test on the sample (computed live from the engine, nothing hardcoded)", () => {
  const { strict, lenient } = scoreRulesEngine(csv, meta, truth);
  it("scores all 69 entries and the matrix sums to 69", () => {
    expect(strict.total).toBe(69);
    const sum = LANE_ORDER.reduce((a, t) => a + LANE_ORDER.reduce((b, p) => b + strict.matrix[t][p], 0), 0);
    expect(sum).toBe(69);
    expect(strict.correct + strict.mismatches.length).toBe(69);
  });
  it("support per lane equals the number of hand labels for that lane", () => {
    for (const l of LANE_ORDER) expect(strict.perLane[l].support).toBe(truth.entries.filter((t) => t.lane === l).length);
  });
  it("stays at or above a floor, so a rules regression fails the build", () => {
    expect(strict.accuracy).toBeGreaterThanOrEqual(0.9);
    expect(lenient.accuracy).toBeGreaterThanOrEqual(strict.accuracy);
  });
  it("every disagreement is listed with entry, both lanes and the reason", () => {
    for (const m of strict.mismatches) { expect(m.entryNumber).toBeTruthy(); expect(m.truth).not.toBe(m.predicted); expect(m.reason.length).toBeGreaterThan(20); }
  });
});

describe("AI-alone arm", () => {
  it("reports the measured model arms from the committed receipt", () => {
    expect(AI_ALONE_ARM.status).toBe("measured");
    expect(AI_ALONE_ARM.arms.map((a) => a.id)).toEqual(["ultra", "lightning"]);
    const receipt = JSON.parse(fs.readFileSync(new URL("../docs/receipts/model-arms-2026-10-30.json", import.meta.url), "utf8"));
    for (const a of AI_ALONE_ARM.arms) {
      expect(a.laneCorrect).toBe(receipt.arms[a.id].lane.strictCorrect);
      expect(a.exactDeadlines).toBe(receipt.arms[a.id].deadline.exactCorrect);
      expect(a.costUsd).toBe(receipt.arms[a.id].costUsd);
    }
    expect(JSON.stringify(AI_ALONE_ARM)).not.toMatch(/[Pp]ending/);
  });
});

describe("history of the rule fix", () => {
  const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
  const truth = JSON.parse(fs.readFileSync("data/sample-truth.json", "utf8")) as Truth;
  const { strict, lenient } = scoreRulesEngine(fs.readFileSync("data/sample-es003.csv", "utf8"), meta, truth);
  it("records the before score and the fix commit, and the engine now agrees with every unchanged label", () => {
    expect(RULE_FIX_HISTORY.before).toMatchObject({ correct: 66, total: 69 });
    expect(RULE_FIX_HISTORY.commit).toMatch(/^[0-9a-f]{7}$/);
    expect(strict.correct).toBe(69);
    expect(lenient.correct).toBe(69);
    expect(truth.entries.filter((e) => (RULE_FIX_HISTORY.entries as readonly number[]).includes(e.n)).map((e) => e.lane)).toEqual(["FILE_NOW", "FILE_NOW", "FILE_NOW"]);
  });
});
