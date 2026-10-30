"use client";
import { useEffect, useMemo, useState } from "react";
import { fmtUsd } from "@/lib/money";
import { parseEs003 } from "@/lib/parse";
import { rescore, SCENARIOS } from "@/lib/rescore";
import { SOURCE_PANEL } from "@/lib/sources";
import { laneOf } from "@/lib/lanes-ui";
import type { Lane } from "@/lib/types";
import { BTN_TERTIARY, Id } from "./ui";

const ORDER: Lane[] = ["FILE_NOW", "WAIT", "NET_BILL_RISK", "BLOCKED"];
const sgn = (c: number) => `${c < 0 ? "-" : "+"}${fmtUsd(Math.abs(c))}`;

export default function RuleRescore({ csvText, asOf, filerCodes, isSample }: { csvText: string; asOf: string; filerCodes: string[]; isSample: boolean }) {
  const [fetched, setFetched] = useState("");
  const [sel, setSel] = useState(SCENARIOS[0].id);
  const [all, setAll] = useState(false);
  useEffect(() => {
    if (isSample && !csvText && !fetched) fetch("/api/sample?f=csv").then((r) => r.text()).then(setFetched).catch(() => {});
  }, [isSample, csvText, fetched]);
  const text = csvText || fetched;
  const res = useMemo(() => {
    if (!text) return null;
    try {
      const { entries } = parseEs003(text);
      return rescore(entries, { asOf, filerCodes }, SCENARIOS.find((s) => s.id === sel) ?? SCENARIOS[0]);
    } catch { return "error" as const; }
  }, [text, asOf, filerCodes, sel]);
  const sc = SCENARIOS.find((s) => s.id === sel) ?? SCENARIOS[0];
  const src = SOURCE_PANEL.find((s) => s.id === sc.sourceId);
  return (
    <section className="panel" aria-label="Rule change re-score" data-testid="rescore">
      <h2>A rule changed. What moves?</h2>
      <p className="fine">The same plain-code engine runs twice on the same file, once under the old rule and once under the new one. The difference is exact and no AI is involved.</p>
      <div role="radiogroup" aria-label="Rule change" className="flex flex-wrap gap-2 my-3">
        {SCENARIOS.map((s) => (
          <button key={s.id} role="radio" aria-checked={s.id === sel} data-testid={`rescore-scenario-${s.id}`} onClick={() => { setSel(s.id); setAll(false); }}
            className={`rounded-lg border px-3 py-2 text-left text-sm ${s.id === sel ? "border-[var(--accent-line)] bg-[var(--raised)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>
            <span className="inline-block rounded-full border border-[var(--border)] px-2 text-xs mr-2">{s.kind === "real" ? "Real CBP change" : "What-if simulation, not CBP guidance"}</span>
            {s.title.replace(/^(Real CBP change|What-if \(simulation\)): /, "")}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--muted)]">{sc.kind === "whatif" && <b className="font-medium text-[var(--text)]">Simulation. </b>}{sc.summary}{src && <> <a className="src" href={src.url} target="_blank" rel="noreferrer">{src.label}</a></>}</p>
      {res === "error" && <p className="fine">Could not read this file to re-score it.</p>}
      {!res && <p className="fine">Loading the sample to re-score.</p>}
      {res && res !== "error" && (<>
        <p className="mt-3 text-sm text-[var(--text)]" data-testid="rescore-headline">{res.moves.length === 0 ? "No shipment changes group under this rule." : `Safe to file changes by ${sgn(res.safeRefundDeltaCents)} across ${res.moves.length} shipment${res.moves.length === 1 ? "" : "s"}.`}</p>
        <table className="tbl" style={{ marginTop: 10 }}>
          <thead><tr><th>Group</th><th className="num">Before</th><th className="num">After</th><th className="num">Change</th><th className="num">Refund before</th><th className="num">Refund after</th></tr></thead>
          <tbody>{ORDER.map((l) => { const d = res.lanes[l]; const ch = d.afterCount - d.beforeCount; return (
            <tr key={l}><td>{laneOf(l).title}</td><td className="num">{d.beforeCount}</td><td className="num">{d.afterCount}</td><td className="num" style={{ fontWeight: ch ? 600 : 400 }}>{ch > 0 ? `+${ch}` : ch}</td><td className="num">{fmtUsd(d.beforeRefundCents)}</td><td className="num">{fmtUsd(d.afterRefundCents)}</td></tr>); })}</tbody>
        </table>
        {res.moves.length > 0 && <ul className="mt-3 space-y-2">
          {(all ? res.moves : res.moves.slice(0, 12)).map((m) => (
            <li key={m.entryIdx} data-testid="rescore-move" className="text-sm text-[var(--muted)]">
              <Id>{m.displayNumber}</Id> {laneOf(m.from).title} {"->"} {laneOf(m.to).title}. {m.why}{" "}
              {m.safeRefundDeltaCents !== 0 && <span className={m.safeRefundDeltaCents > 0 ? "text-[var(--go-ink)]" : "text-[var(--stop-ink)]"}>{sgn(m.safeRefundDeltaCents)}</span>}
            </li>))}
        </ul>}
        {!all && res.moves.length > 12 && <button className={BTN_TERTIARY} onClick={() => setAll(true)}>Show all {res.moves.length}</button>}
      </>)}
    </section>
  );
}
