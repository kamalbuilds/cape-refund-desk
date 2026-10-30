"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ExternalLink, ShieldCheck, ShieldAlert, Check } from "lucide-react";
import { CBP_CITES, CHECKED_ON, checkOffer, compareCosts, fmtCents, parseDollarsToCents, type CostRow, type Flag } from "@/lib/offercheck";
import { OFFER_EXAMPLES } from "@/lib/offercheck-examples";
import { recordedExplanationFor } from "@/lib/offercheck-ai";
import { SAMPLE_STATS } from "@/lib/sample-stats";
import OfferTerms from "./OfferTerms";
import "./OfferCheck.css";

const SEV_LABEL = { high: "Red flag", medium: "Look closer", info: "Note" } as const;
const range = (lo: number | null, hi: number | null) => (lo === null || hi === null ? "not stated" : lo === hi ? fmtCents(lo) : `${fmtCents(lo)} to ${fmtCents(hi)}`);
const DEFAULT_AMOUNT = (SAMPLE_STATS.safeRefundCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const FRAGMENT_MAX = 72;
const short = (t: string) => { const one = t.replace(/\s+/g, " ").trim(); return one.length > FRAGMENT_MAX ? one.slice(0, FRAGMENT_MAX - 1).trimEnd() + "\u2026" : one; };

/** One line per finding (chip, title, one short quote). Click to open the full quotes and CBP's own words. */
function FlagItem({ f }: { f: Flag }) {
  const frag = f.evidence[0] ? short(f.evidence[0]) : null;
  return (
    <li className={`oc-flag oc-${f.severity}`} data-testid="offer-flag" data-flag={f.id} data-severity={f.severity}>
      <details>
        <summary className="oc-row" data-testid="offer-flag-toggle">
          <span className="oc-sev">{SEV_LABEL[f.severity]}</span>
          <b className="oc-title" title={f.title}>{f.title}</b>
          {frag && <q className="oc-frag" data-testid="offer-frag">{frag}</q>}
          <ChevronDown className="oc-chev" size={16} aria-hidden />
        </summary>
        <div className="oc-more" data-testid="offer-flag-more">
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
        </div>
      </details>
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
  const counts = useMemo(() => ({ high: report.flags.filter((f) => f.severity === "high").length, medium: report.flags.filter((f) => f.severity === "medium").length, info: report.flags.filter((f) => f.severity === "info").length }), [report.flags]);
  const Verdict = report.verdict === "clean" ? ShieldCheck : ShieldAlert;

  return (
    <section className="panel oc" aria-label="Check a recovery firm's offer" data-testid="offercheck" id="offer-check">
      <h2 className="oc-h2">Got an offer from a refund recovery firm?</h2>
      <p className="fine">Paste the email or contract. The check runs in your browser with plain code, so the text is not uploaded anywhere, and no AI is involved. It lists what the offer says about fees, logins, who gets the money and lock-in, next to what CBP says to watch for.</p>
      <p className="fine oc-cbp" data-testid="offer-cbp-source">CBP&apos;s published position: &ldquo;No. CBP does not charge any fees for processing tariff refunds.&rdquo; <a href={CBP_CITES["no-fees"].url} target="_blank" rel="noreferrer">CBP IEEPA Duty Refunds page, FAQ on fees<ExternalLink size={12} aria-hidden /></a>, read {CHECKED_ON}. CBP also warns about third parties in its <a href={CBP_CITES["only-ace"].url} target="_blank" rel="noreferrer">CAPE Refund Fraud fact sheet<ExternalLink size={12} aria-hidden /></a>.</p>
      <div className="oc-examples" role="group" aria-label="Try an example offer">
        <span className="oc-eg">Try a synthetic example</span>
        {OFFER_EXAMPLES.map((e) => (
          <button key={e.id} type="button" className="btn sm" data-testid={`offer-example-${e.id}`} title={e.blurb}
            onClick={() => { setText(e.text); setExampleId(e.id); }}>{e.label}</button>
        ))}
      </div>
      {exampleId && <p className="oc-synth" data-testid="offer-synthetic">Synthetic example: invented text, no real firm or person.</p>}
      <label className="oc-label" htmlFor="offer-text">Offer text</label>
      <textarea id="offer-text" data-testid="offer-text" className="oc-text" rows={6} spellCheck={false} value={text}
        placeholder="Paste the firm's email or contract terms here"
        onChange={(e) => { setText(e.target.value); setExampleId(undefined); }} />
      {report.truncated && <p className="oc-note">Only the first 20,000 characters were checked.</p>}

      {report.empty ? (
        <p className="fine" data-testid="offer-empty">Nothing checked yet. Paste an offer or pick an example.</p>
      ) : (
        <div data-testid="offer-result" data-verdict={report.verdict}>
          <div className={`oc-verdict oc-v-${report.verdict}`}>
            <Verdict size={18} aria-hidden />
            <div className="oc-vtext"><b data-testid="offer-verdict">{report.verdictLabel}</b><p>{report.verdictLine}</p></div>
            <div className="oc-counts" data-testid="offer-counts" aria-label="Finding counts">
              <span className="oc-count oc-mono"><b>{report.flags.length}</b> {report.flags.length === 1 ? "finding" : "findings"}</span>
              {counts.high > 0 && <span className="oc-count oc-mono oc-c-high"><b>{counts.high}</b> red flag{counts.high === 1 ? "" : "s"}</span>}
              {counts.medium > 0 && <span className="oc-count oc-mono oc-c-medium"><b>{counts.medium}</b> look closer</span>}
              {counts.info > 0 && <span className="oc-count oc-mono"><b>{counts.info}</b> note{counts.info === 1 ? "" : "s"}</span>}
            </div>
          </div>
          <OfferTerms x={report.extracted} />
          <div className="oc-grid">
            <div className="oc-col-flags">
              {report.flags.length > 0 && (
                <>
                  <p className="oc-hint">Click a finding for the full quotes and what CBP says.</p>
                  <ul className="oc-flags" aria-label="Findings">{report.flags.map((f) => <FlagItem key={f.id} f={f} />)}</ul>
                </>
              )}
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
            </div>
            <div className="oc-col-cost">
              <h3 className="oc-h3">Example comparison</h3>
              <p className="fine">What a refund costs under this offer, versus filing yourself in ACE (CBP charges no fee), versus a published flat-fee tool.</p>
              <label className="oc-label" htmlFor="offer-amount">Refund amount (USD)</label>
              <input id="offer-amount" data-testid="offer-amount" className="oc-amount oc-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={cents === null} />
              <p className="fine">Defaults to the sample&apos;s safe-to-file total of {fmtCents(SAMPLE_STATS.safeRefundCents)}.</p>
              {rows ? <CostTable rows={rows} /> : <p className="error" data-testid="offer-amount-error">Enter a dollar amount like 25,000 or 25000.00.</p>}
              <p className="fine">Illustrative arithmetic, not a quote. The flat-fee price is from the vendor&apos;s own page, published prices as of {CHECKED_ON}, and may have changed. Fee thresholds are this tool&apos;s yardstick, not CBP&apos;s. Not legal or customs advice.</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
