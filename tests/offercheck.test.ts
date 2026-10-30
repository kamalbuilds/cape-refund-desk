import { describe, expect, it } from "vitest";
import { CBP_CITES, checkOffer, compareCosts, extractOffer, fmtCents, parseDollarsToCents, sentences } from "../src/lib/offercheck";
import { OFFER_EXAMPLES } from "../src/lib/offercheck-examples";
import { recordedExplanationFor, textKey } from "../src/lib/offercheck-ai";
import { SAMPLE_STATS } from "../src/lib/sample-stats";

const ex = (id: string) => OFFER_EXAMPLES.find((e) => e.id === id)!.text;
const ids = (t: string, sev?: string) => checkOffer(t).flags.filter((f) => !sev || f.severity === sev).map((f) => f.id);

describe("offer check: the three built-in examples", () => {
  it("clean: no flags above info, verdict clean, and the good signs are recognised", () => {
    const r = checkOffer(ex("clean"));
    expect(r.flags.filter((f) => f.severity !== "info")).toEqual([]);
    expect(r.verdict).toBe("clean");
    const x = r.extracted;
    expect(x.feePct).toEqual({ low: 10, high: 10, all: [10] });
    expect(x.upfrontUsd).toBeNull();
    expect(x.noUpfrontStated).toBe(true);
    expect(x.noRecoveryNoFee).toBe(true);
    expect(x.payment.destination).toBe("importer");
    expect(x.poa).toMatchObject({ mentioned: true, limited: true, broad: false, licensedBroker: true });
    expect(x.credentials.neverAsks).toBe(true);
    expect(x.exclusivity.canCancel).toBe(true);
    expect(x.noGuarantee).toBe(true);
    expect(r.good.map((g) => g.id)).toEqual(expect.arrayContaining(["no-upfront", "no-recovery-no-fee", "pays-you", "limited-poa", "no-logins", "can-cancel", "no-guarantee", "fee-in-range"]));
  });

  it("predatory: flags every CBP warning sign and the verdict is high risk", () => {
    const r = checkOffer(ex("predatory"));
    expect(r.verdict).toBe("high");
    const high = r.flags.filter((f) => f.severity === "high").map((f) => f.id);
    expect(high).toEqual(expect.arrayContaining(["impersonation", "credentials", "bank-details", "payee-firm", "own-portal", "upfront", "fee-pct", "lock-in", "urgency"]));
    expect(r.flags.map((f) => f.id)).toEqual(expect.arrayContaining(["guarantee", "timeline"]));
    const x = r.extracted;
    expect(x.feePct?.high).toBe(35);
    expect(x.upfrontUsd).toBe(2500);
    expect(x.payment.destination).toBe("firm");
    expect(x.exclusivity.termMonths).toBe(36);
    expect(x.exclusivity.autoRenew).toBe(true);
    expect(x.exclusivity.tail.length).toBeGreaterThan(0);
    expect(x.exclusivity.noCancel.length).toBeGreaterThan(0);
    expect(x.urgency.length).toBeGreaterThanOrEqual(3);
    expect(x.promisedDays).toBe(21);
    expect(x.lookalikeDomains).toEqual(["cbp-refund-desk.com"]);
    expect(r.good).toEqual([]);
  });

  it("borderline: mediums only, no highs, verdict needs a closer look", () => {
    const r = checkOffer(ex("borderline"));
    expect(r.flags.filter((f) => f.severity === "high")).toEqual([]);
    expect(r.flags.filter((f) => f.severity === "medium").map((f) => f.id)).toEqual(expect.arrayContaining(["fee-pct", "notify-party", "lock-in", "urgency"]));
    expect(r.verdict).toBe("review");
    expect(r.extracted.feePct?.high).toBe(20);
    expect(r.extracted.exclusivity).toMatchObject({ termMonths: 12, autoRenew: true, canCancel: true });
  });

  it("every example gets a different verdict, and every flag cites a CBP quote that exists", () => {
    expect(OFFER_EXAMPLES.map((e) => checkOffer(e.text).verdict)).toEqual(["clean", "review", "high"]);
    for (const e of OFFER_EXAMPLES) for (const f of checkOffer(e.text).flags) for (const c of f.cites) expect(CBP_CITES[c], `${f.id} -> ${c}`).toBeTruthy();
  });
});

describe("offer check: extractor edge cases", () => {
  it("empty and whitespace input is empty, with no flags", () => {
    for (const t of ["", "   \n\t "]) { const r = checkOffer(t); expect(r.empty).toBe(true); expect(r.flags).toEqual([]); }
  });
  it("ignores duty and tariff percentages that are not fees", () => {
    expect(extractOffer("The 10% IEEPA duty you paid is refundable. Interest of 7% applies.").feePct).toBeNull();
    expect(extractOffer("We charge a 12% fee. The 10% IEEPA duty is refundable.").feePct).toEqual({ low: 12, high: 12, all: [12] });
  });
  it("reads tiered fees as a range and flags the top tier", () => {
    const x = extractOffer("Our contingency fee is 10% for new entries, 15% for older ones and 25% for liquidated entries.");
    expect(x.feePct).toEqual({ low: 10, high: 25, all: [10, 15, 25] });
    expect(ids("Our contingency fee is 10%, 15% or 25% by entry age.")).toContain("fee-pct");
  });
  it("fee thresholds: 18% is fine, 19% is medium, 31% is high", () => {
    expect(ids("We take an 18% contingency fee on refunds paid.", "medium")).not.toContain("fee-pct");
    expect(ids("We take a 19% contingency fee on refunds paid.", "medium")).toContain("fee-pct");
    expect(ids("We take a 31% contingency fee on refunds paid.", "high")).toContain("fee-pct");
  });
  it("accepts 'percent' spelled out and decimals", () => {
    expect(extractOffer("Our commission is 12.5 percent of the refund.").feePct?.high).toBe(12.5);
  });
  it("upfront: a negated sentence is not an upfront fee, a real one is", () => {
    expect(extractOffer("No upfront fee. No retainer. We are paid $0 until you are.").upfrontUsd).toBeNull();
    expect(extractOffer("There is a $300 retainer due now.").upfrontUsd).toBe(300);
    expect(extractOffer("A processing fee of $1,200.50 is payable at signing.").upfrontUsd).toBe(1200.5);
    expect(ids("Pay a deposit before we start.")).toContain("upfront");
    expect(extractOffer("We hold no deposit and charge a 10% fee.").upfrontUsd).toBeNull();
  });
  it("a flat fee and a per-entry fee are read but are not counted as upfront", () => {
    const x = extractOffer("We charge a flat fee of $499. Each filing costs $20 per entry.");
    expect(x.flatFeeUsd).toBe(499);
    expect(x.perEntryUsd).toBe(20);
    expect(x.upfrontUsd).toBeNull();
  });
  it("credentials: a request is flagged, a promise not to ask is not", () => {
    expect(ids("Please share your ACE login credentials with us.", "high")).toContain("credentials");
    expect(ids("We never ask for your password or login.", "high")).not.toContain("credentials");
    expect(ids("Add our team as a user on your ACE account so we can file.", "high")).toContain("credentials");
    expect(ids("Send a copy of your passport and Social Security number.", "high")).toContain("ssn");
    expect(ids("We will need your routing number to set up payment.", "high")).toContain("bank-details");
  });
  it("power of attorney: limited and licensed is info, broad is high, unnamed is medium", () => {
    expect(checkOffer("As a licensed customs broker we act under a limited power of attorney.").flags.find((f) => f.id === "poa")?.severity).toBe("info");
    expect(checkOffer("You sign a general power of attorney, irrevocable for the term.").flags.find((f) => f.id === "poa")?.severity).toBe("high");
    expect(checkOffer("We need a power of attorney to act for you.").flags.find((f) => f.id === "poa")?.severity).toBe("medium");
  });
  it("payment destination: your own ACH vs escrow vs a request to change ACH", () => {
    expect(extractOffer("CBP deposits the refund directly into your own bank account.").payment.destination).toBe("importer");
    expect(extractOffer("We are never in the money path, and there is no escrow or clearing account.").payment.destination).not.toBe("firm");
    expect(extractOffer("The refund will be wired to our trust account.").payment.destination).toBe("firm");
    expect(extractOffer("Please update your ACH refund instructions to our bank.").payment.destination).toBe("firm");
    expect(extractOffer("Hello.").payment.destination).toBe("unclear");
    expect(extractOffer("Designate us as your Form 4811 notify party.").payment.notifyParty.length).toBe(1);
    expect(extractOffer("We collect our fee by pre-authorized ACH debit after the refund lands.").payment.debitAuth.length).toBe(1);
  });
  it("exclusivity: non-exclusive is not exclusive; tail and auto-renew are caught", () => {
    expect(extractOffer("This is a non-exclusive arrangement.").exclusivity.exclusive).toEqual([]);
    expect(extractOffer("You grant us the sole and exclusive right to file.").exclusivity.exclusive.length).toBe(1);
    expect(extractOffer("The contract is a 2 year term and renews automatically.").exclusivity).toMatchObject({ termMonths: 24, autoRenew: true });
    expect(extractOffer("Our fee survives termination for twelve months after cancellation.").exclusivity.tail.length).toBeGreaterThan(0);
    expect(extractOffer("You can cancel at any time.").exclusivity.canCancel).toBe(true);
  });
  it("urgency and guarantees; a disclaimer cancels a guarantee", () => {
    expect(extractOffer("Hurry, last chance to claim your refund!").urgency.length).toBeGreaterThanOrEqual(1);
    expect(extractOffer("We cannot guarantee any amount.").guarantees).toEqual([]);
    expect(extractOffer("We guarantee a full refund of every dollar.").guarantees.length).toBe(1);
    expect(extractOffer("Your refund will arrive within 30 days.").promisedDays).toBe(30);
    expect(extractOffer("Your refund will arrive within 2 weeks.").promisedDays).toBe(14);
    expect(extractOffer("Your refund will arrive within 75 days.").promisedDays).toBe(75);
    expect(ids("Your refund will arrive within 75 days.")).not.toContain("timeline");
    expect(extractOffer("You may cancel within 30 days and get your fee back.").promisedDays).toBeNull();
  });
  it("impersonation: affiliation claims and lookalike domains, but not a disclaimer or the real CBP domain", () => {
    expect(extractOffer("We are working with U.S. Customs and Border Protection to speed your claim.").impersonation.length).toBe(1);
    expect(extractOffer("We are not affiliated with CBP.").impersonation).toEqual([]);
    expect(extractOffer("Questions: IEEPARefunds@cbp.dhs.gov").lookalikeDomains).toEqual([]);
    expect(extractOffer("Write to claims@customs-refunds.net or help@associates.cbp.dhs.gov").lookalikeDomains).toEqual(["customs-refunds.net"]);
    expect(extractOffer("Email sales@acme-trading.com").lookalikeDomains).toEqual([]);
  });
  it("does not split 'U.S.' into two sentences", () => {
    expect(sentences("We file with U.S. Customs and Border Protection. Next sentence.")).toEqual(["We file with U.S. Customs and Border Protection.", "Next sentence."]);
  });
  it("long input is truncated and still checked; hostile regex input stays fast", () => {
    const r = checkOffer("We charge a 10% fee. ".repeat(2000));
    expect(r.truncated).toBe(true);
    const t0 = Date.now();
    checkOffer(("refund " + "x ".repeat(40)).repeat(300) + "to");
    expect(Date.now() - t0).toBeLessThan(1500);
  });
  it("verdict ladder", () => {
    expect(checkOffer("Hello.").verdict).toBe("clean");
    expect(checkOffer("Pricing ends Friday.").verdict).toBe("minor");
    expect(checkOffer("We charge 25% and a retainer is due.").verdict).toBe("review");
  });
});

describe("offer check: example comparison", () => {
  const safe = SAMPLE_STATS.safeRefundCents;
  it("defaults to the sample's safe total, and each row's maths is exact to the cent", () => {
    expect(fmtCents(safe)).toBe("$441,345.20");
    const rows = compareCosts(safe, extractOffer(ex("predatory")));
    const offer = rows.find((r) => r.id === "offer")!;
    expect(offer.feeLowCents).toBe(Math.round(safe * 0.35) + 250000);
    expect(offer.keepLowCents).toBe(safe - offer.feeLowCents!);
    const self = rows.find((r) => r.id === "self")!;
    expect(self.feeLowCents).toBe(0);
    expect(self.keepLowCents).toBe(safe);
  });
  it("tiered fee gives a range; no fee gives no number; flat tool is the published price with a link and date", () => {
    const tier = compareCosts(100000, extractOffer("Our fee is 10% to 18%, no upfront."))[0];
    expect([tier.feeLowCents, tier.feeHighCents]).toEqual([10000, 18000]);
    expect([tier.keepLowCents, tier.keepHighCents]).toEqual([82000, 90000]);
    const none = compareCosts(100000, extractOffer("Hello."))[0];
    expect(none.feeLowCents).toBeNull();
    expect(none.keepLowCents).toBeNull();
    const flat = compareCosts(100000, extractOffer("Hello."))[2];
    expect(flat.feeLowCents).toBe(49900);
    expect(flat.published).toMatchObject({ asOf: "2026-10-30", url: expect.stringMatching(/^https:\/\//) });
  });
  it("parses the dollar box strictly", () => {
    expect(parseDollarsToCents("$441,345.20")).toBe(44134520);
    expect(parseDollarsToCents("1000")).toBe(100000);
    for (const bad of ["", "abc", "-5", "1.234", "12k", "1e5"]) expect(parseDollarsToCents(bad)).toBeNull();
  });
});

describe("offer check: AI hook shows nothing without a recorded output", () => {
  it("returns null for every example and any text; returns a record only when one exists", () => {
    for (const e of OFFER_EXAMPLES) expect(recordedExplanationFor({ exampleId: e.id, text: e.text })).toBeNull();
    const store = { [textKey("Hello  there")]: { text: "recorded", model: "m", recordedAt: "2026-10-30" } };
    expect(recordedExplanationFor({ text: "hello there" }, store)?.text).toBe("recorded");
    expect(recordedExplanationFor({ text: "other" }, store)).toBeNull();
  });
});
