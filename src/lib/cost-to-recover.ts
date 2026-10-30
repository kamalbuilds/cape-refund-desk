/**
 * Cost to recover. Pure TypeScript, integer cents, no network, no model.
 * For a safe-to-claim total, what the importer keeps under four ways of getting the refund.
 * Every price below carries the page it came from, the day it was read and whether the page itself confirmed it.
 *
 * Read on 2026-10-30:
 *  - CBP FAQ page, fetched and parsed: the "no fees" answer is verbatim.
 *  - tariffi.io, fetched: "Contingency fee tiers (10% / 15% / 18%) are disclosed in full before you sign". The page does not
 *    say what decides the tier, so all three are shown and none is picked "by entry age".
 *  - un-tariff.com/pricing: HTTP 402 DEPLOYMENT_DISABLED from three fetchers. The $199 / $799 / $1,499 tiers and entry caps
 *    come from a search-engine copy of that page, so they are labelled a third-party estimate.
 *  - broker 10 to 25%: stated by un-tariff.com about brokers (a competitor) and 10 to 20% by tariffrefundcredits.com, a
 *    lead-generation site. Neither is a broker's own price list, so the row is a third-party estimate.
 */

export const READ_ON = "2026-10-30";
export type SourceStatus = "confirmed" | "third-party estimate";

export interface CostSource { id: string; label: string; url: string; readOn: string; status: SourceStatus; says: string; caveat?: string }

export const COST_SOURCES: Record<string, CostSource> = {
  cbp: {
    id: "cbp", label: "CBP, IEEPA Duty Refunds page, FAQ: Are there any fees or charges to receive a tariff refund? (updated 5/20/2026)",
    url: "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds", readOn: READ_ON, status: "confirmed",
    says: "“No. CBP does not charge any fees for processing tariff refunds.”",
  },
  untariff: {
    id: "untariff", label: "un-tariff, Pricing", url: "https://www.un-tariff.com/pricing", readOn: READ_ON, status: "third-party estimate",
    says: "Flat fee by entry cap: $199 up to 100 entries, $799 up to 1,000, $1,499 up to 9,999 (CBP's cap per declaration).",
    caveat: "The page did not load when read on 2026-10-30 (HTTP 402, deployment paused). Figures are from a search-engine copy of the page. Confirm the price with the vendor.",
  },
  tariffi: {
    id: "tariffi", label: "Tariffi, home page", url: "https://tariffi.io/", readOn: READ_ON, status: "confirmed",
    says: "“Contingency fee tiers (10% / 15% / 18%) are disclosed in full before you sign.” No retainer, no deposit, no advance charges.",
    caveat: "The page does not say what sets the tier, so the three tiers are shown side by side.",
  },
  brokerUn: {
    id: "brokerUn", label: "un-tariff, Pricing: what it says brokers charge", url: "https://www.un-tariff.com/pricing", readOn: READ_ON, status: "third-party estimate",
    says: "Customs brokers typically charge 10 to 25% of the refund.",
    caveat: "A competing vendor's claim, from a search-engine copy of a page that did not load on 2026-10-30.",
  },
  brokerLead: {
    id: "brokerLead", label: "Tariff Refund Credits, Pricing", url: "https://tariffrefundcredits.com/pricing", readOn: READ_ON, status: "third-party estimate",
    says: "Broker partners charge “10-20% of recovery”.",
    caveat: "The site calls itself a lead-generation service and is not a customs broker. Other sources quote lower percentages, so ask for a written quote.",
  },
};

/** un-tariff tiers (third-party estimate). Entry caps are per declaration. */
export const UN_TARIFF_TIERS = [
  { name: "Starter", maxEntries: 100, cents: 19900 },
  { name: "Standard", maxEntries: 1000, cents: 79900 },
  { name: "Premium", maxEntries: 9999, cents: 149900 },
] as const;
export const TARIFFI_PCTS = [10, 15, 18] as const;
export const BROKER_PCTS = [10, 25] as const;

/** Whole percent of an integer cent amount, rounded half up, in integer arithmetic. */
export function pctOfCents(cents: number, pct: number): number {
  return Math.floor((cents * pct + 50) / 100);
}

/** Smallest tier that holds the entry count. Over 9,999 entries needs several declarations, each priced at the top tier. */
export function unTariffFee(entryCount: number): { tier: string; declarations: number; cents: number } {
  const top = UN_TARIFF_TIERS[UN_TARIFF_TIERS.length - 1];
  if (entryCount > top.maxEntries) {
    const declarations = Math.ceil(entryCount / top.maxEntries);
    return { tier: top.name, declarations, cents: declarations * top.cents };
  }
  const t = UN_TARIFF_TIERS.find((x) => entryCount <= x.maxEntries)!;
  return { tier: t.name, declarations: 1, cents: t.cents };
}

export interface CostLine { label: string; feeCents: number; keepCents: number }
export interface CostOption {
  id: "self" | "untariff" | "tariffi" | "broker";
  title: string;
  how: string;
  lines: CostLine[];
  sourceIds: string[];
  status: SourceStatus;
}
export type CostResult =
  | { ok: true; safeCents: number; safeCount: number; options: CostOption[]; selfKeepCents: number; paidKeepLowCents: number; paidKeepHighCents: number }
  | { ok: false; reason: "empty" | "invalid" };

const line = (label: string, safe: number, fee: number): CostLine => ({ label, feeCents: fee, keepCents: safe - fee });

export function costToRecover(safeCents: number, safeCount: number): CostResult {
  if (!Number.isSafeInteger(safeCents) || !Number.isSafeInteger(safeCount) || safeCents < 0 || safeCount < 0) return { ok: false, reason: "invalid" };
  if (safeCents === 0 || safeCount === 0) return { ok: false, reason: "empty" };
  const un = unTariffFee(safeCount);
  const options: CostOption[] = [
    { id: "self", title: "File it yourself with this tool's CAPE CSV", sourceIds: ["cbp"], status: "confirmed",
      how: "Export the file here, upload it in your ACE Portal account. CBP charges nothing to process the refund. Your time and an ACE account with ACH enrolment are the cost.",
      lines: [line("Free", safeCents, 0)] },
    { id: "untariff", title: "Flat-fee software (un-tariff)", sourceIds: ["untariff"], status: "third-party estimate",
      how: `${un.tier} tier for ${safeCount} ${safeCount === 1 ? "entry" : "entries"}${un.declarations > 1 ? `, ${un.declarations} declarations` : ""}. The fee does not change with the refund.`,
      lines: [line(`${un.tier} flat fee`, safeCents, un.cents)] },
    { id: "tariffi", title: "Contingency recovery (Tariffi)", sourceIds: ["tariffi"], status: "confirmed",
      how: "Paid out of the refund, nothing upfront. Tariffi does not publish what sets the tier, so all three are shown.",
      lines: TARIFFI_PCTS.map((p) => line(`${p}% tier`, safeCents, pctOfCents(safeCents, p))) },
    { id: "broker", title: "A customs broker on contingency", sourceIds: ["brokerUn", "brokerLead"], status: "third-party estimate",
      how: "A range quoted by third parties, not a price list. Ask the broker for a written quote and whether the fee applies to interest.",
      lines: BROKER_PCTS.map((p) => line(`${p}% of the refund`, safeCents, pctOfCents(safeCents, p))) },
  ];
  const paid = options.slice(1).flatMap((o) => o.lines.map((l) => l.keepCents));
  return { ok: true, safeCents, safeCount, options, selfKeepCents: safeCents, paidKeepLowCents: Math.min(...paid), paidKeepHighCents: Math.max(...paid) };
}
