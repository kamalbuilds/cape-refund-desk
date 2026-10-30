import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEs003 } from "../src/lib/parse";
import { otherDutyNote, plainVerdict } from "../src/lib/plain";
import { applyFreshLanes } from "../src/lib/sample-relane";
import { validateEntries } from "../src/lib/validate";
import type { RunResult } from "../src/lib/pipeline";
import type { Entry } from "../src/lib/types";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const base = { asOf: meta.asOf as string, filerCodes: meta.filerCodes as string[] };
const { entries } = parseEs003(fs.readFileSync("data/sample-es003.csv", "utf8"));
const pf = validateEntries(entries, base);

// A clean, claimable entry from the sample, re-used with other-duty underpayments set to exact amounts.
const clean = pf.verdicts.find((v) => v.lane === "FILE_NOW" && v.money.underpaidOtherCents === 0 && v.money.ieepaRefundableCents > 0)!;
function withUnderpaid(cents: number) {
  const e: Entry = structuredClone(entries[clean.entryIdx]);
  e.lines.forEach((l) => { l.underpaidOtherCents = 0; });
  e.lines[0].underpaidOtherCents = cents;
  return validateEntries([e], base).verdicts[0];
}
const R = clean.money.ieepaRefundableCents;

describe("NET_BILL_RISK is only for entries where other duties wipe out or exceed the refund (net <= 0)", () => {
  it("a small underpayment still nets a refund: stays FILE_NOW and carries the note", () => {
    const v = withUnderpaid(Math.floor(R / 4));
    expect(v.money.netCents).toBeGreaterThan(0);
    expect(v.lane).toBe("FILE_NOW");
    expect(otherDutyNote(v)).toBe(`Customs may also bill $${(Math.floor(R / 4) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} of other duties, which comes off this refund.`);
    expect(plainVerdict(v)).toContain("comes off this refund");
  });
  it("an underpayment one cent short of the refund still nets +$0.01: FILE_NOW", () => {
    const v = withUnderpaid(R - 1);
    expect(v.money.netCents).toBe(1);
    expect(v.lane).toBe("FILE_NOW");
  });
  it("an underpayment equal to the refund wipes it out (net 0): your broker decides", () => {
    const v = withUnderpaid(R);
    expect(v.money.netCents).toBe(0);
    expect(v.lane).toBe("NET_BILL_RISK");
    expect(otherDutyNote(v)).toBeNull();
    expect(plainVerdict(v)).toMatch(/cancels the whole refund/);
  });
  it("an underpayment above the refund is a bill: your broker decides", () => {
    const v = withUnderpaid(R + 5000);
    expect(v.money.netCents).toBe(-5000);
    expect(v.lane).toBe("NET_BILL_RISK");
  });
  it("no underpayment means no note and no change", () => {
    expect(otherDutyNote(clean)).toBeNull();
    expect(clean.lane).toBe("FILE_NOW");
  });
  it("on the sample, every NET_BILL_RISK entry nets <= 0 and every FILE_NOW entry with an underpayment nets a refund", () => {
    for (const v of pf.verdicts) {
      if (v.lane === "NET_BILL_RISK") expect(v.money.netCents).toBeLessThanOrEqual(0);
      if (v.lane === "FILE_NOW" && v.money.underpaidOtherCents > 0) { expect(v.money.netCents).toBeGreaterThan(0); expect(otherDutyNote(v)).not.toBeNull(); }
    }
  });
});

describe("current recording needs no re-laning; an older recording gets today's lanes at serve time", () => {
  it("data/sample-run.json was recorded with today's engine: re-laning changes nothing", () => {
    const cur = JSON.parse(fs.readFileSync("data/sample-run.json", "utf8")) as RunResult;
    const served = applyFreshLanes(structuredClone(cur), pf);
    expect(served.portfolio.verdicts.map((v) => [v.id, v.lane])).toEqual(cur.portfolio.verdicts.map((v) => [v.id, v.lane]));
    expect(Object.keys(served.explanations).length).toBe(Object.keys(cur.explanations).length);
  });
});

// tests/fixtures/sample-run.2026-10-29.json is the earlier real Token Factory recording (before the NET_BILL_RISK rule fix). It is kept only to
// prove that serve-time re-laning still handles a recording made under an older engine. It is not the submission evidence.
describe("an older recording (fixture) gets today's lanes at serve time", () => {
  const run = JSON.parse(fs.readFileSync("tests/fixtures/sample-run.2026-10-29.json", "utf8")) as RunResult;
  const before = structuredClone(run);
  const served = applyFreshLanes(structuredClone(run), pf);
  it("changes only lane and filing step of re-laned entries; ids, money, order and AI text stay as recorded", () => {
    const changed = served.portfolio.verdicts.filter((v, i) => v.lane !== before.portfolio.verdicts[i].lane);
    expect(changed.length).toBe(3);
    for (const v of changed) { expect(before.portfolio.verdicts.find((b) => b.id === v.id)!.lane).toBe("NET_BILL_RISK"); expect(v.lane).toBe("FILE_NOW"); expect(v.filingStep).toMatch(/^Step \d/); }
    expect(served.portfolio.verdicts.map((v) => [v.id, v.order, v.money])).toEqual(before.portfolio.verdicts.map((v) => [v.id, v.order, v.money]));
    // AI text of unmoved entries is untouched; the three moved entries lose their recorded text (it names the old group).
    const movedIds = new Set(changed.map((v) => v.id));
    expect(Object.keys(before.explanations).length - Object.keys(served.explanations).length).toBe([...movedIds].filter((id) => before.explanations[id]).length);
    for (const [id, e] of Object.entries(before.explanations)) { if (movedIds.has(id)) expect(served.explanations[id]).toBeUndefined(); else expect(served.explanations[id]).toEqual(e); }
    // no served AI text claims a lane the entry is not in
    for (const v of served.portfolio.verdicts) { const e = served.explanations[v.id]; if (e && /NET_BILL_RISK lane/.test(JSON.stringify(e))) expect(v.lane).toBe("NET_BILL_RISK"); }
  });
  it("group totals add up to the served verdicts", () => {
    const sum = (l: string) => served.portfolio.verdicts.filter((v) => v.lane === l).reduce((a, v) => a + v.money.netRefundCents, 0);
    for (const l of ["FILE_NOW", "WAIT", "NET_BILL_RISK", "BLOCKED"] as const) {
      expect(served.portfolio.lanes[l].count).toBe(served.portfolio.verdicts.filter((v) => v.lane === l).length);
      expect(served.portfolio.lanes[l].refundCents).toBe(sum(l));
    }
  });
});
