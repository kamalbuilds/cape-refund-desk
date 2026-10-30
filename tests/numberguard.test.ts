import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { figuresFor, guardCounts, guardDays, guardEntryText, portfolioDays, reguardRun } from "../src/lib/numberguard";
import { fmtUsd } from "../src/lib/money";
import type { Verdict } from "../src/lib/types";

// The recorded real Ultra run (data/sample-run.json): 22 per-entry explanations + the portfolio note, from Nemotron 3 Ultra on Token Factory.
const run = JSON.parse(fs.readFileSync("data/sample-run.json", "utf8"));
const V = new Map<string, Verdict>(run.portfolio.verdicts.map((v: Verdict) => [v.id, v]));
const EX = run.explanations as Record<string, { summary: string; brokerAction: string; whyThisOrder: string; guardStripped: number }>;
const text = (e: { summary: string; brokerAction: string; whyThisOrder: string }) => [e.summary, e.brokerAction, e.whyThisOrder];
const g = (id: string, t: string) => guardEntryText(t, figuresFor(V.get(id)!));

// The three traps seeded in the sample (scripts/gen-sample.mjs): 81 days since liquidation, EU Framework carve-out, underpaid 301.
// Ids carry the filing-order suffix, which moves when the engine changes, so look entries up by their entry-number key.
const idOf = (key: string) => run.portfolio.verdicts.find((v: Verdict) => v.key === key)!.id as string;
const T81 = idOf("A7K21937388"), TFW = idOf("A7K35748488"), TU301 = idOf("A7K51309444"), TNB = idOf("A7K73449900"), TRECON = idOf("A7K15986055");

describe("number guard on the recorded Ultra run", () => {
  it("the recording has 22 explanations and every one passes the guard unchanged (Ultra stated no figure the engine did not produce)", () => {
    const ids = Object.keys(EX);
    expect(ids.length).toBe(22);
    for (const id of ids) for (const t of text(EX[id])) {
      const r = g(id, t);
      expect({ id, t: r.text }).toEqual({ id, t });
      expect(r.stripped).toBe(0);
    }
  });

  it("every dollar figure Ultra wrote in the recording equals an engine figure for that entry", () => {
    let seen = 0;
    for (const [id, e] of Object.entries(EX)) {
      const f = figuresFor(V.get(id)!).fields;
      const engine = new Set(Object.values(f).map((c) => (Math.abs(c) / 100).toFixed(0)));
      for (const t of text(e)) for (const m of t.match(/\$[\d,]+(?:\.\d+)?/g) ?? []) { seen++; expect(engine.has(String(Math.round(Number(m.replace(/[$,]/g, "")))))).toBe(true); }
    }
    expect(seen).toBeGreaterThanOrEqual(8); // the recording does state figures; this is not a vacuous pass
  });

  it("portfolio note: no day count outside the engine's deadlines, no dollar figure at all that is unaccounted for", () => {
    const n = run.portfolioNote;
    const top = run.portfolio.verdicts.filter((v: Verdict) => ["FILE_NOW", "NET_BILL_RISK"].includes(v.lane) || /Step 0/.test(v.filingStep)).slice(0, 12);
    const days = portfolioDays(top);
    for (const t of [n.headline, ...n.priorities.map((p: { reason: string }) => p.reason)]) expect(guardDays(t, days).stripped).toBe(0);
    expect(n.guardStripped).toBe(0);
  });

  it("FOUND IN THE EARLIER RECORDING: the portfolio headline said 7 entries expire today; the engine says 1. The count guard corrects that sentence", () => {
    const vs: Verdict[] = run.portfolio.verdicts;
    const today = vs.filter((v) => v.lane === "FILE_NOW" && v.deadlines.capeDaysLeft === 0).length;
    expect(today).toBe(1);
    // The 2026-10-30 recording's headline has no "N entries expiring today" claim, so the count guard has nothing to correct in it (stripped 0).
    // The mechanism is pinned on the sentence the earlier recording produced.
    expect(guardCounts(run.portfolioNote.headline, vs).stripped).toBe(0);
    const old = "File 7 entries expiring today";
    const fixed = guardCounts(old, vs);
    expect(fixed.stripped).toBe(1);
    expect(fixed.text).toContain("File 1 entry expiring today");
    expect(guardCounts("File 1 entry expiring today", vs).stripped).toBe(0);
  });

  it("reguardRun (what /api/sample serves): fixes a wrong count in the headline, leaves the 22 clean explanations byte-identical, is idempotent", () => {
    const bad = { ...run, portfolioNote: { ...run.portfolioNote, headline: "File 7 entries expiring today; the rest can wait." } };
    const once = reguardRun(bad);
    expect(once.portfolioNote.headline).toContain("File 1 entry expiring today");
    expect(once.portfolioNote.guardStripped).toBe(run.portfolioNote.guardStripped + 1);
    expect(reguardRun(run).portfolioNote).toEqual(run.portfolioNote); // the real recording needs no correction
    for (const id of Object.keys(EX)) expect(once.explanations[id].summary).toBe(EX[id].summary);
    expect(reguardRun(once).portfolioNote).toEqual(once.portfolioNote);
  });
});

describe("trap entries", () => {
  it("81-day trap: the engine blocks it (one day past the 80-day window); the recording has no Ultra text for it, so a wrong claim is tested directly", () => {
    const v = V.get(T81)!;
    expect(v.lane).toBe("BLOCKED");
    expect(v.deadlines.daysSinceLiquidation).toBe(81);
    expect(EX[T81]).toBeUndefined();
    // Ultra saying 80 days is the classic off-by-one; "80" is a CBP limit, but as a liquidated-ago claim it must equal 81.
    expect(g(T81, "Liquidated 80 days ago, still inside the window.").text).toBe("Liquidated (see deadlines) ago, still inside the window.");
    expect(g(T81, "Liquidated 81 days ago, one day past the 80-day window.").stripped).toBe(0);
    expect(g(T81, "Phase 1 accepts entries liquidated within the preceding 80 days.").stripped).toBe(0);
    expect(g(T81, "The CAPE window closed 1 day ago.").stripped).toBe(0); // 1 is not a day figure of this entry, and not a hallucinated deadline: see below
  });

  it("Framework EU trap: engine keeps the Column 1 carve-out; a model claiming the full 15% is refundable gets its figure replaced", () => {
    const v = V.get(TFW)!;
    expect(v.money.frameworkCarveOutCents).toBe(307830);
    expect(v.money.ieepaRefundableCents).toBe(v.money.grossIeepaCents - 307830);
    const refundable = fmtUsd(v.money.ieepaRefundableCents);
    const carve = fmtUsd(v.money.frameworkCarveOutCents);
    expect(g(TFW, `Refundable IEEPA portion is ${refundable}; the ${carve} Column 1 duty stays owed.`).stripped).toBe(0);
    const full = fmtUsd(v.money.grossIeepaCents);
    const bad = g(TFW, `Refund the full 15%: refundable ${full}.`);
    expect(bad.mislabeled).toBe(1);
    expect(bad.text).toBe("Refund the full 15%: refundable (amount on board).");
    expect(g(TFW, "Refundable is $99,999.").unknown).toBe(1);
  });

  it("underpaid 301 trap: the engine's $8,000 / $5,600 / $2,400 are right (no Ultra text in this recording, it is FILE NOW); swapping the labels or inventing a figure is caught", () => {
    const v = V.get(TU301)!;
    expect(v.money).toMatchObject({ ieepaRefundableCents: 800000, underpaidOtherCents: 560000, netCents: 240000, billCents: 0 });
    expect(EX[TU301]).toBeUndefined();
    expect(g(TU301, "A $2,400 net refund after the $5,600 underpaid 301 duty is netted against the $8,000 refundable IEEPA.").stripped).toBe(0);
    expect(g(TU301, "Net refund is $8,000 after the 301 underpayment.").mislabeled).toBe(1);   // gross presented as net
    expect(g(TU301, "The underpaid 301 duty is $2,400.").mislabeled).toBe(1);                   // net presented as underpaid
    expect(g(TU301, "This entry will produce a bill of $5,600.").mislabeled).toBe(1);           // underpaid presented as a bill (engine bill is $0)
    expect(g(TU301, "Net refund is $2,500.").unknown).toBe(1);                                  // plausible but invented
    expect(g(TU301, "Net refund is $2,400.").stripped).toBe(0);
  });

  it("net-bill entry (recorded): a bill is not a refund", () => {
    const id = TNB;
    expect(g(id, EX[id].summary).stripped).toBe(0);
    expect(g(id, "Net refund of $2,625.").mislabeled).toBe(0); // net is -$2,625; "net" owns this amount (abs value), so the sign is the engine's job
  });
});

describe("guard mechanics", () => {
  it("leaves text without figures alone, and counts every replacement", () => {
    const f = figuresFor(V.get(TU301)!);
    expect(guardEntryText("File the PSC first.", f)).toMatchObject({ text: "File the PSC first.", stripped: 0 });
    const r = guardEntryText("Net $2,400, bill $1,111, 55 days ago.", f);
    expect(r.unknown).toBe(1);
    expect(r.badDays).toBe(1);
    expect(r.text).toBe("Net $2,400, bill (amount on board), (see deadlines) ago.");
  });
  it("a days-left claim must equal a computed deadline", () => {
    const id = TRECON; // recon deadline 21 days away
    expect(g(id, "Reconciliation deadline is 21 days away.").stripped).toBe(0);
    expect(g(id, "Reconciliation deadline is 12 days away.").badDays).toBe(1);
  });
});
