import { fmtUsd, type Extracted } from "@/lib/offercheck";

/** The terms the check read out of the pasted text, one line each, so the flags below can be checked against them. */
export function offerTerms(x: Extracted): { key: string; label: string; value: string; warn: boolean }[] {
  const fee = x.feePct ? (x.feePct.low === x.feePct.high ? `${x.feePct.high}% of the refund` : `${x.feePct.low}% to ${x.feePct.high}% of the refund`)
    : x.flatFeeUsd !== null ? `${fmtUsd(x.flatFeeUsd)} flat` : x.perEntryUsd !== null ? `${fmtUsd(x.perEntryUsd)} per filing` : "not found";
  const upfront = x.upfrontUsd !== null ? fmtUsd(x.upfrontUsd) : x.upfrontMentionedNoAmount ? "mentioned, no amount" : x.noUpfrontStated ? "none (stated)" : "none found";
  const asks = [x.credentials.password.length || x.credentials.aceAccess.length ? "ACE login" : "", x.credentials.bankDetails.length || x.payment.changeAch.length ? "bank details or ACH change" : "", x.credentials.ssn.length ? "ID or SSN" : ""].filter(Boolean);
  const e = x.exclusivity;
  const term = [e.termMonths ? `${e.termMonths} months` : "", e.exclusive.length ? "exclusive" : "", e.autoRenew ? "auto-renews" : "", e.tail.length ? "fee survives exit" : ""].filter(Boolean).join(", ") || (e.canCancel ? "cancel any time" : "not stated");
  return [
    { key: "fee", label: "Fee", value: fee, warn: false },
    { key: "upfront", label: "Upfront fee", value: upfront, warn: x.upfrontUsd !== null || x.upfrontMentionedNoAmount },
    { key: "minimum", label: "Minimum fee", value: x.minimumFeeUsd !== null ? fmtUsd(x.minimumFeeUsd) : "none found", warn: x.minimumFeeUsd !== null },
    { key: "asks", label: "Asks for", value: asks.length ? asks.join(", ") : "no login or bank details", warn: asks.length > 0 },
    { key: "term", label: "Term", value: term, warn: (e.termMonths ?? 0) >= 12 || e.exclusive.length > 0 || e.autoRenew || e.tail.length > 0 },
  ];
}

export default function OfferTerms({ x }: { x: Extracted }) {
  return (
    <dl className="oc-terms" aria-label="Terms found in the offer" data-testid="offer-terms">
      {offerTerms(x).map((t) => (
        <div key={t.key} className={t.warn ? "oc-term warn" : "oc-term"} data-testid={`offer-term-${t.key}`}>
          <dt>{t.label}</dt>
          <dd className="oc-mono">{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}
