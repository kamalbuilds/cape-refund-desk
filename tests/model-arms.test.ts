import fs from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { addDays } from "../src/lib/dates";
import { parseEs003 } from "../src/lib/parse";
import { LANE_ORDER, pct, type Truth } from "../src/lib/score-metrics";
import { validateEntries } from "../src/lib/validate";
import { PROMPTS, USER_PREFIX, promptSha256 } from "../scripts/model-arms-prompt";

const RECEIPT = "docs/receipts/model-arms-2026-10-30.json";
const r = JSON.parse(fs.readFileSync(RECEIPT, "utf8"));
const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const truth = JSON.parse(fs.readFileSync("data/sample-truth.json", "utf8")) as Truth;
const { entries } = parseEs003(fs.readFileSync("data/sample-es003.csv", "utf8"));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("model-arms receipt", () => {
  it("covers all 69 labelled entries, in file order, for all three arms", () => {
    expect(r.perEntry).toHaveLength(69);
    expect(r.perEntry.map((e: { entryNumber: string }) => e.entryNumber)).toEqual(truth.entries.map((t) => t.entryNumber));
    for (const id of ["rules", "ultra", "lightning"]) expect(r.arms[id].n).toBe(69);
    expect(r.arms.rules.deadline.liquidatedN).toBeGreaterThan(0); // a deadline score over zero entries would assert nothing
  });
  it("derives every headline number again from the per-entry answers and the answer key", () => {
    const liq = entries.filter((e) => e.liquidationDate);
    expect(r.deadlineKey.liquidatedEntries).toBe(liq.length);
    for (const id of ["rules", "ultra", "lightning"] as const) {
      let strict = 0, exact = 0, unparsed = 0;
      r.perEntry.forEach((e: Record<string, { lane: string | null; daysLeft: number | null }> & { keyDaysLeft: number | null }, i: number) => {
        const key = entries[i].liquidationDate ? 80 - (Date.parse(meta.asOf) - Date.parse(entries[i].liquidationDate!)) / 86400000 : null;
        expect(e.keyDaysLeft).toBe(key);
        if (e[id].lane === null) unparsed++;
        if (e[id].lane === truth.entries[i].lane) strict++;
        if (key !== null && e[id].daysLeft === key) exact++;
      });
      expect(r.arms[id].lane.strictCorrect).toBe(strict);
      expect(r.arms[id].lane.unparsed).toBe(unparsed);
      expect(r.arms[id].deadline.exactCorrect).toBe(exact);
      for (const e of r.perEntry) if (e[id].lane !== null) expect(LANE_ORDER).toContain(e[id].lane);
    }
  });
  it("keeps the rules-engine arm equal to the engine as it is now, so a rules change forces a refresh", () => {
    const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
    for (const v of pf.verdicts) {
      const e = r.perEntry[v.entryIdx];
      expect(e.rules).toEqual({ lane: v.lane, daysLeft: v.deadlines.capeDaysLeft });
    }
    expect(addDays("2026-10-29", 0)).toBe(meta.asOf);
  });
  it("records a real completion id, model and tokens for every model call, and a cost inside the budget", () => {
    for (const arm of ["ultra", "lightning"] as const) {
      expect(r.perCall[arm]).toHaveLength(69);
      for (const c of r.perCall[arm]) {
        expect(c.completionId).toMatch(/^chatcmpl-/);
        expect(c.model).toBe(r.modelsRequested[arm]);
        expect(c.promptTokens).toBeGreaterThan(0);
        expect(c.completionTokens).toBeGreaterThan(0);
        expect(c.error).toBeUndefined();
      }
      expect(r.perCall[arm].reduce((a: number, c: { costUsd: number }) => a + c.costUsd, 0)).toBeCloseTo(r.arms[arm].costUsd, 4);
    }
    expect(r.arms.ultra.costUsd + r.arms.lightning.costUsd).toBeCloseTo(r.totals.costUsd, 4);
    expect(r.totals.costUsd).toBeLessThan(1.5);
    expect(r.provider).toBe("nebius-token-factory");
  });
  it("was produced by the prompts committed in scripts/model-arms-prompt.ts", () => {
    for (const arm of ["ultra", "lightning"] as const) {
      expect(r.prompts[arm].sha256).toBe(promptSha256(PROMPTS[arm]));
      expect(r.prompts[arm].system).toBe(PROMPTS[arm].system);
      expect(r.prompts[arm].userPrefix).toBe(USER_PREFIX);
      expect(r.arms[arm].promptSha256).toBe(r.prompts[arm].sha256);
    }
    expect(PROMPTS.ultra.system).not.toMatch(/sample-truth|"lane": "FILE_NOW", "reason"/); // the answer key never goes into a prompt
  });
});

describe("Engine vs model alone panel", () => {
  afterEach(() => { vi.doUnmock("../docs/receipts/model-arms-2026-10-30.json"); vi.resetModules(); });
  it("renders all three arms from the receipt: accuracy, exact deadlines, n and cost", async () => {
    const { ModelArms } = await import("../src/components/ScoredTest");
    const t = text(renderToStaticMarkup(createElement(ModelArms)));
    for (const id of ["rules", "ultra", "lightning"] as const) {
      const a = r.arms[id];
      expect(t).toContain(a.label);
      expect(t).toContain(`${pct(a.lane.strictAccuracy)} (${a.lane.strictCorrect} of ${a.n})`);
      expect(t).toContain(`${pct(a.deadline.exactRate)} (${a.deadline.exactCorrect} of ${a.deadline.liquidatedN})`);
      expect(t).toContain(`$${a.costUsd.toFixed(3)}`);
    }
    expect(t).toContain("Code decides, the model explains");
    expect(t).not.toMatch(/\u2014| -- /);
  });
  it("fails if the panel stops reading the receipt: swapping the file's numbers changes what it shows", async () => {
    const fake = JSON.parse(JSON.stringify(r));
    fake.arms.ultra.lane = { ...fake.arms.ultra.lane, strictCorrect: 11, strictAccuracy: 11 / 69 };
    fake.arms.lightning.costUsd = 0.777;
    vi.resetModules();
    vi.doMock("../docs/receipts/model-arms-2026-10-30.json", () => ({ ...fake, default: fake }));
    const { ModelArms } = await import("../src/components/ScoredTest");
    const t = text(renderToStaticMarkup(createElement(ModelArms)));
    expect(t).toContain("15.9% (11 of 69)");
    expect(t).toContain("$0.777");
  });
});
