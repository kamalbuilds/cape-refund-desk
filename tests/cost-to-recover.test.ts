import { describe, expect, it } from "vitest";
import { BROKER_PCTS, COST_SOURCES, TARIFFI_PCTS, costToRecover, pctOfCents, unTariffFee } from "../src/lib/cost-to-recover";
import { SAMPLE_STATS } from "../src/lib/sample-stats";

const safe = SAMPLE_STATS.safeRefundCents;
const n = SAMPLE_STATS.safeCount;

describe("cost to recover: integer cents on the sample's safe-to-claim total", () => {
  it("rounds half up in integer arithmetic", () => {
    expect(pctOfCents(46749084, 10)).toBe(4674908);
    expect(pctOfCents(46749084, 15)).toBe(7012363);
    expect(pctOfCents(46749084, 18)).toBe(8414835);
    expect(pctOfCents(5, 10)).toBe(1);
    expect(pctOfCents(4, 10)).toBe(0);
  });
  it("self-file keeps everything, every other row is total minus fee to the cent", () => {
    const r = costToRecover(safe, n);
    if (!r.ok) throw new Error("expected ok");
    expect(safe).toBe(46749084);
    expect(r.options.map((o) => o.id)).toEqual(["self", "untariff", "tariffi", "broker"]);
    expect(r.options[0].lines).toEqual([{ label: "Free", feeCents: 0, keepCents: safe }]);
    for (const o of r.options) for (const l of o.lines) {
      expect(Number.isInteger(l.feeCents) && Number.isInteger(l.keepCents), `${o.id} ${l.label} integer`).toBe(true);
      expect(l.feeCents + l.keepCents).toBe(safe);
    }
    expect(r.options[1].lines[0]).toMatchObject({ label: "Starter flat fee", feeCents: 19900, keepCents: safe - 19900 });
    expect([...TARIFFI_PCTS, ...BROKER_PCTS]).toEqual([10, 15, 18, 10, 25]);
    expect(r.options[2].lines.map((l) => [l.label, l.feeCents, l.keepCents])).toEqual([["10% tier", 4674908, 42074176], ["15% tier", 7012363, 39736721], ["18% tier", 8414835, 38334249]]);
    expect(r.options[3].lines.map((l) => [l.label, l.feeCents, l.keepCents])).toEqual([["10% of the refund", 4674908, 42074176], ["25% of the refund", 11687271, 35061813]]);
  });
  it("the headline range runs from the worst paid route to the best", () => {
    const r = costToRecover(safe, n);
    if (!r.ok) throw new Error("expected ok");
    expect(r.paidKeepLowCents).toBe(35061813);
    expect(r.paidKeepHighCents).toBe(46729184);
    expect(r.selfKeepCents).toBe(safe);
  });
  it("un-tariff tier follows the entry cap, and over 9,999 entries needs more declarations", () => {
    expect(unTariffFee(1)).toMatchObject({ tier: "Starter", cents: 19900 });
    expect(unTariffFee(100)).toMatchObject({ tier: "Starter", cents: 19900 });
    expect(unTariffFee(101)).toMatchObject({ tier: "Standard", cents: 79900 });
    expect(unTariffFee(1000)).toMatchObject({ tier: "Standard", cents: 79900 });
    expect(unTariffFee(1001)).toMatchObject({ tier: "Premium", cents: 149900 });
    expect(unTariffFee(9999)).toMatchObject({ tier: "Premium", declarations: 1, cents: 149900 });
    expect(unTariffFee(10000)).toMatchObject({ declarations: 2, cents: 299800 });
  });
  it("empty and invalid inputs return a state, not numbers", () => {
    expect(costToRecover(0, 0)).toEqual({ ok: false, reason: "empty" });
    expect(costToRecover(safe, 0)).toEqual({ ok: false, reason: "empty" });
    for (const bad of [[-1, 3], [1.5, 3], [NaN, 3], [100, -2], [100, 2.5]] as const) expect(costToRecover(bad[0], bad[1]), String(bad)).toEqual({ ok: false, reason: "invalid" });
  });
  it("a flat fee larger than the refund shows a negative keep rather than hiding it", () => {
    const r = costToRecover(10000, 3);
    if (!r.ok) throw new Error("expected ok");
    expect(r.options[1].lines[0].keepCents).toBe(10000 - 19900);
  });
});

describe("cost to recover: sources", () => {
  it("every source has an https URL, a read date and a status, and each option points at a real source", () => {
    const srcs = Object.values(COST_SOURCES);
    expect(srcs.length).toBeGreaterThanOrEqual(5);
    for (const s of srcs) {
      expect(s.url, s.id).toMatch(/^https:\/\//);
      expect(s.readOn, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["confirmed", "third-party estimate"]).toContain(s.status);
    }
    const r = costToRecover(safe, n);
    if (!r.ok) throw new Error("expected ok");
    for (const o of r.options) for (const id of o.sourceIds) expect(COST_SOURCES[id], `${o.id} -> ${id}`).toBeTruthy();
  });
  it("a row is only 'confirmed' when every source behind it is, and un-tariff and the broker range are labelled estimates", () => {
    const r = costToRecover(safe, n);
    if (!r.ok) throw new Error("expected ok");
    for (const o of r.options) expect(o.status, o.id).toBe(o.sourceIds.every((id) => COST_SOURCES[id].status === "confirmed") ? "confirmed" : "third-party estimate");
    expect(COST_SOURCES.untariff.status).toBe("third-party estimate");
    expect(COST_SOURCES.brokerUn.status).toBe("third-party estimate");
    expect(COST_SOURCES.cbp.status).toBe("confirmed");
    expect(COST_SOURCES.tariffi.status).toBe("confirmed");
  });
  it("no copy uses an em dash", () => {
    expect(JSON.stringify(COST_SOURCES)).not.toMatch(/—| -- /);
  });
});
