"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, Info, ShieldCheck, ShieldAlert, Check } from "lucide-react";
import { CBP_CITES, CHECKED_ON, checkOffer, compareCosts, fmtCents, parseDollarsToCents, type CostRow, type Flag } from "@/lib/offercheck";
import { OFFER_EXAMPLES } from "@/lib/offercheck-examples";
import { recordedExplanationFor } from "@/lib/offercheck-ai";
import { SAMPLE_STATS } from "@/lib/sample-stats";
import "./OfferCheck.css";

const SEV_LABEL = { high: "Red flag", medium: "Look closer", info: "Note" } as const;
const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "not stated" : lo === hi ? fmtCents(lo) : `${fmtCents(lo)} to ${fmtCents(hi)}`);
const DEFAULT_AMOUNT = (SAMPLE_STATS.safeRefundCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function FlagItem({ f }: { f: Flag }) {
  return (
    <li className={`oc-flag oc-${f.severity}`} data-testid="offer-flag" data-flag={f.id} data-severity={f.severity}>
      <div className="oc-flag-head">
        {f.severity === "info" ? <Info size={16} aria-hidden /> : <AlertTriangle size={16} aria-hidden />}
        <span className="oc-sev">{SEV_LABEL[f.severity]}</span>
        <b>{f.title}</b>
      </div>
      <p className="oc-detail">{f.detail}</p>
      {f.evidence.length > 0 && (
        <ul className="oc-ev" aria-label="Where this appears in the offer">
          {f.evidence.map((e, i) => <li key={i}><q>{e}</q></li>)}
        </ul>
      )}
      {f.cites.length > 0 && (
        <div className="oc-cites">
          {f.cites.map((id) => {
            const c = CBP_CITES[id];
            return c ? (
              <blockquote key={id} className="oc-cite" data-testid="offer-cite">
                <p>{c.quote}</p>
                <a href={c.url} target="_blank" rel="noreferrer">{c.source}<ExternalLink size={12} aria-hidden /></a>
              </blockquote>
            ) : null;
          })}
        </div>
      )}
    </li>
  );
}

function CostTable({ rows }: { rows: CostRow[] }) {
  return (
    <div className="oc-table" role="table" aria-label="Example comparison" data-testid="offer-compare">
      <div role="row" className="oc-tr oc-th"><span role="columnheader">Option</span><span role="columnheader">Fee you pay</span><span role="columnheader">You keep</span></div>
      {rows.map((r) => (
        <div role="row" className="oc-tr" key={r.id} data-row={r.id}>
          <span role="cell"><b>{r.label}</b><small>{r.note}{r.published && <> <a href={r.published.url} target="_blank" rel="noreferrer">{r.published.wording}, published prices as of {r.published.asOf}<ExternalLink size={12} aria-hidden /></a></>}</small></span>
          <span role="cell" className="oc-mono" data-testid={`cost-fee-${r.id}`}>{range(r.feeLowCents, r.feeHighCents)}</span>
          <span role="cell" className="oc-mono" data-testid={`cost-keep-${r.id}`}>{range(r.keepLowCents, r.keepHighCents)}</span>
        </div>
      ))}
    </div>
  );
}

export default function OfferCheck() {
  const [text, setText] = useState("");
  const [exampleId, setExampleId] = useState<string | undefined>();
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const report = useMemo(() => checkOffer(text), [text]);
  const cents = parseDollarsToCents(amount);
  const rows = useMemo(() => (cents === null ? null : compareCosts(cents, report.extracted)), [cents, report.extracted]);
  const rec = report.empty ? null : recordedExplanationFor({ exampleId, text });
  const Verdict = report.verdict === "clean" ? ShieldCheck : ShieldAlert;

  return (
    <section className="panel oc" aria-label="Check a recovery firm's offer" data-testid="offercheck" id="offer-check">
      <h2>Got an offer from a refund recovery firm?</h2>
      <p className="fine">Paste the email or contract. The check runs in your browser with plain code, so the text is not uploaded anywhere, and no AI is involved. It lists what the offer says about fees, logins, who gets the money and lock-in, next to what CBP says to watch for.</p>
      <div className="oc-examples" role="group" aria-label="Try an example offer">
        <span className="oc-eg">Try an example</span>
        {OFFER_EXAMPLES.map((e) => (
          <button key={e.id} type="button" className="btn sm" data-testid={`offer-example-${e.id}`} title={e.blurb}
            onClick={() => { setText(e.text); setExampleId(e.id); }}>{e.label}</button>
        ))}
      </div>
      <label className="oc-label" htmlFor="offer-text">Offer text</label>
      <textarea id="offer-text" data-testid="offer-text" className="oc-text" rows={8} spellCheck={false} value={text}
        placeholder="Paste the firm's email or contract terms here"
        onChange={(e) => { setText(e.target.value); setExampleId(undefined); }} />
      {report.truncated && <p className="oc-note">Only the first 20,000 characters were checked.</p>}

      {report.empty ? (
        <p className="fine" data-testid="offer-empty">Nothing checked yet. Paste an offer or pick an example.</p>
      ) : (
        <div data-testid="offer-result" data-verdict={report.verdict}>
          <div className={`oc-verdict oc-v-${report.verdict}`}>
            <Verdict size={18} aria-hidden />
            <div><b data-testid="offer-verdict">{report.verdictLabel}</b><p>{report.verdictLine}</p></div>
          </div>
          {report.flags.length > 0 && <ul className="oc-flags" aria-label="Findings">{report.flags.map((f) => <FlagItem key={f.id} f={f} />)}</ul>}
          {report.good.length > 0 && (
            <ul className="oc-good" aria-label="Good signs" data-testid="offer-good">
              {report.good.map((g) => <li key={g.id}><Check size={14} aria-hidden />{g.text}</li>)}
            </ul>
          )}
          {rec && (
            <div className="oc-ai" data-testid="offer-ai">
              <b>Recorded AI explanation</b>
              <p>{rec.text}</p>
              <small className="oc-mono">{rec.model}, recorded {rec.recordedAt}</small>
            </div>
          )}

          <h3 className="oc-h3">Example comparison</h3>
          <p className="fine">What a refund costs under this offer, versus filing yourself in ACE (CBP charges no fee), versus a published flat-fee tool. Change the amount to your own number.</p>
          <label className="oc-label" htmlFor="offer-amount">Refund amount (USD)</label>
          <input id="offer-amount" data-testid="offer-amount" className="oc-amount oc-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={cents === null} />
          <p className="fine">Defaults to the sample&apos;s safe-to-file total of {fmtCents(SAMPLE_STATS.safeRefundCents)}.</p>
          {rows ? <CostTable rows={rows} /> : <p className="error" data-testid="offer-amount-error">Enter a dollar amount like 25,000 or 25000.00.</p>}
          <p className="fine">Illustrative arithmetic on the numbers above, not a quote. The flat-fee price is from the vendor&apos;s own page, published prices as of {CHECKED_ON}, and may have changed. Fee thresholds are this tool&apos;s yardstick, not CBP&apos;s. Not legal or customs advice.</p>
        </div>
      )}
    </section>
  );
}
