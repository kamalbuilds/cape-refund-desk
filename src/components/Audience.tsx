"use client";
import { fmtUsd } from "@/lib/money";
import { SAMPLE_STATS as S } from "@/lib/sample-stats";
import { BTN_PRIMARY } from "./ui";

export default function Audience({ onUpload }: { onUpload?: () => void }) {
  const tiles = [
    { k: "safe", n: `${S.safeCount} shipments`, v: fmtUsd(S.safeRefundCents), l: "safe to file now", id: "sample-safe-total" },
    { k: "hold", n: `${S.holdCount} shipments`, v: fmtUsd(S.holdRefundCents), l: "fix one thing first" },
    { k: "bill", n: `${S.billRiskCount} shipments`, v: fmtUsd(S.billRiskBillCents), l: "possible bill, your broker decides" },
    { k: "stop", n: `${S.blockedCount} shipments`, v: "not claimable", l: "Customs would reject them" },
  ];
  return (
    <section className="panel" aria-label="Who this is for" data-testid="audience">
      <h2>Built for small US importers filing a tariff refund</h2>
      <p className="text-sm text-[var(--muted)]">If you paid the struck-down IEEPA tariffs, Customs refunds them through one CSV upload that cannot be edited once accepted. This checks the file first. In the made-up sample of {S.entries} shipments, {fmtUsd(S.safeRefundCents)} is safe to file now, and {S.blockedCount} shipments would have been rejected.</p>
      <div className="grid gap-3 sm:grid-cols-4 my-4">
        {tiles.map((t) => (
          <div key={t.k} className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-xs text-[var(--muted)]">{t.n}</div>
            <div className="text-lg font-semibold text-[var(--text)]" data-testid={t.id}>{t.v}</div>
            <div className="text-xs text-[var(--muted)]">{t.l}</div>
          </div>))}
      </div>
      <p className="fine">Sample data is synthetic. Figures come from the plain-code rules engine, not from the AI.</p>
      {onUpload && <button className={BTN_PRIMARY} onClick={onUpload}>Try it on your own export</button>}
    </section>
  );
}
