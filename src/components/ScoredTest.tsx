"use client";
import { useEffect, useState } from "react";
import { laneOf } from "@/lib/lanes-ui";
import { LANE_ORDER, pct, type Scored } from "@/lib/score-metrics";
import { BTN_TERTIARY, Id } from "./ui";

interface Payload { asOf: string; method: string; rules: Scored; aiAlone: { label: string; note: string; status: string }; history: { commit: string; before: { correct: number; total: number; accuracy: number }; entries: readonly number[] } }
const title = (l: (typeof LANE_ORDER)[number]) => laneOf(l).title;

export default function ScoredTest() {
  const [d, setD] = useState<Payload | null>(null);
  const [err, setErr] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => { fetch("/api/score").then((r) => (r.ok ? r.json() : Promise.reject())).then(setD).catch(() => setErr(true)); }, []);
  const s = d?.rules.strict;
  return (
    <section className="panel" aria-label="Scored test" data-testid="scored-test">
      <h2>Scored test</h2>
      <p className="fine">Does the rules engine put each shipment in the right group? The {s?.total ?? 69} made-up sample shipments were labelled by hand from Customs&apos; published rules, without reading the engine&apos;s code or output, then the engine was scored against those labels. The sample was built to exercise these rules, so this shows the engine follows the rules, not how it does on a real file.</p>
      {err && <p className="fine">Could not load the scored test.</p>}
      {!d && !err && <p className="fine">Scoring the sample.</p>}
      {d && s && (<>
        <div className="overflow-x-auto">
          <table className="tbl num" style={{ marginTop: 10 }} data-testid="scored-arms">
            <thead><tr><th>Arm</th><th>Status</th><th>Correct group</th><th>Avg precision</th><th>Avg recall</th></tr></thead>
            <tbody>
              <tr data-testid="arm-rules"><td>Rules engine</td><td>Scored</td><td className="num"><Id>{pct(s.accuracy)}</Id> <span className="fine">({s.correct} of {s.total})</span></td><td className="num"><Id>{pct(s.macroPrecision)}</Id></td><td className="num"><Id>{pct(s.macroRecall)}</Id></td></tr>
              <tr data-testid="arm-ai"><td>AI alone</td><td>Pending credit</td><td className="num">Not run</td><td className="num">Not run</td><td className="num">Not run</td></tr>
            </tbody>
          </table>
        </div>
        <p className="fine" style={{ marginTop: 8 }}>{d.aiAlone.note} The AI arm will be scored on the same labels once Token Factory credit is back.</p>

        <p className="fine" style={{ marginTop: 12 }} data-testid="scored-history">
          What this test found: the first run scored the engine {d.history.before.correct} of {d.history.before.total} ({pct(d.history.before.accuracy)}) on the strict count. The misses were shipments {d.history.entries.map((n) => `#${n}`).join(", ")}: the engine sent any other-duty underpayment to &ldquo;{title("NET_BILL_RISK")}&rdquo;, even when the shipment still netted a refund. That rule was fixed in commit <Id>{d.history.commit}</Id>, and the engine now scores {s.correct} of {s.total} ({pct(s.accuracy)}). None of the {s.total} labels were changed to get there.
        </p>

        <h3 className="r6-sub" style={{ marginTop: 16 }}>Where the engine disagrees with the labels ({s.mismatches.length})</h3>
        {s.mismatches.length === 0 ? <p className="fine">No disagreements.</p> : (
          <ul className="space-y-2" data-testid="scored-mismatches">
            {s.mismatches.map((m) => (
              <li key={m.n} className="text-sm text-[var(--muted)]">
                <Id>{m.entryNumber}</Id> Label: {title(m.truth)}. Engine: {title(m.predicted)}. {m.reason}{m.defensible && <> <span className="text-[var(--text)]">The engine&apos;s group is also defensible, so it is a cautious call, not a missed rule.</span></>}
              </li>))}
          </ul>)}
        <p className="fine" style={{ marginTop: 8 }}>With the second defensible group accepted, the engine scores {pct(d.rules.lenient.accuracy)} ({d.rules.lenient.correct} of {d.rules.lenient.total}). The strict number above is the one to quote.</p>

        <button className={BTN_TERTIARY} aria-expanded={more} data-testid="scored-toggle" onClick={() => setMore((v) => !v)}>{more ? "Hide" : "Show"} confusion matrix and scores per group</button>
        {more && (
          <div data-testid="scored-detail">
            <div className="overflow-x-auto">
              <table className="tbl num" style={{ marginTop: 8 }}>
                <thead><tr><th>Group</th><th>Precision</th><th>Recall</th><th>Labelled</th><th>Engine said</th></tr></thead>
                <tbody>{LANE_ORDER.map((l) => { const p = s.perLane[l]; return <tr key={l}><td>{title(l)}</td><td className="num">{pct(p.precision)}</td><td className="num">{pct(p.recall)}</td><td className="num">{p.support}</td><td className="num">{p.predicted}</td></tr>; })}</tbody>
              </table>
            </div>
            <p className="fine" style={{ marginTop: 12 }}>Confusion matrix. Rows are the hand label, columns are what the engine said.</p>
            <div className="overflow-x-auto">
              <table className="tbl num" style={{ marginTop: 4 }} data-testid="confusion-matrix">
                <thead><tr><th>Label \ Engine</th>{LANE_ORDER.map((l) => <th key={l}>{title(l)}</th>)}</tr></thead>
                <tbody>{LANE_ORDER.map((t) => <tr key={t}><td>{title(t)}</td>{LANE_ORDER.map((p) => <td key={p} className="num" style={t === p ? { color: "var(--text)" } : s.matrix[t][p] ? { color: "var(--hold-ink)" } : undefined}>{s.matrix[t][p]}</td>)}</tr>)}</tbody>
              </table>
            </div>
            <p className="fine" style={{ marginTop: 8 }}>How the labels were made: {d.method}</p>
          </div>)}
      </>)}
    </section>
  );
}
