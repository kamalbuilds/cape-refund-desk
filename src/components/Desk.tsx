"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERROR_DEFINITIONS, FILING_ORDER_RULES, SOURCES } from "@/lib/cbp-rules";
import { browserBoard } from "@/lib/browser-board";
import { buildCapeFiles, deadlineCsv, defaultInclude, DISCLAIMER, handoffNote, IRREVERSIBLE, PREPARED_FOR } from "@/lib/export";
import { fmtUsd } from "@/lib/money";
import type { Explanation, PortfolioNote, Receipt, RunEvent, RunResult } from "@/lib/pipeline";
import type { WatchResult, Change } from "@/lib/rulewatch";
import type { Lane, Verdict } from "@/lib/types";

type Board = Omit<RunResult, "receipt" | "explanations" | "portfolioNote">;
const LANES: { id: Lane; title: string; sub: string; tone: string }[] = [
  { id: "FILE_NOW", title: "Cleared to file", sub: "No CBP error found by the checks below", tone: "go" },
  { id: "WAIT", title: "Hold: fix first", sub: "PSC, Recon or a CBP error comes first", tone: "hold" },
  { id: "NET_BILL_RISK", title: "Broker decision", sub: "May net to a bill after recalculation", tone: "bill" },
  { id: "BLOCKED", title: "Do not include", sub: "ACE would reject these", tone: "stop" },
];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (c: number) => fmtUsd(c);
function download(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const today = () => new Date().toISOString().slice(0, 10);

export default function Desk() {
  const [board, setBoard] = useState<Board | null>(null);
  const [expl, setExpl] = useState<Record<string, Explanation>>({});
  const [pnote, setPnote] = useState<PortfolioNote | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [prog, setProg] = useState({ l: [0, 0], u: [0, 0] });
  const [stage, setStage] = useState<"idle" | "lightning" | "ultra" | "done">("idle");
  const [mode, setMode] = useState<"" | "replay" | "live" | "browser">("");
  const [err, setErr] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [ack, setAck] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [filer, setFiler] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [liveOk, setLiveOk] = useState<boolean | null>(null);
  const t0 = useRef(0);

  const reset = () => { setBoard(null); setExpl({}); setPnote(null); setReceipt(null); setProg({ l: [0, 0], u: [0, 0] }); setSel(null); setAck(false); setErr(""); };

  const apply = useCallback((e: RunEvent) => {
    if (e.type === "start") { setStage("lightning"); setProg((p) => ({ ...p, l: [0, e.lightningTotal || e.entries] })); }
    else if (e.type === "lightning") setProg((p) => ({ ...p, l: [e.done, e.total] }));
    else if (e.type === "board") { setBoard(e.result); setInclude(defaultInclude(e.result.portfolio)); setStage("ultra"); }
    else if (e.type === "ultra-plan") setProg((p) => ({ ...p, u: [0, e.total] }));
    else if (e.type === "ultra") { setExpl((x) => ({ ...x, [e.id]: e.explanation })); setProg((p) => ({ ...p, u: [e.done, e.total] })); }
    else if (e.type === "portfolio-note") setPnote(e.note);
    else if (e.type === "done") { setExpl(e.result.explanations); setPnote(e.result.portfolioNote); setReceipt(e.result.receipt); setStage("done"); }
    else if (e.type === "error") { setErr(e.message); setStage("done"); }
  }, []);

  async function replay() {
    reset(); setMode("replay"); t0.current = Date.now();
    const r = (await (await fetch("/api/sample")).json()) as RunResult;
    const n = r.receipt.lightning.calls;
    apply({ type: "start", entries: r.portfolio.verdicts.length, lightningTotal: n });
    for (let i = 1; i <= n; i++) { apply({ type: "lightning", done: i, total: n, lastMs: 0 }); await sleep(18); }
    const { receipt: _r, explanations, portfolioNote, ...base } = r; void _r;
    apply({ type: "board", result: base });
    const ids = Object.keys(explanations);
    apply({ type: "ultra-plan", total: ids.length });
    for (let i = 0; i < ids.length; i++) { apply({ type: "ultra", id: ids[i], done: i + 1, total: ids.length, explanation: explanations[ids[i]] }); await sleep(70); }
    if (portfolioNote) apply({ type: "portfolio-note", note: portfolioNote });
    apply({ type: "done", result: { ...r, receipt: { ...r.receipt, mode: "replay" } } });
  }

  async function live(useSample: boolean) {
    reset(); setMode("live"); t0.current = Date.now();
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(useSample ? { sample: true } : { csv: csvText, asOf, filerCodes: filer ? [filer] : [] }) });
      if (!res.ok || !res.body) { const j = await res.json().catch(() => ({})); setErr(j.error ?? `Request failed (${res.status})`); setStage("idle"); return; }
      const rd = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        let i; while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) apply(JSON.parse(line) as RunEvent); }
      }
    } catch (e) { setErr(e instanceof Error ? e.message : "Run failed"); setStage("done"); }
  }

  function inBrowser() {
    reset(); setMode("browser");
    const codes = filer ? [filer.toUpperCase()] : [];
    const guess = codes.length ? codes : [(csvText.match(/(?:^|[\r\n,'"])([A-Z0-9]{3})[A-Z0-9-]{8,12}/m) ?? [])[1] ?? ""];
    try {
      const b = browserBoard(csvText, asOf, guess.filter(Boolean), `Your file${fileName ? ` (${fileName})` : ""}. Checked in this browser only; nothing was uploaded.`);
      setBoard(b); setInclude(defaultInclude(b.portfolio)); setStage("done");
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not read that file"); }
  }

  async function onFile(f: File | null) {
    if (!f) return;
    if (f.size > 1_000_000) { setErr("That file is over 1MB. CBP's own CAPE limit is 1MB; split it first."); return; }
    setCsvText(await f.text()); setFileName(f.name); setErr("");
  }
  useEffect(() => { fetch("/api/run").then((r) => r.json()).then((j) => setLiveOk(!!j.live)).catch(() => setLiveOk(false)); }, []);

  useEffect(() => { const q = new URLSearchParams(window.location.search); if (q.get("demo") === "replay") void replay(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const running = stage === "lightning" || stage === "ultra";
  const verdicts = board?.portfolio.verdicts ?? [];
  const selV = verdicts.find((v) => v.id === sel) ?? null;
  const files = useMemo(() => (board ? buildCapeFiles(verdicts, include) : []), [board, verdicts, include]);
  const incV = verdicts.filter((v) => include.has(v.id));
  const incRefund = incV.reduce((s, v) => s + v.money.netRefundCents, 0);
  const incBill = incV.reduce((s, v) => s + v.money.billCents, 0);

  const toggle = (id: string) => setInclude((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <div className="mark" aria-hidden>CAPE</div>
          <div>
            <h1>CAPE Refund Desk</h1>
            <p>The pre-flight check before an irreversible CAPE upload.</p>
          </div>
        </div>
        <div className="powered">
          <span className="chip">Nemotron 3 Ultra: reasoning</span>
          <span className="chip">Nemotron 3.5 Lightning: normalizing</span>
          <span className="chip dim">Nebius Token Factory</span>
        </div>
      </header>

      <div className="irrev" role="alert">
        <strong>Irreversible.</strong> {IRREVERSIBLE}
        <span className="prepared">{PREPARED_FOR}</span>
      </div>

      <section className="panel intro">
        <div className="intro-copy">
          <h2>Know which entries to hold before you press upload.</h2>
          <p>
            For importers of record (IOR) and their licensed customs brokers. Feed it an ACE ES-003 export with ES-701 liquidation dates. Deterministic code checks every entry against CBP&apos;s published CAPE rules and error table, computes the money in cents, and orders the filing steps.
            Nemotron Lightning normalizes the messy columns and broker notes; Nemotron Ultra explains and ranks. <b>The models never decide eligibility or touch a dollar figure.</b>
          </p>
          <p className="fine">Built for the long tail of small importers who file by CSV and cannot afford a wrong declaration. We never ask for ACE credentials, bank details or an EIN. Your broker or IOR uploads to ACE.</p>
        </div>
        <div className="runbox">
          <div className="runrow">
            <button className="btn primary" disabled={running} onClick={replay}>▶ Run the sample (recorded real run)</button>
            <button className="btn" disabled={running || liveOk === false} onClick={() => live(true)} title={liveOk === false ? "Live runs are disabled on this host" : "Calls Token Factory now: about 20 seconds"}>⚡ Run live on Token Factory</button>
          </div>
          <div className="uploadrow">
            <label className="file">
              <input type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
              <span>{fileName ? `📄 ${fileName}` : "Upload your ES-003 CSV…"}</span>
            </label>
            <input className="mini" placeholder="Filer code (3)" maxLength={3} value={filer} onChange={(e) => setFiler(e.target.value.toUpperCase())} aria-label="Filer code" />
            <input className="mini date" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} aria-label="As-of date" />
          </div>
          <div className="runrow">
            <button className="btn" disabled={running || !csvText} onClick={inBrowser}>Check in this browser (no upload)</button>
            <button className="btn" disabled={running || !csvText || liveOk === false} onClick={() => live(false)}>Check with Lightning + Ultra</button>
            <a className="link" href="/api/sample?f=csv">Download the synthetic sample CSV</a>
          </div>
          <p className="fine">The sample is <b>synthetic: realistic made-up entries</b> shaped like ES-003 + ES-701, not real trade data. Uploaded files are processed in memory and never stored.</p>
          {err && <p className="error">{err}</p>}
        </div>
      </section>

      {(running || stage === "done") && board === null && stage !== "done" && (
        <Progress prog={prog} stage={stage} />
      )}
      {board && (
        <>
          {(running || stage === "done") && mode !== "browser" && <Progress prog={prog} stage={stage} />}
          <div className="datalabel">
            <span className="tag">{mode === "replay" ? "Recorded run" : mode === "live" ? "Live run" : "Browser-only check"}</span> {board.label}
          </div>

          <section className="totals">
            {LANES.map((l) => {
              const t = board.portfolio.lanes[l.id];
              return (
                <div key={l.id} className={`tot ${l.tone}`}>
                  <div className="tot-n">{t.count}</div>
                  <div className="tot-t">{l.title}</div>
                  <div className="tot-m">{l.id === "NET_BILL_RISK" ? `${money(t.refundCents)} refundable, up to ${money(t.billCents)} bills` : `${money(t.refundCents)} IEEPA duty`}</div>
                </div>
              );
            })}
          </section>

          {pnote && (
            <section className="panel note">
              <div className="eyebrow">Ultra portfolio read <span className="cid">{pnote.completionId}</span></div>
              <p className="headline">{pnote.headline}</p>
              <div className="cols">
                <ul>{pnote.priorities.map((p) => <li key={p.id}><button className="linkbtn" onClick={() => setSel(p.id)}>{verdicts.find((v) => v.id === p.id)?.displayNumber ?? p.id}</button> {p.reason}</li>)}</ul>
                <div><b>Ask the IOR before upload</b><ul>{pnote.brokerQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
              </div>
            </section>
          )}

          <section className="lanes">
            {LANES.map((l) => {
              const list = verdicts.filter((v) => v.lane === l.id);
              return (
                <div key={l.id} className={`lane ${l.tone}`}>
                  <div className="lane-h"><h3>{l.title}</h3><span>{list.length}</span></div>
                  <p className="lane-s">{l.sub}</p>
                  <div className="cards">
                    {list.map((v) => (
                      <Card key={v.id} v={v} ex={expl[v.id]} checked={include.has(v.id)} canInclude={v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK"} onToggle={() => toggle(v.id)} onOpen={() => setSel(v.id)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          <section className="two">
            <div className="panel">
              <div className="eyebrow">Filing order</div>
              <p className="fine">CBP&apos;s sequencing rules, applied by code. Click a row for the reason.</p>
              <ol className="order">
                {verdicts.filter((v) => v.lane !== "BLOCKED").map((v) => (
                  <li key={v.id} onClick={() => setSel(v.id)} className={v.lane.toLowerCase()}>
                    <span className="n">{v.order}</span>
                    <span className="e">{v.displayNumber}</span>
                    <span className="s">{v.filingStep}</span>
                    <span className="m">{money(v.money.netCents)}</span>
                  </li>
                ))}
              </ol>
              <details className="rules"><summary>The rules behind the order (quoted from CBP)</summary>
                {FILING_ORDER_RULES.map((r) => <p key={r.id}><b>{r.rule}</b><br /><i>&ldquo;{r.quote}&rdquo;</i> <a href={SOURCES[r.sourceId].url} target="_blank" rel="noreferrer">{r.sourceId}</a></p>)}
              </details>
            </div>
            <div className="stack">
              <Export board={board} include={include} incRefund={incRefund} incBill={incBill} files={files} ack={ack} setAck={setAck} />
              {board.portfolio.iors.length > 0 && (
                <div className="panel">
                  <div className="eyebrow">IOR debts that may absorb the refund (19 CFR 24.72)</div>
                  <table className="tbl"><thead><tr><th>IOR</th><th>Open debt</th><th>Eligible refund</th><th>Likely offset</th></tr></thead>
                    <tbody>{board.portfolio.iors.map((i) => <tr key={i.ior}><td>{i.ior}</td><td>{money(i.openDebtCents)}</td><td>{money(i.eligibleRefundCents)}</td><td className="warn">{money(i.expectedDiversionCents)}</td></tr>)}</tbody></table>
                  <p className="fine">CBP checks for unpaid debts owed by the IOR before issuing a refund. Interest (19 U.S.C. 1505) is added by CBP and is not estimated here.</p>
                </div>
              )}
            </div>
          </section>

          <RuleWatch />
          <ReceiptPanel receipt={receipt} board={board} mode={mode} />
        </>
      )}
      {!board && <RuleWatch />}

      <footer className="foot">
        <p><b>{DISCLAIMER}</b> Uses realistic sample entries unless you upload your own. Not affiliated with or endorsed by U.S. Customs and Border Protection.</p>
        <p>
          Checks mirror CBP&apos;s published CAPE material:{" "}
          {Object.entries(SOURCES).map(([k, s], i) => <span key={k}>{i ? ", " : ""}<a href={s.url} target="_blank" rel="noreferrer">{k}</a></span>)}. MIT licensed.
        </p>
      </footer>

      {selV && board && <Drawer v={selV} board={board} ex={expl[selV.id]} onClose={() => setSel(null)} included={include.has(selV.id)} onToggle={() => toggle(selV.id)} />}
    </div>
  );
}

/* ---------- pieces ---------- */
function Progress({ prog, stage }: { prog: { l: number[]; u: number[] }; stage: string }) {
  const pct = (a: number[]) => (a[1] ? Math.round((a[0] / a[1]) * 100) : 0);
  return (
    <section className="prog" aria-live="polite">
      <div className="bar"><div className="bar-h"><b>Lightning</b> normalizes rows in parallel <span>{prog.l[0]} / {prog.l[1] || "…"}</span></div><div className="track"><div className="fill l" style={{ width: `${pct(prog.l)}%` }} /></div></div>
      <div className="bar"><div className="bar-h"><b>Ultra</b> reasons over CBP&apos;s rules <span>{prog.u[0]} / {prog.u[1] || "…"}</span></div><div className="track"><div className="fill u" style={{ width: `${pct(prog.u)}%` }} /></div></div>
      <div className="stage">{stage === "lightning" ? "Normalizing rows and tagging broker notes…" : stage === "ultra" ? "Deterministic board is ready. Ultra is explaining the entries that need a decision…" : "Done."}</div>
    </section>
  );
}

function Card({ v, ex, checked, canInclude, onToggle, onOpen }: { v: Verdict; ex?: Explanation; checked: boolean; canInclude: boolean; onToggle: () => void; onOpen: () => void }) {
  const f = v.findings[0];
  const d = v.deadlines;
  return (
    <div className={`card ${checked ? "inc" : ""}`} onClick={onOpen}>
      <div className="card-top">
        <span className="en">{v.displayNumber}</span>
        {canInclude && <label className="inc-box" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked} onChange={onToggle} /><span>include</span></label>}
      </div>
      <div className="card-mid">
        <span className="amt">{v.lane === "NET_BILL_RISK" ? money(v.money.netCents) : money(v.money.ieepaRefundableCents)}</span>
        <span className="ior">{v.ior}</span>
        {d.capeDaysLeft !== null && d.capeDaysLeft >= 0 && <span className={`days ${d.capeDaysLeft <= 7 ? "hot" : ""}`}>{d.capeDaysLeft}d left</span>}
        {d.reconDeadlineDaysLeft !== null && v.lane !== "BLOCKED" && <span className="days hot">Recon {d.reconDeadlineDaysLeft}d</span>}
      </div>
      {f?.cbpError ? <div className="cbp">&ldquo;{f.cbpError}&rdquo;</div> : f ? <div className="cbp soft">{f.detail}</div> : <div className="cbp ok">{v.filingStep}</div>}
      {v.findings.length > 1 && <div className="more">+{v.findings.length - 1} more</div>}
      {v.money.frameworkGroups.length > 0 && <span className="pill">Framework {v.money.frameworkGroups.join("/")}</span>}
      {v.leadingZeroFix && <span className="pill">leading zero: apostrophe added</span>}
      {v.diversionRisk && <span className="pill warnp">IOR debt may offset</span>}
      {ex && <span className="pill ai">Ultra</span>}
    </div>
  );
}

function Export({ board, include, incRefund, incBill, files, ack, setAck }: { board: Board; include: Set<string>; incRefund: number; incBill: number; files: ReturnType<typeof buildCapeFiles>; ack: boolean; setAck: (b: boolean) => void }) {
  const p = board.portfolio;
  const heldWait = p.verdicts.filter((v) => v.lane === "WAIT" && include.has(v.id)).length;
  return (
    <div className="panel export">
      <div className="eyebrow">Export for your broker</div>
      <div className="exp-sum">
        <div><b>{include.size}</b><span>entries selected</span></div>
        <div><b>{money(incRefund)}</b><span>est. IEEPA refund before interest</span></div>
        {incBill > 0 && <div><b className="warn">{money(incBill)}</b><span>possible bills in selection</span></div>}
      </div>
      {heldWait > 0 && <p className="error">{heldWait} selected entries are on hold.</p>}
      <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I understand an accepted CAPE declaration cannot be amended or have entries removed, and a licensed customs broker will review this list before it is uploaded to ACE.</label>
      <div className="btns">
        {files.map((f) => (
          <button key={f.name} className="btn primary" disabled={!ack || !f.count} onClick={() => download(f.name, f.content)}>⬇ {f.name} ({f.count} entries, {f.bytes} B){f.ok ? "" : " ⚠"}</button>
        ))}
        <button className="btn" onClick={() => download("cape-broker-handoff.md", handoffNote(p, board.asOf, include), "text/markdown")}>⬇ Broker handoff note (.md)</button>
        <button className="btn" onClick={() => download("cape-deadlines.csv", deadlineCsv(p))}>⬇ Deadline list (.csv)</button>
      </div>
      <p className="fine">CAPE CSV format per CBP&apos;s ACE Portal quick reference guide: one &ldquo;Entry Number&rdquo; column, 11 characters, no dashes, apostrophe before a leading zero, at most 9,999 entries and 1MB per declaration. {PREPARED_FOR}</p>
    </div>
  );
}

function Drawer({ v, board, ex, onClose, included, onToggle }: { v: Verdict; board: Board; ex?: Explanation; onClose: () => void; included: boolean; onToggle: () => void }) {
  const info = board.entryInfo[v.id];
  const m = v.money; const d = v.deadlines;
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Entry ${v.displayNumber}`}>
        <button className="x" onClick={onClose} aria-label="Close">✕</button>
        <div className="eyebrow">{v.ior} · filing step {v.order}</div>
        <h2 className="mono">{v.displayNumber}</h2>
        <div className={`lanepill ${LANES.find((l) => l.id === v.lane)!.tone}`}>{LANES.find((l) => l.id === v.lane)!.title}</div>
        <p className="step">{v.filingStep}</p>

        {v.findings.length === 0 ? <p className="ok">No CBP validation error found for this entry by the checks in this tool.</p> : v.findings.map((f, i) => (
          <div className="finding" key={i}>
            {f.cbpError ? <div className="cbp big">&ldquo;{f.cbpError}&rdquo;</div> : <div className="cbp big soft">Filing-order guidance</div>}
            {f.cbpError && ERROR_DEFINITIONS[f.cbpError] && <p className="def"><b>CBP definition:</b> {ERROR_DEFINITIONS[f.cbpError]}</p>}
            <p>{f.detail}</p>
            {f.fix && <p className="fix"><b>Fix:</b> {f.fix}</p>}
            <a className="src" href={SOURCES[f.sourceId]?.url} target="_blank" rel="noreferrer">{SOURCES[f.sourceId]?.label ?? f.sourceId}</a>
          </div>
        ))}

        {ex && (
          <div className="ultra">
            <div className="eyebrow">Ultra explanation <span className="cid">{ex.completionId}</span></div>
            <p>{ex.summary}</p>
            <p><b>Broker next step:</b> {ex.brokerAction}</p>
            <p><b>Why this order:</b> {ex.whyThisOrder}</p>
            {ex.citations.length > 0 && <p className="cites">{ex.citations.map((c) => <span className="pill" key={c}>{c}</span>)}</p>}
            {ex.guardStripped > 0 && <p className="fine">Number guard removed {ex.guardStripped} amount(s) not in the deterministic packet.</p>}
            {ex.reasoning && <details><summary>Ultra&apos;s reasoning trace ({ex.ms} ms)</summary><pre>{ex.reasoning}</pre></details>}
          </div>
        )}

        <div className="money">
          <div className="eyebrow">Money (deterministic, cents-exact)</div>
          <table className="tbl"><tbody>
            <tr><td>IEEPA duty on lines</td><td>{money(m.grossIeepaCents)}</td></tr>
            {m.frameworkCarveOutCents > 0 && <tr><td>Framework carve-out that stays owed ({m.frameworkGroups.join("/")})</td><td>−{money(m.frameworkCarveOutCents)}</td></tr>}
            <tr><td>IEEPA refundable</td><td><b>{money(m.ieepaRefundableCents)}</b></td></tr>
            {m.underpaidOtherCents > 0 && <tr><td>Underpaid 232/301/201 ACE may recalculate</td><td className="warn">−{money(m.underpaidOtherCents)}</td></tr>}
            <tr><td>Net</td><td><b className={m.netCents < 0 ? "warn" : ""}>{money(m.netCents)}</b></td></tr>
          </tbody></table>
          {v.diversionRisk && <p className="fine warn">This IOR has an open non-IEEPA debt; CBP may offset it against the refund (19 CFR 24.72).</p>}
        </div>

        <div className="money">
          <div className="eyebrow">Dates (as of {board.asOf})</div>
          <table className="tbl"><tbody>
            <tr><td>Liquidation</td><td>{info?.liquidationDate ?? info?.liquidationStatus}</td></tr>
            {d.capeCutoffDate && <tr><td>CAPE Phase 1 window closes (+80d)</td><td>{d.capeCutoffDate} ({d.capeDaysLeft} days)</td></tr>}
            {d.protestDeadlineDate && <tr><td>Protest window closes (+180d)</td><td>{d.protestDeadlineDate} ({d.protestDaysLeft} days)</td></tr>}
            {d.reconDeadlineDaysLeft !== null && <tr><td>Recon deadline</td><td>{d.reconDeadlineDaysLeft} days</td></tr>}
            {d.projectedLiquidationDaysLeft !== null && <tr><td>Projected liquidation</td><td>in {d.projectedLiquidationDaysLeft} days</td></tr>}
          </tbody></table>
        </div>

        {info && (
          <div className="money">
            <div className="eyebrow">Lines &amp; broker note</div>
            <table className="tbl"><tbody>{info.lines.map((l) => <tr key={l.lineNo}><td>#{l.lineNo} {l.hts} {l.country}{l.framework ? ` · ${l.framework} framework` : ""}</td><td>{l.value} / IEEPA {l.ieepaDuty}</td></tr>)}</tbody></table>
            {info.notes && <p className="note-q">&ldquo;{info.notes}&rdquo;</p>}
            {info.noteSignals.length > 0 && <p className="cites">Lightning tags: {info.noteSignals.map((s) => <span className="pill" key={s}>{s}</span>)}</p>}
            {info.noteConflicts.map((c, i) => <p key={i} className="error">Note conflicts with the data: {c.message}</p>)}
            {info.parseNotes.map((c, i) => <p key={i} className="fine">{c}</p>)}
          </div>
        )}

        {(v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK") && <button className="btn primary" onClick={onToggle}>{included ? "Remove from the CAPE file" : "Add to the CAPE file"}</button>}
        <p className="fine">{PREPARED_FOR}</p>
      </aside>
    </div>
  );
}

/** Keep a few words of context around the part of the sentence that changed, and mark the changed words. */
function focus(before: string, after: string): { b: React.ReactNode; a: React.ReactNode } {
  const B = before.split(/\s+/).filter(Boolean), A = after.split(/\s+/).filter(Boolean);
  let p = 0; while (p < B.length && p < A.length && B[p] === A[p]) p++;
  let q = 0; while (q < B.length - p && q < A.length - p && B[B.length - 1 - q] === A[A.length - 1 - q]) q++;
  const ctx = 9, from = (W: string[]) => Math.max(0, p - ctx), to = (W: string[]) => Math.min(W.length, W.length - q + ctx);
  const render = (W: string[], cls: string) => {
    const f = from(W), t = to(W);
    return <>{f > 0 && "… "}{W.slice(f, p).join(" ")}{" "}<mark className={cls}>{W.slice(p, W.length - q).join(" ")}</mark>{" "}{W.slice(W.length - q, t).join(" ")}{t < W.length && " …"}</>;
  };
  return { b: B.length ? render(B, "del") : null, a: A.length ? render(A, "ins") : null };
}

const IMPACT: Record<number, string> = { 0: "Engine changed", 1: "Checked against the engine, unchanged", 3: "Not modeled by this tool" };

function ChangeCard({ c }: { c: Change }) {
  const f = focus(c.before, c.after);
  const lvl = c.engineLevel ?? 2;
  return (
    <article className={`chg lvl${lvl}`}>
      <header>
        <span className="tag">{c.kind === "added" ? "New on the page" : c.kind === "removed" ? "Removed" : "Reworded"}</span>
        {(c.stampBefore || c.stampAfter) && <span className="fine">{c.stampBefore ? c.stampBefore : "no stamp"} → {c.stampAfter ?? "no stamp"}</span>}
        {c.confirmedByTavily && <span className="fine ok">second reader (Tavily) agrees</span>}
      </header>
      <div className="vs">
        <div><div className="when">July 11 capture</div><blockquote>{f.b ?? <em>(not on the page)</em>}</blockquote></div>
        <div><div className="when">CBP page now</div><blockquote>{f.a ?? <em>(removed)</em>}</blockquote></div>
      </div>
      {c.engine && <p className={`impact lvl${lvl}`}><b>{IMPACT[lvl] ?? "Engine"}.</b> {c.engine.replace(/^(Engine (updated after this diff|unchanged)|Not modeled on purpose|Informational): ?/, "")}</p>}
    </article>
  );
}

function RuleWatch() {
  const [r, setR] = useState<WatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() { setBusy(true); try { setR((await (await fetch("/api/rulewatch")).json()) as WatchResult); } finally { setBusy(false); } }
  const ch = r?.changes ?? [];
  const key = ch.filter((c) => c.engineLevel === 0 || c.engineLevel === 1);
  const rest = ch.filter((c) => !(c.engineLevel === 0 || c.engineLevel === 1));
  return (
    <section className="panel watch">
      <div className="eyebrow">Rule-watch: did CBP change the rules since this was built?</div>
      <p className="fine">Reads CBP&apos;s live IEEPA refunds page and compares it with an archived capture from 2026-07-11. Each change below is quoted from the page, July on the left and now on the right, with what it means for this tool&apos;s checks. Nothing here is generated by a model.</p>
      <button className="btn" disabled={busy} onClick={go}>{busy ? "Reading CBP…" : "Check CBP now"}</button>
      {r && (
        <div className="wr">
          <p className={r.ok ? "" : "error"}>{r.note}</p>
          {r.ok && <>
            <p><b>{ch.length}</b> rule-relevant changes; {key.length} touch checks this tool runs. CBP&apos;s &quot;Last Modified&quot; stamp: {r.lastModified?.before ?? "none in the July capture"} → <b>{r.lastModified?.after ?? "none"}</b>. {r.noiseDropped} lines of layout and wording noise were filtered.</p>
            <div className="chgs">{key.map((c, i) => <ChangeCard key={i} c={c} />)}</div>
            {rest.length > 0 && <details className="more"><summary>{rest.length} more changes (not modeled or informational)</summary><div className="chgs">{rest.map((c, i) => <ChangeCard key={i} c={c} />)}</div></details>}
            <p className="fine">Snapshot {r.snapshot.capturedAt.slice(0, 10)} ({r.snapshot.sha256}) vs live {new Date(r.checkedAt).toLocaleString()} ({r.live?.sha256}).</p>
          </>}
        </div>
      )}
    </section>
  );
}

function ReceiptPanel({ receipt, board, mode }: { receipt: Receipt | null; board: Board; mode: string }) {
  const n = board.normalization;
  if (mode === "browser") return null;
  if (!receipt) return <section className="panel receipt"><div className="eyebrow">Token Factory receipt</div><p className="fine">Appears when the run finishes.</p></section>;
  const L = receipt.lightning, U = receipt.ultra;
  const total = L.costUsd + U.costUsd;
  return (
    <section className="panel receipt">
      <div className="eyebrow">Token Factory receipt · {receipt.mode === "replay" ? "recorded real run" : "live run"} · {new Date(receipt.ranAt).toLocaleString()}</div>
      <div className="rc">
        <div>
          <h4>Nemotron 3.5 Lightning <small>{L.model}</small></h4>
          <p><b>{L.calls}</b> calls in parallel · {L.promptTokens.toLocaleString()} in / {L.completionTokens.toLocaleString()} out tokens · avg {L.avgMs} ms · {L.failed} failed</p>
          <p className="fine">Job: normalize each row and tag broker notes (JSON mode, thinking off). Cross-checked against the deterministic parser: <b>{n.agree}/{n.checked}</b> fields agree{n.disagreements.length ? `; ${n.disagreements.length} disagreement(s) overridden by code:` : "."}</p>
          {n.disagreements.slice(0, 5).map((d, i) => <p key={i} className="fine mono">{d.entry} · {d.field}: model said {d.lightning}, parser {d.deterministic}</p>)}
        </div>
        <div>
          <h4>Nemotron 3 Ultra <small>{U.model}</small></h4>
          <p><b>{U.calls}</b> calls · {U.promptTokens.toLocaleString()} in / {U.completionTokens.toLocaleString()} out tokens ({U.reasoningTokens.toLocaleString()} reasoning) · avg {U.avgMs} ms · {U.failed} failed</p>
          <p className="fine">Job: explain and rank, with CBP&apos;s quoted rules in context. No dollar figure it writes survives unless it is already in the deterministic packet.</p>
        </div>
        <div>
          <h4>Total</h4>
          <p><b>~{total < 0.01 ? "<$0.01" : `$${total.toFixed(3)}`}</b> at list price · wall {(receipt.wallMs / 1000).toFixed(1)} s</p>
          <p className="fine">Estimate: tokens × Nebius list price (Ultra $1.00 in / $3.00 out, Lightning $0.06 / $0.24 per 1M). Host {receipt.host}.</p>
        </div>
      </div>
      <details><summary>{L.ids.length + U.ids.length} Token Factory completion ids</summary>
        <pre className="ids">{[...L.ids.map((i) => `lightning ${i}`), ...U.ids.map((i) => `ultra     ${i}`)].join("\n")}</pre></details>
    </section>
  );
}
