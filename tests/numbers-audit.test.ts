import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseEs003 } from "../src/lib/parse";
import { fmtUsd } from "../src/lib/money";
import { defaultInclude } from "../src/lib/export";
import { applyFreshLanes } from "../src/lib/sample-relane";
import { HERO_TWIST, SAMPLE_STATS } from "../src/lib/sample-stats";
import { validateEntries } from "../src/lib/validate";
import type { RunResult } from "../src/lib/pipeline";

/**
 * Every place that states a number about the sample (hero card, docs, voiceover script) must match what the engine computes for
 * the board as served. When the engine or the sample changes, this fails until the copy is updated.
 */
const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const { entries } = parseEs003(fs.readFileSync("data/sample-es003.csv", "utf8"));
const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
const run = JSON.parse(fs.readFileSync("data/sample-run.json", "utf8")) as RunResult;
const served = applyFreshLanes(structuredClone(run), pf);
const L = served.portfolio.lanes;
const doc = (p: string) => fs.readFileSync(p, "utf8");
const DEVPOST = doc("docs/DEVPOST.md"), POSITIONING = doc("docs/CAPE-positioning.md"), README = doc("README.md");
const VIDEO = JSON.parse(doc("scripts/video/script.json")) as unknown;
const videoText = JSON.stringify(VIDEO);

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy"];
const words = (n: number) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : ""));
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const laneCounts = [L.FILE_NOW.count, L.WAIT.count, L.NET_BILL_RISK.count, L.BLOCKED.count];
const slashes = laneCounts.join(" / ");
const attention = served.portfolio.verdicts.filter((v) => v.lane !== "FILE_NOW").length;

describe("hero card figures come from the engine", () => {
  const hero = pf.verdicts.find((v) => v.displayNumber === HERO_TWIST.entryNumber);
  it("the hero's example shipment exists in the sample and is a real broker-decision entry", () => {
    expect(hero).toBeDefined();
    expect(hero!.lane).toBe("NET_BILL_RISK");
    expect(served.portfolio.verdicts.find((v) => v.entryIdx === hero!.entryIdx)!.lane).toBe("NET_BILL_RISK");
  });
  it("its refundable, underpaid and net figures equal the engine's money for that entry", () => {
    const m = hero!.money;
    expect(HERO_TWIST.refundCents).toBe(m.ieepaRefundableCents);
    expect(HERO_TWIST.underpaidCents).toBe(m.underpaidOtherCents);
    expect(HERO_TWIST.refundCents - HERO_TWIST.underpaidCents).toBe(m.netCents);
    expect(m.netCents).toBeLessThan(0);
    expect(m.billCents).toBe(-m.netCents);
  });
  it("the hero card renders those same figures (no second hard-coded copy in the component)", () => {
    const src = doc("src/components/motion.tsx").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).toContain("HERO_TWIST.refundCents");
    expect(src).toContain("HERO_TWIST.entryNumber");
    expect(src).not.toMatch(/\b1050000\b|\b1312500\b|A7K-7344990-0/);
  });
});

describe("board totals the app shows", () => {
  it("lane counts, safe total, headline count and export default all agree with the served board", () => {
    expect(laneCounts).toEqual([SAMPLE_STATS.safeCount, SAMPLE_STATS.holdCount, SAMPLE_STATS.billRiskCount, SAMPLE_STATS.blockedCount]);
    expect(laneCounts.reduce((a, b) => a + b, 0)).toBe(SAMPLE_STATS.entries);
    expect(attention).toBe(SAMPLE_STATS.entries - SAMPLE_STATS.safeCount);
    const inc = defaultInclude(served.portfolio as Parameters<typeof defaultInclude>[0]);
    expect(inc.size).toBe(L.FILE_NOW.count);
    const incRefund = served.portfolio.verdicts.filter((v) => inc.has(v.id)).reduce((a, v) => a + v.money.netRefundCents, 0);
    expect(incRefund).toBe(L.FILE_NOW.refundCents);
    expect(incRefund).toBe(SAMPLE_STATS.safeRefundCents);
    expect(L.NET_BILL_RISK.refundCents).toBe(0);
    expect(L.NET_BILL_RISK.billCents).toBe(SAMPLE_STATS.billRiskBillCents);
  });
});

describe("docs and the voiceover script state the engine's numbers", () => {
  it("every 'a / b / c / d' lane quadruple in the docs is the engine's", () => {
    for (const [name, text] of [["DEVPOST", DEVPOST], ["positioning", POSITIONING], ["README", README]] as const) {
      for (const m of text.matchAll(/\b(\d+) \/ (\d+) \/ (\d+) \/ (\d+)\b/g)) expect(m[0], `${name}: ${m[0]}`).toBe(slashes);
    }
    expect(DEVPOST).toContain(`lanes ${slashes}`);
    expect(DEVPOST).toContain(`Lane counts (${slashes})`);
  });
  it("the headline example reads N of 69 with the engine's count", () => {
    expect(DEVPOST).toContain(`"${attention} of ${SAMPLE_STATS.entries} shipments shouldn't go in the refund file yet.`);
    for (const m of DEVPOST.matchAll(/(\d+) of 69 shipments shouldn't go/g)) expect(Number(m[1])).toBe(attention);
  });
  it("the spoken and captioned lane counts match (DEVPOST shot 4, video script, positioning story)", () => {
    const [a, b, c, d] = laneCounts.map(words);
    const spoken = `Four groups. ${cap(a)} ready to file, ${b} to fix first, ${c} for her broker, ${d} Customs would reject.`;
    expect(DEVPOST).toContain(spoken);
    expect(videoText).toContain(spoken);
    expect(videoText).toContain(`Four groups: ${laneCounts[0]} ready to file, ${laneCounts[1]} to fix first, ${laneCounts[2]} for her broker, ${laneCounts[3]} Customs would reject.`);
    expect(POSITIONING).toContain(`${laneCounts[0]} safe, ${laneCounts[1]} to fix, ${laneCounts[2]} for the broker, ${laneCounts[3]} to leave out`);
  });
  it("the trap walkthrough uses the hero's entry and its engine figures, not the old $8,000 entry", () => {
    const refund = fmtUsd(HERO_TWIST.refundCents).replace(".00", ""), under = fmtUsd(HERO_TWIST.underpaidCents).replace(".00", "");
    const net = fmtUsd(HERO_TWIST.refundCents - HERO_TWIST.underpaidCents).replace(".00", "");
    expect(DEVPOST).toContain(`broker-decision shipment ${HERO_TWIST.entryNumber}`);
    expect(DEVPOST).toContain(`Tariff paid ${refund}, other duties underpaid -${under}, net ${net}`);
    expect(POSITIONING).toContain(`${refund} entry`);
    expect(DEVPOST).not.toContain("broker-decision card A7K-5130944-4");
  });
  it("any dollar total quoted for the safe lane equals the engine's", () => {
    const safe = fmtUsd(SAMPLE_STATS.safeRefundCents);
    for (const [name, text] of [["DEVPOST", DEVPOST], ["positioning", POSITIONING], ["README", README]] as const)
      for (const m of text.matchAll(/\$4\d\d,\d{3}\.\d\d/g)) expect(m[0], name).toBe(safe);
  });
});
