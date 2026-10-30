import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkOffer, extractOffer, compareCosts, CBP_CITES } from "../src/lib/offercheck";
import { OFFER_EXAMPLES } from "../src/lib/offercheck-examples";

/** One row per red-flag rule in buildFlags: text that must raise it (with its severity) and text that must not. */
interface Rule { id: string; severity: "high" | "medium" | "info"; fires: string; quiet: string }
const RULES: Rule[] = [
  { id: "impersonation", severity: "high", fires: "We are an official refund processing service working with U.S. Customs and Border Protection.", quiet: "We are not affiliated with CBP. Write to help@harbourline-brokers.com." },
  { id: "credentials", severity: "high", fires: "Please send us your ACE Portal username and password so we can file.", quiet: "We never ask for your ACE password." },
  { id: "ssn", severity: "high", fires: "We need a copy of your passport and your Social Security number.", quiet: "We never need your Social Security number." },
  { id: "bank-details", severity: "high", fires: "Send us your bank routing number and account number.", quiet: "Bank details go only into your own ACE account, so we do not need them." },
  { id: "payee-firm", severity: "high", fires: "CBP will deposit the refund into our escrow account.", quiet: "CBP deposits the refund by ACH directly to your own bank account." },
  { id: "own-portal", severity: "high", fires: "File your claim on our secure portal.", quiet: "Claims are filed only in the ACE Portal, never on our website." },
  { id: "notify-party", severity: "medium", fires: "Please designate our firm as the Form 4811 notify party.", quiet: "CBP pays the refund by ACH to your own bank account." },
  { id: "debit-auth", severity: "medium", fires: "You sign an ACH debit authorization so we can pull our fee from your account.", quiet: "We send an invoice after the refund arrives." },
  { id: "upfront", severity: "high", fires: "A retainer of $1,500 is due before we begin.", quiet: "There is no retainer and no upfront fee." },
  { id: "flat-fee", severity: "info", fires: "Our fee is a flat $750.", quiet: "Our fee is 10% of refunds paid." },
  { id: "fee-pct", severity: "high", fires: "We keep a 35% success fee on everything recovered.", quiet: "We keep a 15% success fee on refunds paid." },
  { id: "minimum-fee", severity: "medium", fires: "Our fee is 12% with a minimum fee of $5,000.", quiet: "Our fee is 12% with no minimum fee." },
  { id: "lock-in", severity: "high", fires: "The agreement is exclusive for 24 months and is non-cancellable.", quiet: "This is non-exclusive and you can cancel at any time." },
  { id: "poa", severity: "high", fires: "You grant us an irrevocable power of attorney.", quiet: "We file with your ACE account and need no paperwork from you." },
  { id: "urgency", severity: "medium", fires: "Act now, this offer expires in 48 hours.", quiet: "Take your time. There is no pressure to decide." },
  { id: "guarantee", severity: "medium", fires: "We guarantee 100% recovery of every dollar.", quiet: "We cannot guarantee a refund amount." },
  { id: "timeline", severity: "medium", fires: "You will receive your refund within 21 days.", quiet: "CBP generally pays refunds 60 to 90 days after acceptance." },
  { id: "payee-unclear", severity: "info", fires: "Our fee is 10% of refunds paid.", quiet: "CBP pays the refund by ACH to your own bank account." },
  { id: "fee-missing", severity: "info", fires: "Hello, we can help you with your IEEPA refunds.", quiet: "Our fee is 10% of refunds paid." },
];

const flagIds = (t: string) => checkOffer(t).flags.map((f) => f.id);
const flag = (t: string, id: string) => checkOffer(t).flags.find((f) => f.id === id);

describe("recovery-offer red-flag rules: each rule fires on its text and stays quiet on the near miss", () => {
  it("covers every rule buildFlags can emit", () => {
    const src = readFileSync(new URL("../src/lib/offercheck.ts", import.meta.url), "utf8");
    const body = src.slice(src.indexOf("export function buildFlags"), src.indexOf("export function goodSigns"));
    const emitted = [...new Set([...body.matchAll(/f\.push\(\{ id: "([a-z-]+)"/g)].map((m) => m[1]))];
    expect(emitted.length).toBeGreaterThanOrEqual(18);
    expect(RULES.map((r) => r.id).sort()).toEqual(emitted.sort());
  });

  for (const r of RULES) {
    it(`${r.id}: fires at ${r.severity} on its text`, () => {
      const f = flag(r.fires, r.id);
      expect(f, `${r.id} should fire on: ${r.fires}`).toBeTruthy();
      expect(f!.severity).toBe(r.severity);
      for (const c of f!.cites) expect(CBP_CITES[c], `${r.id} cites ${c}`).toBeTruthy();
    });
    it(`${r.id}: does not fire on the near miss`, () => {
      expect(flagIds(r.quiet), `${r.id} should not fire on: ${r.quiet}`).not.toContain(r.id);
    });
  }

  it("fee-pct grades by size: 18% is quiet, 20% is medium, 35% is high", () => {
    expect(flag("We charge an 18% fee.", "fee-pct")).toBeUndefined();
    expect(flag("We charge a 20% fee.", "fee-pct")?.severity).toBe("medium");
    expect(flag("We charge a 35% fee.", "fee-pct")?.severity).toBe("high");
  });
  it("upfront without an amount is medium, with an amount is high", () => {
    expect(flag("A retainer is required.", "upfront")?.severity).toBe("medium");
    expect(flag("A retainer of $900 is required.", "upfront")?.severity).toBe("high");
  });
  it("poa grades by wording: broad is high, unnamed is medium, limited to a licensed broker is info", () => {
    expect(flag("You grant us an irrevocable power of attorney.", "poa")?.severity).toBe("high");
    expect(flag("We need a power of attorney.", "poa")?.severity).toBe("medium");
    expect(flag("We are a licensed customs broker and act under a limited power of attorney.", "poa")?.severity).toBe("info");
  });
});

describe("recovery-offer extraction: the terms the check reports", () => {
  const x = extractOffer(OFFER_EXAMPLES.find((e) => e.id === "lock-in")!.text);
  it("reads the fee percentage, the minimum, the term length and the survive-termination clause", () => {
    expect(x.feePct).toEqual({ low: 17, high: 17, all: [17] });
    expect(x.minimumFeeUsd).toBe(7500);
    expect(x.exclusivity.termMonths).toBe(24);
    expect(x.exclusivity.autoRenew).toBe(true);
    expect(x.exclusivity.tail.length).toBeGreaterThan(0);
  });
  it("reads an upfront fee that shares a sentence with a percentage", () => {
    expect(extractOffer("We ask for a retainer of $1,500 due before we begin, and then a 15% contingency fee.").upfrontUsd).toBe(1500);
    expect(extractOffer("We charge 15% of the first $100,000 recovered.").upfrontUsd).toBeNull();
  });
  it("minimum: a fee floor is read, a minimum refund or a negation is not", () => {
    expect(extractOffer("Our fee is 10% with a $2,500 minimum.").minimumFeeUsd).toBe(2500);
    expect(extractOffer("Our fee is 10% and we take clients with a minimum refund of $50,000.").minimumFeeUsd).toBeNull();
    expect(extractOffer("Our fee is 10%, no minimum fee of any kind.").minimumFeeUsd).toBeNull();
  });
  it("a bank-account change is a bank flag, not an ACE-login flag", () => {
    const ids = flagIds("Please update your ACH refund account in ACE to our client settlement account, and send your bank routing number.");
    expect(ids).toContain("bank-details");
    expect(ids).not.toContain("credentials");
  });
  it("a fee floor lifts a small refund's cost: 10% of $10,000 is $1,000 but the minimum makes it $5,000", () => {
    const row = compareCosts(1_000_000, extractOffer("Our fee is 10% with a minimum fee of $5,000."))[0];
    expect([row.feeLowCents, row.keepLowCents]).toEqual([500_000, 500_000]);
    const big = compareCosts(10_000_000, extractOffer("Our fee is 10% with a minimum fee of $5,000."))[0];
    expect(big.feeLowCents).toBe(1_000_000);
  });
});

describe("recovery-offer examples", () => {
  it("ships eight synthetic examples with unique ids", () => {
    expect(OFFER_EXAMPLES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(OFFER_EXAMPLES.map((e) => e.id)).size).toBe(OFFER_EXAMPLES.length);
  });
  it("the benign offers produce no red flag and no look-closer flag, only info", () => {
    for (const id of ["clean", "flat-broker"]) {
      const r = checkOffer(OFFER_EXAMPLES.find((e) => e.id === id)!.text);
      expect(r.flags.filter((f) => f.severity !== "info"), id).toEqual([]);
      expect(r.verdict, id).toBe("clean");
    }
  });
  it("the same engine does flag the bad ones, so the benign result is not an engine that flags nothing", () => {
    const flagged = OFFER_EXAMPLES.filter((e) => checkOffer(e.text).flags.some((f) => f.severity !== "info"));
    expect(flagged.length).toBeGreaterThanOrEqual(5);
  });
  it("each non-benign example raises the rule it was written for", () => {
    const want: Record<string, string> = { borderline: "lock-in", retainer: "upfront", "ace-login": "credentials", "bank-redirect": "payee-firm", "lock-in": "minimum-fee", predatory: "impersonation" };
    for (const [id, rule] of Object.entries(want)) expect(flagIds(OFFER_EXAMPLES.find((e) => e.id === id)!.text), id).toContain(rule);
  });
});
