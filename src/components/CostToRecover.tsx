"use client";
import { useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { COST_SOURCES, costToRecover, type CostOption, type SourceStatus } from "@/lib/cost-to-recover";
import { fmtCents } from "@/lib/offercheck";
import "./cost-to-recover.css";

const Status = ({ s }: { s: SourceStatus }) => <span className={`ctr-st ${s === "confirmed" ? "ok" : "est"}`}>{s === "confirmed" ? "Confirmed on the page" : "Third-party estimate"}</span>;

function Option({ o }: { o: CostOption }) {
  return (
    <li className="ctr-opt" data-testid={`ctr-opt-${o.id}`}>
      <div className="ctr-what">
        <b>{o.title}</b>
        <Status s={o.status} />
        <p>{o.how}</p>
      </div>
      <table className="ctr-lines">
        <thead><tr><th scope="col">Plan</th><th scope="col">You pay</th><th scope="col">You keep</th></tr></thead>
        <tbody>
          {o.lines.map((l) => (
            <tr key={l.label} data-testid={`ctr-line-${o.id}`}>
              <th scope="row">{l.label}</th>
              <td className="ctr-n" data-testid="ctr-fee">{fmtCents(l.feeCents)}</td>
              <td className="ctr-n ctr-keep" data-testid="ctr-keep">{fmtCents(l.keepCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </li>
  );
}

/** What the importer keeps from the safe-to-claim total under four ways of getting the refund. Rules-only, no model. */
export default function CostToRecover({ safeCents, safeCount }: { safeCents: number; safeCount: number }) {
  const r = useMemo(() => costToRecover(safeCents, safeCount), [safeCents, safeCount]);
  return (
    <section className="ctr" data-testid="ctr" aria-labelledby="ctr-h">
      <h2 id="ctr-h" className="ctr-title">Cost to recover</h2>
      {!r.ok ? (
        <p className={r.reason === "invalid" ? "ctr-msg err" : "ctr-msg"} role={r.reason === "invalid" ? "alert" : undefined} data-testid={`ctr-${r.reason}`}>
          {r.reason === "empty" ? "No shipments are safe to claim yet, so there is nothing to recover. Fix the flagged ones first and this panel fills in." : "The safe-to-claim total could not be read, so no costs are shown."}
        </p>
      ) : (
        <>
          <p className="ctr-lede" data-testid="ctr-lede">
            On the <b>{r.safeCount}</b> safe-to-claim {r.safeCount === 1 ? "shipment" : "shipments"} (<b className="ctr-n">{fmtCents(r.safeCents)}</b>), filing yourself keeps <b className="ctr-n">{fmtCents(r.selfKeepCents)}</b>.
            The paid routes below keep <b className="ctr-n" data-testid="ctr-range">{fmtCents(r.paidKeepLowCents)} to {fmtCents(r.paidKeepHighCents)}</b>.
          </p>
          <ol className="ctr-opts" aria-label="Ways to recover the refund">
            {r.options.map((o) => <Option key={o.id} o={o} />)}
          </ol>
          <h3 className="ctr-h3">Where each price comes from</h3>
          <ul className="ctr-src" data-testid="ctr-sources">
            {Object.values(COST_SOURCES).map((s) => (
              <li key={s.id} data-testid={`ctr-src-${s.id}`}>
                <a href={s.url} target="_blank" rel="noreferrer">{s.label}<ExternalLink size={12} aria-hidden /></a>
                <span className="ctr-meta"><Status s={s.status} /> Read <time dateTime={s.readOn}>{s.readOn}</time></span>
                <p>{s.says}{s.caveat ? ` ${s.caveat}` : ""}</p>
              </li>
            ))}
          </ul>
          <p className="ctr-fine">Fees are applied to the safe-to-claim principal. CBP adds interest at liquidation and this tool does not estimate it, so a percentage fee on the real refund is slightly higher. Illustrative arithmetic, not a quote. Not legal or customs advice.</p>
        </>
      )}
    </section>
  );
}
