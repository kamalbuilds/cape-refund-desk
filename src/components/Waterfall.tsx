import { fmtUsd } from "@/lib/money";
import type { Money } from "@/lib/types";

/** The refund-vs-bill story as flat 6px bars under the money table: what refunds, what comes off, where you land. */
export default function Waterfall({ m }: { m: Money }) {
  const ref = m.ieepaRefundableCents, under = m.underpaidOtherCents, net = m.netCents;
  const lo = Math.min(0, net), hi = Math.max(ref, 0, net);
  const span = Math.max(hi - lo, 1);
  const x = (v: number) => ((v - lo) / span) * 100;
  const zero = x(0);
  const rows: { key: string; from: number; to: number; tone: string }[] = [
    { key: "ref", from: 0, to: ref, tone: "r" },
  ];
  if (under > 0) rows.push({ key: "under", from: ref - under, to: ref, tone: "u" });
  rows.push({ key: "net", from: Math.min(0, net), to: Math.max(0, net), tone: net < 0 ? "n bill" : "n" });
  return (
    <div className="wf" role="img" aria-label={`Refundable tariff ${fmtUsd(ref)}${under > 0 ? `, minus other duties underpaid ${fmtUsd(under)}` : ""}, leaves ${fmtUsd(net)}.`}>
      <div className="wf-zero" style={{ left: `${zero}%` }} aria-hidden />
      {rows.map((r) => {
        const l = x(Math.min(r.from, r.to)), w = Math.max(x(Math.max(r.from, r.to)) - l, 0.8);
        const toLeft = r.tone.startsWith("u") || r.tone.includes("bill");
        return (
          <div className="wf-row" key={r.key} aria-hidden>
            <div className="wf-track"><i className={`wf-bar ${r.tone}`} style={{ left: `${l}%`, width: `${w}%`, transformOrigin: toLeft ? "right" : "left" }} /></div>
          </div>
        );
      })}
      <div className="wf-axis" style={{ left: `clamp(14px, ${zero}%, calc(100% - 14px))` }} aria-hidden>$0</div>
    </div>
  );
}
