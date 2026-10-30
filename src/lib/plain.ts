// Plain-English layer for the UI. The engine (validate.ts) stays in Customs' own terms and is the source of truth;
// this file only translates what it found for people who have never heard of CBP, CAPE or IEEPA.
import { fmtUsd } from "./money";
import type { Lane, Verdict } from "./types";

export const PLAIN_FINDING: Record<string, { title: string; what: string }> = {
  NOT_11: { title: "The entry number is malformed", what: "Customs entry numbers have exactly 11 letters and digits. This one doesn't, so Customs can't find it." },
  FILER_CODE: { title: "This shipment belongs to a different broker or account", what: "The first 3 characters of an entry number say who filed it. Only that filer can include it." },
  DUPLICATE: { title: "This shipment is listed twice", what: "Each shipment can be in the refund file only once." },
  NOT_FOUND: { title: "Customs can't find this shipment", what: "The entry isn't in Customs' system (or has been archived)." },
  CANCELLED: { title: "The paperwork for this shipment isn't in 'Accepted' status", what: "Customs only refunds shipments whose paperwork is accepted." },
  TYPE_NOT_ALLOWED: { title: "This kind of import isn't allowed in the refund program", what: "Some import types (warehouse storage, temporary imports, duty deferral, drawback and reconciliation) are excluded." },
  DRAWBACK: { title: "Already part of a different refund claim", what: "This shipment is already on a 'drawback' claim, which is a separate duty refund program." },
  RECON_FILED: { title: "A related filing is already in progress", what: "A 'reconciliation' filing covers this shipment, and Customs isn't taking those in this round." },
  FINAL_LIQ: { title: "Too late: Customs finalized this more than 80 days ago", what: "The refund program only takes shipments Customs finalized in the last 80 days." },
  TRADE_CONTROL: { title: "Customs isn't holding this file right now", what: "The paperwork is with another office, so Customs can't process it yet." },
  INJUNCTION: { title: "A court order covers this shipment", what: "It's flagged under a court injunction." },
  SUSPENSION: { title: "Customs has paused this shipment's final review", what: "There's a 'suspension' on record, which has to clear first." },
  UNDER_REVIEW: { title: "Customs is still reviewing this shipment", what: "The paperwork was changed and is under review." },
  PROTEST: { title: "There's an open appeal on this shipment", what: "A 'protest' (an appeal to Customs) is open or suspended on it. Customs rejects those." },
  STATEMENT: { title: "A payment is still being processed", what: "The shipment is on a payment statement that hasn't finished processing." },
  NO_IEEPA: { title: "No struck-down tariff was paid on this shipment", what: "There's nothing to refund." },
  VALUE_ON_HTS: { title: "A tariff line has a data error to correct", what: "A tariff-code line shows a goods value it shouldn't, so a correction has to be filed first." },
  INVALID_HTS: { title: "A product code was out of date", what: "A line used a product (tariff) code that had expired on that date. Replace it with a correction first." },
  HTS_RELATIONSHIP: { title: "A product code is missing its partner code", what: "Some tariff codes must come in pairs. File a correction to add the missing one." },
  PSC_FIRST: { title: "A correction has to be filed before claiming", what: "There's a pending correction (a 'post-summary correction'). After this refund file is accepted, corrections on the shipment are blocked, so file it first." },
  RECON_FIRST: { title: "A related filing is due soon and goes first", what: "A 'reconciliation' filing is due in under 30 days. Your broker decides: file that first (the shipment then leaves this refund round), or claim now, because Customs accepts these shipments even before the related filing is made." },
};

export function plainTitle(code: string, fallback: string): string {
  return PLAIN_FINDING[code]?.title ?? fallback;
}

export function plainStep(step: string, asOf?: string): string {
  let m: RegExpMatchArray | null;
  if (step === "Do not include in a declaration") return "Leave out of the file";
  if (/^Step 0: PSC first/.test(step)) return "First: file a correction, then re-check";
  if (/^Step 0: Recon first/.test(step)) return "First: finish the related filing (due in under 30 days)";
  if (/^Hold: clear the CBP error/.test(step)) return "Hold: fix the Customs error, then re-check";
  if (/^Broker decision/.test(step)) return "Your broker decides: could turn into a bill, can't be undone";
  if ((m = step.match(/^Step 1: file now, CAPE window closes in (-?\d+) days?/))) return Number(m[1]) === 0 ? (asOf ? `Claim now: the window closes on ${asOf}, the date of this data` : "Claim now: the window closes on the as-of date") : `Claim now: the window closes in ${m[1]} days`;
  if (/^Step 2:/.test(step)) return "Claim now, before the related filing goes in";
  if (/^Step 3:/.test(step)) return "Claim now, before the drawback claim";
  if (/^Step 4:/.test(step)) return "Claim now (Customs hasn't finalized it yet)";
  return step;
}

/** One sentence a non-expert can act on. Figures come from the deterministic engine only. */
export function plainVerdict(v: Verdict): string {
  const m = v.money;
  const first = v.findings[0];
  const title = first ? plainTitle(first.code, first.detail) : "";
  switch (v.lane) {
    case "NET_BILL_RISK":
      return m.netCents < 0
        ? `Claiming this one would cost you ${fmtUsd(-m.netCents)}, not refund you.`
        : `Claiming this one refunds about ${fmtUsd(m.netCents)}, but Customs may also bill you ${fmtUsd(m.underpaidOtherCents)} for other duties you underpaid. Your broker should decide.`;
    case "FILE_NOW": {
      const left = v.deadlines.capeDaysLeft;
      const late = left !== null && left >= 0 && left <= 14 ? ` The window closes in ${left} day${left === 1 ? "" : "s"}.` : "";
      return `Safe to claim: about ${fmtUsd(m.ieepaRefundableCents)} back, and Customs' checks found nothing wrong.${late}`;
    }
    case "WAIT":
      return `Don't claim this yet. ${title}. Fix that first, then it can go in.`;
    default:
      return `Leave this one out. ${title}, so Customs would reject it.`;
  }
}
