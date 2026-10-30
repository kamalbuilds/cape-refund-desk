import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIcs, icsEvents } from "../src/lib/ics";
import { daysLeftFrom, expiringWithin, leftText, nextRoute, routesFor, urgencyOf, weeklyView, windowCloses } from "../src/lib/deadlines";
import { parseEs003 } from "../src/lib/parse";
import { computeDeadlines, validateEntries } from "../src/lib/validate";
import type { Entry, Lane, Verdict } from "../src/lib/types";

/** A verdict with only what the tracker reads: deadlines (from the real computeDeadlines), lane, findings and net refund. */
function fake(id: string, liq: string | null, asOf: string, o: { lane?: Lane; net?: number; recon?: string; projected?: string; protest?: boolean; window?: number } = {}): Verdict {
  const entry = { liquidationDate: liq, reconDeadline: o.recon ?? null, projectedLiquidationDate: o.projected ?? null } as unknown as Entry;
  return {
    id, key: id, displayNumber: id, lane: o.lane ?? "FILE_NOW",
    findings: o.protest ? [{ code: "PROTEST", cbpError: null, sourceId: "FAQ", disposition: "wait", detail: "" }] : [],
    money: { netRefundCents: o.net ?? 100_00 }, deadlines: computeDeadlines(entry, asOf, o.window),
  } as unknown as Verdict;
}

describe("date math", () => {
  it("counts calendar days: 80 and 180 days after liquidation", () => {
    expect(windowCloses("2026-10-29", 80)).toBe("2027-01-17");
    expect(windowCloses("2026-05-01", 180)).toBe("2026-10-28");
  });
  it("handles leap years (2028-02-29 exists, 2027 has no Feb 29)", () => {
    expect(windowCloses("2028-01-01", 80)).toBe("2028-03-21"); // Jan 31 + Feb 29 + 20
    expect(windowCloses("2027-01-01", 80)).toBe("2027-03-22"); // Jan 31 + Feb 28 + 21
    expect(windowCloses("2028-02-29", 180)).toBe("2028-08-27");
    expect(daysLeftFrom("2028-03-01", "2028-02-28")).toBe(2);
    expect(daysLeftFrom("2027-03-01", "2027-02-28")).toBe(1);
    expect(daysLeftFrom("2029-01-01", "2028-01-01")).toBe(366);
  });
  it("is 0 on the closing day, negative after it, and does not depend on the clock", () => {
    expect(daysLeftFrom("2026-11-05", "2026-11-05")).toBe(0);
    expect(daysLeftFrom("2026-11-05", "2026-11-06")).toBe(-1);
    expect(daysLeftFrom("2026-11-05", "2026-10-29")).toBe(7);
  });
  it("classifies urgency and words", () => {
    expect(urgencyOf(-1)).toBe("expired"); expect(urgencyOf(0)).toBe("today"); expect(urgencyOf(1)).toBe("urgent");
    expect(urgencyOf(7)).toBe("urgent"); expect(urgencyOf(8)).toBe("soon"); expect(urgencyOf(30)).toBe("soon"); expect(urgencyOf(31)).toBe("open");
    expect(urgencyOf(null)).toBeNull();
    expect(leftText(5)).toBe("5 days left"); expect(leftText(1)).toBe("1 day left"); expect(leftText(0)).toBe("closes today");
    expect(leftText(-1)).toBe("closed 1 day ago"); expect(leftText(-12)).toBe("closed 12 days ago"); expect(leftText(null)).toBe("n/a");
  });
});

describe("routes for one entry", () => {
  const asOf = "2026-10-29";
  it("gives CAPE (80d), protest (180d) and CBP's 90-day reliquidation for a liquidated entry, with sources", () => {
    const v = fake("A", "2026-09-29", asOf); // liquidated 30 days ago
    const rs = routesFor(v, asOf);
    const by = Object.fromEntries(rs.map((r) => [r.id, r]));
    expect(by.CAPE.daysLeft).toBe(50); expect(by.CAPE.closes).toBe("2026-12-18");
    expect(by.PROTEST.daysLeft).toBe(150); expect(by.PROTEST.closes).toBe("2027-03-28");
    expect(by.RELIQ.daysLeft).toBe(60); expect(by.RELIQ.actionable).toBe(false);
    expect(by.PROTEST.sources).toEqual(["19USC1514", "19CFR174.12"]);
    expect(by.CAPE.sources).toEqual(["FAQ"]);
    expect(nextRoute(rs)?.id).toBe("CAPE");
  });
  it("agrees with the validated deadlines the rest of the app uses", () => {
    const v = fake("A", "2026-08-15", asOf);
    const r = Object.fromEntries(routesFor(v, asOf).map((x) => [x.id, x]));
    expect(r.CAPE.daysLeft).toBe(v.deadlines.capeDaysLeft); expect(r.CAPE.closes).toBe(v.deadlines.capeCutoffDate);
    expect(r.PROTEST.daysLeft).toBe(v.deadlines.protestDaysLeft); expect(r.PROTEST.closes).toBe(v.deadlines.protestDeadlineDate);
  });
  it("already expired: CAPE closed, protest still open (liquidated 100 days ago)", () => {
    const rs = routesFor(fake("A", "2026-07-21", asOf), asOf);
    const cape = rs.find((r) => r.id === "CAPE")!, pr = rs.find((r) => r.id === "PROTEST")!;
    expect(cape.daysLeft).toBe(-20); expect(cape.urgency).toBe("expired");
    expect(pr.daysLeft).toBe(80); expect(nextRoute(rs)?.id).toBe("PROTEST");
  });
  it("closes today: liquidated exactly 80 days ago", () => {
    const rs = routesFor(fake("A", "2026-08-10", asOf), asOf);
    const cape = rs.find((r) => r.id === "CAPE")!;
    expect(cape.daysLeft).toBe(0); expect(cape.urgency).toBe("today");
    expect(nextRoute(rs)?.id).toBe("CAPE");
  });
  it("protest closes today on day 180 and is gone on day 181", () => {
    expect(routesFor(fake("A", "2026-05-02", asOf), asOf).find((r) => r.id === "PROTEST")!.daysLeft).toBe(0);
    expect(routesFor(fake("A", "2026-05-01", asOf), asOf).find((r) => r.id === "PROTEST")!.daysLeft).toBe(-1);
  });
  it("an unliquidated entry has no CAPE or protest clock, only the projected date from the file", () => {
    const rs = routesFor(fake("A", null, asOf, { projected: "2026-12-01" }), asOf);
    expect(rs.map((r) => r.id)).toEqual(["PROJECTED"]);
    expect(rs[0].daysLeft).toBe(33); expect(rs[0].actionable).toBe(false);
  });
  it("reconciliation date comes from the file and an existing protest is flagged, not counted", () => {
    const rs = routesFor(fake("A", "2026-10-01", asOf, { recon: "2026-11-10", protest: true }), asOf);
    expect(rs.find((r) => r.id === "RECON")!.daysLeft).toBe(12);
    const p = rs.find((r) => r.id === "PROTEST")!;
    expect(p.actionable).toBe(false); expect(p.basis).toMatch(/already shows a protest/);
  });
  it("honours a rule-watch window override (60 days)", () => {
    const v = fake("A", "2026-09-29", asOf, { window: 60 });
    expect(routesFor(v, asOf).find((r) => r.id === "CAPE")!.daysLeft).toBe(30);
  });
  it("no dates at all means no routes", () => { expect(routesFor(fake("A", null, asOf), asOf)).toEqual([]); });
});

describe("by-week dollars", () => {
  const asOf = "2026-10-29";
  // CAPE days left = 80 - daysSinceLiquidation. Liquidated N days ago.
  const liq = (n: number) => { const [y, m, d] = asOf.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10); };
  const vs = [
    fake("w0a", liq(80), asOf, { net: 100_00 }),          // 0 days left: this week
    fake("w0b", liq(74), asOf, { net: 200_00 }),          // 6 days left: this week
    fake("w1", liq(73), asOf, { net: 400_00 }),           // 7 days left: week 2
    fake("w3", liq(55), asOf, { net: 800_00 }),           // 25 days left: week 4
    fake("w11", liq(0), asOf, { net: 1600_00 }),          // 80 days left: week 12
    fake("late", liq(-10), asOf, { net: 3200_00 }),       // 90 days left: beyond
    fake("gone", liq(81), asOf, { net: 6400_00 }),        // expired on CAPE
    fake("blocked", liq(70), asOf, { net: 9999_00, lane: "BLOCKED" }), // never counted on CAPE
  ];
  const w = weeklyView(vs, asOf, "CAPE", 12);
  it("puts each entry in the right 7-day bucket, with day 0 and day 6 in the same week", () => {
    expect(w.weeks[0].entries.map((e) => e.id)).toEqual(["w0a", "w0b"]); expect(w.weeks[0].cents).toBe(300_00);
    expect(w.weeks[1].entries.map((e) => e.id)).toEqual(["w1"]);
    expect(w.weeks[3].cents).toBe(800_00); expect(w.weeks[11].cents).toBe(1600_00);
  });
  it("reports beyond-12-weeks and already-closed separately, and never counts an excluded entry", () => {
    expect(w.beyondCount).toBe(1); expect(w.beyondCents).toBe(3200_00);
    expect(w.expiredCount).toBe(1); expect(w.expiredCents).toBe(6400_00);
    expect(w.totalCents).toBe(300_00 + 400_00 + 800_00 + 1600_00);
    expect(w.weeks.flatMap((x) => x.entries).some((e) => e.id === "blocked")).toBe(false);
  });
  it("weeks are labelled from the as-of date", () => {
    expect(w.weeks[0].startIso).toBe("2026-10-29"); expect(w.weeks[0].endIso).toBe("2026-11-04"); expect(w.weeks[1].startIso).toBe("2026-11-05");
  });
  it("expiringWithin(28) equals the first four weeks", () => {
    const four = expiringWithin(vs, asOf, "CAPE", 28);
    expect(four.cents).toBe(w.weeks.slice(0, 4).reduce((a, x) => a + x.cents, 0)); expect(four.count).toBe(4);
    expect(expiringWithin(vs, asOf, "CAPE", 1).count).toBe(1); // only the one closing today
  });
  it("the protest view counts blocked entries (protest is their route) but skips ones with a protest on file", () => {
    const pv = [fake("p1", liq(100), asOf, { net: 500_00, lane: "BLOCKED" }), fake("p2", liq(100), asOf, { net: 700_00, lane: "BLOCKED", protest: true })];
    const r = weeklyView(pv, asOf, "PROTEST", 12);
    expect(r.weeks[11].entries.map((e) => e.id)).toEqual(["p1"]); // 80 days left = index 11
    expect(r.weeks.flatMap((x) => x.entries).map((e) => e.id)).toEqual(["p1"]);
  });
  it("is deterministic: the same inputs give the same result", () => { expect(weeklyView(vs, asOf, "CAPE", 12)).toEqual(w); });
});

describe("sample data", () => {
  const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
  const { entries } = parseEs003(fs.readFileSync("data/sample-es003.csv", "utf8"));
  const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
  it("every actionable CAPE route in the sample agrees with the validated deadlines", () => {
    for (const v of pf.verdicts) {
      const c = routesFor(v, meta.asOf).find((r) => r.id === "CAPE");
      expect(c?.daysLeft ?? null).toBe(v.deadlines.capeDaysLeft);
    }
  });
  it("the calendar export and the tracker share dates: each .ics date matches a tracker route", () => {
    const ev = icsEvents(pf, meta.asOf);
    expect(ev.length).toBeGreaterThan(10);
    for (const e of ev) {
      const v = pf.verdicts.find((x) => e.uid.startsWith(`${x.key}-`))!;
      const id = e.uid.includes("-cape@") ? "CAPE" : e.uid.includes("-protest@") ? "PROTEST" : "RECON";
      expect(routesFor(v, meta.asOf).find((r) => r.id === id)?.closes).toBe(e.date);
    }
    const body = buildIcs(pf, meta.asOf);
    expect(body).toContain("19 CFR 174.12");
    expect(body).toContain(`Counted from ${meta.asOf}`);
  });
  it("sample: 4-week CAPE total is stable", () => {
    const r = expiringWithin(pf.verdicts, meta.asOf, "CAPE", 28);
    expect(r).toEqual({ cents: 3414500, count: 4 });
  });
});
