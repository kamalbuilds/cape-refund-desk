import type { Entry, Money } from "./types";

/**
 * Deterministic refund math. No model ever computes dollars.
 *
 * Rules, from CBP's IEEPA refunds page [FAQ] ("My refund amount is not what I expected", updated 10/28/2026):
 *  - Framework agreements (EU, Japan, South Korea, Switzerland/Liechtenstein): the 15% combined rate may sit on one
 *    line. "You will not receive a refund of the total 15% because a portion of that 15% accounts for the
 *    Column 1/General Duty rate which remains in effect." Refund = IEEPA portion = combined - Column 1.
 *  - Duties other than IEEPA (General duty, Section 232, 301, 201) "were and are still applicable"; if they were
 *    underpaid, "the net amount after the proper calculations is what constitutes the IEEPA Refund or duties owed".
 *  - "Can my CAPE Declaration result in a bill? Yes ... if the amount paid on the entry as a whole is less than the
 *    recalculated duty owed" - netting is entry-by-entry (19 CFR 159.1).
 *  - Interest (19 U.S.C. 1505) is added by CBP at liquidation and is NOT estimated here.
 */
export function computeMoney(entry: Entry): Money {
  let gross = 0;
  let carve = 0;
  let underpaid = 0;
  let other = 0;
  const groups = new Set<string>();
  for (const l of entry.lines) {
    underpaid += l.underpaidOtherCents;
    other += l.s232Cents + l.s301Cents + l.s201Cents;
    if (!l.ieepaIndicator) continue;
    gross += l.ieepaDutyCents;
    if (l.frameworkGroup) {
      groups.add(l.frameworkGroup);
      const col1 = Math.round((l.col1RatePct / 100) * l.enteredValueCents);
      carve += Math.min(col1, l.ieepaDutyCents);
    }
  }
  const refundable = gross - carve;
  const net = refundable - underpaid;
  const thin = net >= 0 && refundable > 0 && underpaid * 2 >= refundable;
  return {
    grossIeepaCents: gross,
    frameworkCarveOutCents: carve,
    ieepaRefundableCents: refundable,
    underpaidOtherCents: underpaid,
    netCents: net,
    billCents: Math.max(0, -net),
    netRefundCents: Math.max(0, net),
    thinMargin: thin,
    frameworkGroups: [...groups],
    otherDutyOnEntryCents: other,
  };
}

export function fmtUsd(cents: number, opts: { sign?: boolean } = {}): string {
  const neg = cents < 0;
  const abs = Math.abs(cents) / 100;
  const s = abs.toLocaleString("en-US", { style: "currency", currency: "USD" });
  return neg ? `-${s}` : opts.sign && cents > 0 ? `+${s}` : s;
}
