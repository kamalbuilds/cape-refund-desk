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
type Tone = "go" | "hold" | "decide" | "stop";
const LANES: { id: Lane; title: string; sub: string; tone: Tone }[] = [
  { id: "FILE_NOW", title: "Cleared to file", sub: "No CBP error found by the checks below", tone: "go" },
  { id: "WAIT", title: "Hold: fix first", sub: "PSC, Recon or a CBP error comes first", tone: "hold" },
  { id: "NET_BILL_RISK", title: "Broker decision", sub: "May net to a bill after recalculation", tone: "decide" },
  { id: "BLOCKED", title: "Do not include", sub: "ACE would reject these", tone: "stop" },
];
const laneOf = (id: Lane) => LANES.find((l) => l.id === id)!;
const PAGE = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (c: number) => fmtUsd(c);
function download(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const today = () => new Date().toISOString().slice(0, 10);

/* ---------- small pieces ---------- */
const Icon = {
  play: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3 1.5v11l9-5.5z" fill="currentColor" /></svg>,
  down: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M7 1.5v8M3.5 6.5L7 10l3.5-3.5M2 12.5h10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  file: <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden><path d="M3.5 1.5h5l2.5 2.5v8.5h-7.5z M8.5 1.5V4H11" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>,
  close: <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
};
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden><rect width="64" height="64" rx="12" fill="#141414" /><g fill="#fff"><rect x="13" y="22" width="5" height="20" rx="1" /><rect x="22" y="14" width="5" height="36" rx="1" /><rect x="31" y="26" width="5" height="12" rx="1" /><rect x="40" y="14" width="5" height="36" rx="1" /><rect x="49" y="22" width="3" height="20" rx="1" /></g></svg>
  );
}

/** Counts up while a streamed run lands the board; renders the final figure immediately otherwise. */
function Count({ n, animate }: { n: number; animate: boolean }) {
  const [v, setV] = useState(animate ? 0 : n);
  useEffect(() => {
    if (!animate || (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) { setV(n); return; }
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => { const k = Math.min(1, (t - t0) / 650); setV(Math.round(n * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n, animate]);
  return <>{v}</>;
}

/** One tick per entry, like a barcode on a customs manifest. Ghost while loading, lane-coloured once the board lands. */
function Manifest({ verdicts, ghost, filled, explained, animate, active, onOpen }: { verdicts: Verdict[]; ghost: number; filled: number; explained: Set<string>; animate: boolean; active?: Lane; onOpen?: (id: string) => void }) {
  if (verdicts.length === 0) {
    return <div className="manifest" aria-hidden>{Array.from({ length: ghost }, (_, i) => <span key={i} className={`tick ${i < Math.round(filled * ghost) ? "on" : "ghost"}`} />)}</div>;
  }
  const sorted = LANES.flatMap((l) => verdicts.filter((v) => v.lane === l.id));
  return (
    <div className="manifest" aria-hidden>
      {sorted.map((v, i) => (
        <button key={v.id} tabIndex={-1} className={`tick ${laneOf(v.lane).tone} ${animate ? "sweep" : ""} ${explained.has(v.id) ? "has" : ""} ${active && v.lane !== active ? "dim" : ""}`} style={animate ? { animationDelay: `${i * 12}ms` } : undefined} title={v.displayNumber} onClick={() => onOpen?.(v.id)} />
      ))}
    </div>
  );
}

export default function Desk() {
  const [board, setBoard] = useState<Board | null>(null);
  const [expl, setExpl] = useState<Record<string, Explanation>>({});
  const [pnote, setPnote] = useState<PortfolioNote | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [prog, setProg] = useState({ l: [0, 0], u: [0, 0] });
  const [total, setTotal] = useState(0);
  const [stage, setStage] = useState<"idle" | "lightning" | "ultra" | "done">("idle");
  const [mode, setMode] = useState<"" | "replay" | "live" | "browser">("");
  const [err, setErr] = useState("");
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane>("FILE_NOW");
  const [expanded, setExpanded] = useState(false);
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [ack, setAck] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [filer, setFiler] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [liveOk, setLiveOk] = useState<boolean | null>(null);
  const t0 = useRef(0);

  const reset = () => { setBoard(null); setExpl({}); setPnote(null); setReceipt(null); setProg({ l: [0, 0], u: [0, 0] }); setTotal(0); setSel(null); setAck(false); setErr(""); setNotice(null); setLane("FILE_NOW"); setExpanded(false); };

  const apply = useCallback((e: RunEvent) => {
    if (e.type === "start") { setStage("lightning"); setTotal(e.entries); setProg((p) => ({ ...p, l: [0, e.lightningTotal || e.entries] })); }
    else if (e.type === "lightning") setProg((p) => ({ ...p, l: [e.done, e.total] }));
    else if (e.type === "board") { setBoard(e.result); setInclude(defaultInclude(e.result.portfolio)); setStage("ultra"); }
    else if (e.type === "ultra-plan") setProg((p) => ({ ...p, u: [0, e.total] }));
    else if (e.type === "ultra") { setExpl((x) => ({ ...x, [e.id]: e.explanation })); setProg((p) => ({ ...p, u: [e.done, e.total] })); }
    else if (e.type === "portfolio-note") setPnote(e.note);
    else if (e.type === "done") {
      setExpl(e.result.explanations); setPnote(e.result.portfolioNote); setReceipt(e.result.receipt); setStage("done");
      const u = e.result.receipt.ultra, l = e.result.receipt.lightning;
      if (e.result.receipt.mode === "live" && (u.failed > 0 || l.failed > 0) && Object.keys(e.result.explanations).length === 0) setNotice({ kind: "partial", detail: u.firstError ?? l.firstError });
    }
    else if (e.type === "error") {
      if (e.code) { setNotice({ kind: e.code, detail: e.message }); setStage("idle"); setBoard(null); }
      else { setErr(e.message); setStage("done"); }
    }
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
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        if (j.code) setNotice({ kind: j.code, detail: j.error }); else setErr(j.error ?? `Request failed (${res.status})`);
        setStage("idle"); return;
      }
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
  const animate = mode === "replay" || mode === "live";
  const verdicts = useMemo(() => board?.portfolio.verdicts ?? [], [board]);
  const selV = verdicts.find((v) => v.id === sel) ?? null;
  const files = useMemo(() => (board ? buildCapeFiles(verdicts, include) : []), [board, verdicts, include]);
  const incV = verdicts.filter((v) => include.has(v.id));
  const incRefund = incV.reduce((s, v) => s + v.money.netRefundCents, 0);
  const incBill = incV.reduce((s, v) => s + v.money.billCents, 0);
  const explained = useMemo(() => new Set(Object.keys(expl)), [expl]);

  const toggle = (id: string) => setInclude((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const attention = verdicts.filter((v) => v.lane !== "FILE_NOW").length;
  const laneList = verdicts.filter((v) => v.lane === lane);
  const laneMeta = laneOf(lane);
  const canInclude = lane === "FILE_NOW" || lane === "NET_BILL_RISK";
  const allIn = laneList.length > 0 && laneList.every((v) => include.has(v.id));
  const setLaneInclude = (on: boolean) => setInclude((s) => { const n = new Set(s); laneList.forEach((v) => (on ? n.add(v.id) : n.delete(v.id))); return n; });
  const shown = expanded ? laneList : laneList.slice(0, PAGE);
  const openFirstLane = (id: string) => { const v = verdicts.find((x) => x.id === id); if (v) setLane(v.lane); setSel(id); };

  const controls = (
    <RunControls {...{ running, liveOk, csvText, fileName, filer, setFiler, asOf, setAsOf, err, onFile, replay, live, inBrowser }} compact={!!board || running} />
  );

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <Mark />
          <div>
            <h1>CAPE Refund Desk</h1>
            <p>The pre-flight check before an irreversible CAPE upload.</p>
          </div>
        </div>
        <div className="powered">Ultra reasons, Lightning normalizes<br />Nemotron 3 on Nebius Token Factory</div>
      </header>

      <div className="irrev" role="alert">
        <p><strong>Irreversible.</strong> {IRREVERSIBLE}</p>
        <span className="prepared">{PREPARED_FOR}</span>
      </div>

      {!board && !running && (
        <section className="hero">
          <div>
            <h2>Know what to hold before you upload.</h2>
            <p className="lead">
              For importers of record (IOR) and their licensed customs brokers. Feed it an ACE ES-003 export with ES-701 liquidation dates. <b>The models never decide eligibility or touch a dollar figure.</b>
            </p>
            <div className="cta">
              <button className="btn primary lg" disabled={running} onClick={replay}>{Icon.play} Run the sample <span className="sub">recorded real run</span></button>
              <button className="btn lg" disabled={running || liveOk === false} onClick={() => live(true)} title={liveOk === false ? "Live runs are disabled on this host" : "Calls Token Factory now: allow up to about 3 minutes"}>Run live on Token Factory</button>
            </div>
            <p className="fine">The sample is a recorded real run on <b>synthetic, made-up entries</b> shaped like ES-003 + ES-701, not real trade data.</p>
            <ol className="how">
              <li><b>Code checks every entry.</b> CBP&apos;s published CAPE rules and error table, the money in cents, the filing order.</li>
              <li><b>Lightning normalizes.</b> Messy columns and broker notes become clean fields, cross-checked against the parser.</li>
              <li><b>Ultra explains and ranks.</b> A number guard drops any figure that is not already in the deterministic packet.</li>
            </ol>
          </div>
          {controls}
        </section>
      )}

      {!board && !running && (
        <section className="panel" aria-label="What a run produces">
          <div className="strip-cap"><span>Each tick is one entry. A run sorts every entry into one of four lanes.</span></div>
          <Manifest verdicts={[]} ghost={64} filled={0} explained={explained} animate={false} />
          <div className="legend"><span className="go"><i />Cleared to file</span><span className="hold"><i />Hold: fix first</span><span className="decide"><i />Broker decision</span><span className="stop"><i />Do not include</span></div>
        </section>
      )}

      {(board || running) && (
        <details className="panel runbar" open={false}>
          <summary>Run another check or use your own file</summary>
          {controls}
        </details>
      )}

      {notice && <Notice n={notice} replay={replay} canBrowser={!!csvText} inBrowser={inBrowser} />}

      {running && board === null && (
        <section className="panel">
          <Progress prog={prog} stage={stage} />
          <div style={{ height: 16 }} />
          <Manifest verdicts={[]} ghost={Math.max(total, 1)} filled={prog.l[1] ? prog.l[0] / prog.l[1] : 0} explained={explained} animate={false} />
        </section>
      )}

      {board && (
        <>
          <div className="datalabel">
            <span className="tag">{mode === "replay" ? "Recorded run" : mode === "live" ? "Live run" : "Browser-only check"}</span> <span>{board.label}</span>
          </div>

          {running && <section className="panel"><Progress prog={prog} stage={stage} /></section>}

          <section className="panel summary" aria-label="Board summary">
            <div className="panel-h">
              <h2 className="headline"><b>{attention}</b> of {verdicts.length} entries should not go into the CAPE file as they are.</h2>
            </div>
            <Manifest verdicts={verdicts} ghost={0} filled={1} explained={explained} animate={animate} active={lane} onOpen={openFirstLane} />
            <div className="tabs" role="tablist" aria-label="Lanes">
              {LANES.map((l) => {
                const t = board.portfolio.lanes[l.id];
                return (
                  <button key={l.id} role="tab" aria-selected={lane === l.id} className={`tab ${l.tone}`} onClick={() => { setLane(l.id); setExpanded(false); }}>
                    <span className="lane-h"><span className="lane-t">{l.title}</span><span className="lane-n"><Count n={t.count} animate={animate} /></span></span>
                    <span className="tab-m">{l.id === "NET_BILL_RISK" ? <>{money(t.refundCents)} refundable, up to {money(t.billCents)} bills</> : <>{money(t.refundCents)} IEEPA duty</>}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="panel lanepanel" role="tabpanel" aria-label={laneMeta.title}>
            <div className="lanepanel-h">
              <div>
                <h2><span className={`pill ${laneMeta.tone}`}>{laneMeta.title}</span> <span className="muted">{laneList.length} entries</span></h2>
                <p>{laneMeta.sub}</p>
              </div>
              {canInclude && laneList.length > 0 && <button className="btn sm" onClick={() => setLaneInclude(!allIn)}>{allIn ? "Clear this lane from the file" : "Add this lane to the file"}</button>}
            </div>
            {laneList.length === 0 ? <p className="empty">No entries in this lane.</p> : (
              <>
                <div className="thead"><span /><span>Entry</span><span>IOR</span><span>CBP finding</span><span className="r">CAPE window</span><span className="r">{lane === "NET_BILL_RISK" ? "Net" : "IEEPA refund"}</span></div>
                <ul className="rows" key={lane}>
                  {shown.map((v, i) => (
                    <Row key={v.id} v={v} ex={expl[v.id]} i={i} animate checked={include.has(v.id)} canInclude={canInclude} active={sel === v.id} onToggle={() => toggle(v.id)} onOpen={() => setSel(v.id)} />
                  ))}
                </ul>
                {laneList.length > PAGE && !expanded && <div className="more-row"><button className="btn" onClick={() => setExpanded(true)}>Show all {laneList.length} entries</button></div>}
              </>
            )}
          </section>

          {pnote && (
            <section className="panel">
              <h2>Ultra&apos;s read of the portfolio <span className="cid">{pnote.completionId}</span></h2>
              <p className="headline2" style={{ marginTop: 8 }}>{pnote.headline}</p>
              <div className="cols">
                <div>
                  <h3>Look at these first</h3>
                  <ul className="prio">{pnote.priorities.map((p) => <li key={p.id}><button className="linkbtn" onClick={() => openFirstLane(p.id)}>{verdicts.find((v) => v.id === p.id)?.displayNumber ?? p.id}</button><span>{p.reason}</span></li>)}</ul>
                </div>
                <div><h3>Ask the IOR before upload</h3><ul className="q">{pnote.brokerQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
              </div>
            </section>
          )}

          <section className="two">
            <Export board={board} include={include} incRefund={incRefund} incBill={incBill} files={files} ack={ack} setAck={setAck} />
            <div className="stack">
              <div className="panel">
                <h2>Filing order</h2>
                <p className="fine" style={{ marginBottom: 12 }}>CBP&apos;s sequencing rules, applied by code. Click a row for the reason.</p>
                <ol className="order">
                  {verdicts.filter((v) => v.lane !== "BLOCKED").map((v) => (
                    <li key={v.id} onClick={() => openFirstLane(v.id)}>
                      <span className="n">{v.order}</span>
                      <span className="e">{v.displayNumber}</span>
                      <span className="s">{v.filingStep}</span>
                      <span className={`m ${v.money.netCents < 0 ? "neg" : ""}`}>{money(v.money.netCents)}</span>
                    </li>
                  ))}
                </ol>
                <details className="rules"><summary>The rules behind the order (quoted from CBP)</summary>
                  {FILING_ORDER_RULES.map((r) => <p key={r.id}><b>{r.rule}</b><br /><i>&ldquo;{r.quote}&rdquo;</i> <a href={SOURCES[r.sourceId].url} target="_blank" rel="noreferrer">{r.sourceId}</a></p>)}
                </details>
              </div>
              {board.portfolio.iors.length > 0 && (
                <div className="panel">
                  <h2>IOR debts that may absorb the refund</h2>
                  <p className="fine" style={{ marginBottom: 8 }}>19 CFR 24.72</p>
                  <table className="tbl num"><thead><tr><th>IOR</th><th>Open debt</th><th>Eligible refund</th><th>Likely offset</th></tr></thead>
                    <tbody>{board.portfolio.iors.map((i) => <tr key={i.ior}><td className="mono">{i.ior}</td><td>{money(i.openDebtCents)}</td><td>{money(i.eligibleRefundCents)}</td><td className="warn">{money(i.expectedDiversionCents)}</td></tr>)}</tbody></table>
                  <p className="fine" style={{ marginTop: 10 }}>CBP checks for unpaid debts owed by the IOR before issuing a refund. Interest (19 U.S.C. 1505) is added by CBP and is not estimated here.</p>
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
type RunControlProps = { running: boolean; liveOk: boolean | null; csvText: string; fileName: string; filer: string; setFiler: (s: string) => void; asOf: string; setAsOf: (s: string) => void; err: string; onFile: (f: File | null) => void; replay: () => void; live: (sample: boolean) => void; inBrowser: () => void; compact: boolean };
function RunControls(p: RunControlProps) {
  return (
    <div className={p.compact ? "" : "panel runbox"}>
      {!p.compact && <h3>Check your own file</h3>}
      {!p.compact && <p className="fine">We never ask for ACE credentials, bank details or an EIN. Your broker or IOR uploads to ACE. Uploaded files are processed in memory and never stored.</p>}
      <div className="field">
        <label className="file">
          <input type="file" accept=".csv,text/csv" onChange={(e) => p.onFile(e.target.files?.[0] ?? null)} />
          <span>{Icon.file} {p.fileName ? p.fileName : "Upload your ES-003 CSV"}</span>
        </label>
        <div className="row2">
          <label className="in">Filer code<input placeholder="A7K" maxLength={3} value={p.filer} onChange={(e) => p.setFiler(e.target.value.toUpperCase())} aria-label="Filer code" /></label>
          <label className="in">As-of date<input type="date" value={p.asOf} onChange={(e) => p.setAsOf(e.target.value)} aria-label="As-of date" /></label>
        </div>
        <div className="btnrow">
          <button className="btn" disabled={p.running || !p.csvText} onClick={p.inBrowser}>Check in this browser (no upload)</button>
          <button className="btn" disabled={p.running || !p.csvText || p.liveOk === false} onClick={() => p.live(false)}>Check with Lightning + Ultra</button>
        </div>
        <div className="btnrow">
          {p.compact && <button className="btn" disabled={p.running} onClick={p.replay}>{Icon.play} Replay the sample</button>}
          {p.compact && <button className="btn" disabled={p.running || p.liveOk === false} onClick={() => p.live(true)}>Run live on Token Factory</button>}
          <a className="link" href="/api/sample?f=csv">Download the synthetic sample CSV</a>
        </div>
        {p.err && <p className="error" role="alert">{p.err}</p>}
      </div>
    </div>
  );
}

function Progress({ prog, stage }: { prog: { l: number[]; u: number[] }; stage: string }) {
  const frac = (a: number[]) => (a[1] ? Math.min(1, a[0] / a[1]) : 0);
  return (
    <div className="prog" aria-live="polite">
      <div><div className="bar-h"><span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--text)" }}><b>Lightning</b> normalizes rows in parallel</span><span>{prog.l[0]} / {prog.l[1] || "…"}</span></div><div className="track"><div className="fill" style={{ transform: `scaleX(${frac(prog.l)})` }} /></div></div>
      <div><div className="bar-h"><span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--text)" }}><b>Ultra</b> reasons over CBP&apos;s rules</span><span>{prog.u[1] ? `${prog.u[0]} / ${prog.u[1]}` : "queued, starts when rows are clean"}</span></div><div className="track"><div className="fill" style={{ transform: `scaleX(${frac(prog.u)})` }} /></div></div>
      <div className="stage">{stage === "lightning" ? "Normalizing rows and tagging broker notes…" : stage === "ultra" ? "The deterministic board is ready. Ultra is explaining the entries that need a decision…" : "Done."}</div>
    </div>
  );
}

function Row({ v, ex, i, animate, checked, canInclude, active, onToggle, onOpen }: { v: Verdict; ex?: Explanation; i: number; animate: boolean; checked: boolean; canInclude: boolean; active: boolean; onToggle: () => void; onOpen: () => void }) {
  const f = v.findings[0];
  const d = v.deadlines;
  const isNet = v.lane === "NET_BILL_RISK";
  const amtC = isNet ? v.money.netCents : v.money.ieepaRefundableCents;
  const win = d.capeDaysLeft !== null && d.capeDaysLeft >= 0 ? d.capeDaysLeft : null;
  const meta: React.ReactNode[] = [];
  if (v.diversionRisk) meta.push(<span key="d" className="warn">IOR debt may offset</span>);
  if (v.money.frameworkGroups.length > 0) meta.push(<span key="f">Framework {v.money.frameworkGroups.join("/")}</span>);
  if (v.leadingZeroFix) meta.push(<span key="z">leading zero: apostrophe added</span>);
  if (v.findings.length > 1) meta.push(<span key="m">+{v.findings.length - 1} more finding{v.findings.length > 2 ? "s" : ""}</span>);
  if (d.reconDeadlineDaysLeft !== null && v.lane !== "BLOCKED") meta.push(<span key="r" className="warn">Recon {d.reconDeadlineDaysLeft}d</span>);
  if (ex) meta.push(<span key="u">Ultra explained</span>);
  if (!f) meta.unshift(<span key="s">Filing step {v.order}</span>);
  return (
    <li className={`row ${active ? "sel" : ""} ${animate ? "enter" : ""}`} style={animate ? { animationDelay: `${Math.min(i, 14) * 12}ms` } : undefined} onClick={onOpen}>
      {canInclude
        ? <label className="chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Include ${v.displayNumber} in the CAPE file`} /></label>
        : <span className="chk na" aria-hidden />}
      <button className="en" onClick={(e) => { e.stopPropagation(); onOpen(); }}>{v.displayNumber}</button>
      <span className="ior">{v.ior}</span>
      <span className="why">
        <span className={`l1 ${f ? "" : "none"}`}>{f?.cbpError ? <>&ldquo;{f.cbpError}&rdquo;</> : f ? f.detail : "No CBP error found"}</span>
        <span className="l2">{meta.map((m, k) => <span key={k}>{k ? " · " : ""}{m}</span>)}{win !== null && <span className="m-only"> · {win}d left</span>}</span>
      </span>
      <span className={`win r ${win !== null && win <= 7 ? "hot" : ""}`}>{win !== null ? `${win} day${win === 1 ? "" : "s"} left` : "n/a"}</span>
      <span className={`amt ${amtC < 0 ? "neg" : ""}`}>{money(amtC)}{isNet && <small>net</small>}</span>
    </li>
  );
}

function Export({ board, include, incRefund, incBill, files, ack, setAck }: { board: Board; include: Set<string>; incRefund: number; incBill: number; files: ReturnType<typeof buildCapeFiles>; ack: boolean; setAck: (b: boolean) => void }) {
  const p = board.portfolio;
  const heldWait = p.verdicts.filter((v) => v.lane === "WAIT" && include.has(v.id)).length;
  return (
    <div className="panel dock">
      <h2>Export for your broker</h2>
      <div className="kpis">
        <div className="kpi"><b>{include.size}</b><span>entries selected</span></div>
        <div className="kpi"><b>{money(incRefund)}</b><span>est. IEEPA refund before interest</span></div>
        <div className="kpi"><b className={incBill > 0 ? "neg" : ""}>{incBill > 0 ? money(incBill) : "$0.00"}</b><span>possible bills in selection</span></div>
      </div>
      {heldWait > 0 && <p className="error" style={{ marginBottom: 12 }}>{heldWait} selected entries are on hold.</p>}
      <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand an accepted CAPE declaration cannot be amended or have entries removed, and a licensed customs broker will review this list before it is uploaded to ACE.</span></label>
      <div className="btns">
        {files.map((f) => (
          <button key={f.name} className="btn primary lg" disabled={!ack || !f.count} onClick={() => download(f.name, f.content)}>{Icon.down} {f.name} <span className="sub">{f.count} entries, {f.bytes} B{f.ok ? "" : ", check this file"}</span></button>
        ))}
        <div className="btnrow">
          <button className="btn" onClick={() => download("cape-broker-handoff.md", handoffNote(p, board.asOf, include), "text/markdown")}>{Icon.down} Broker handoff note (.md)</button>
          <button className="btn" onClick={() => download("cape-deadlines.csv", deadlineCsv(p))}>{Icon.down} Deadline list (.csv)</button>
        </div>
      </div>
      <p className="fine" style={{ marginTop: 14 }}>CAPE CSV format per CBP&apos;s ACE Portal quick reference guide: one &ldquo;Entry Number&rdquo; column, 11 characters, no dashes, apostrophe before a leading zero, at most 9,999 entries and 1MB per declaration. {PREPARED_FOR}</p>
    </div>
  );
}

function Countdown({ label, date, left, span }: { label: string; date: string; left: number | null; span: number }) {
  if (left === null) return null;
  const closed = left < 0;
  const used = Math.max(0, Math.min(1, (span - left) / span));
  const hot = !closed && left <= 7;
  return (
    <div className="cd">
      <div className="cd-h"><span>{label} <span className="muted">{date}</span></span><b className={hot || closed ? "hot" : ""}>{closed ? "closed" : `${left} day${left === 1 ? "" : "s"} left`}</b></div>
      <div className="track" role="img" aria-label={`${label}: ${closed ? "closed" : `${left} days left`}`}><i className={hot || closed ? "hot" : ""} style={{ width: `${(closed ? 1 : used) * 100}%` }} /></div>
    </div>
  );
}

function Drawer({ v, board, ex, onClose, included, onToggle }: { v: Verdict; board: Board; ex?: Explanation; onClose: () => void; included: boolean; onToggle: () => void }) {
  const info = board.entryInfo[v.id];
  const m = v.money; const d = v.deadlines;
  const meta = laneOf(v.lane);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="drawer-wrap" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Entry ${v.displayNumber}`}>
        <button ref={closeRef} className="x" onClick={onClose} aria-label="Close">{Icon.close}</button>
        <div className="d-meta"><span className="mono">{v.ior}</span><span>Filing step {v.order}</span></div>
        <h2>{v.displayNumber}</h2>
        <span className={`pill ${meta.tone}`}>{meta.title}</span>
        <p className="step">{v.filingStep}</p>

        <div className="netbox">
          <div className="big"><span>{m.netCents < 0 ? "Net: a possible bill" : "Net refund"}</span><b className={m.netCents < 0 ? "neg" : ""}>{money(m.netCents)}</b></div>
          <div className="parts">
            <div><span>IEEPA duty on lines</span><span>{money(m.grossIeepaCents)}</span></div>
            {m.frameworkCarveOutCents > 0 && <div><span>Framework carve-out ({m.frameworkGroups.join("/")})</span><span>−{money(m.frameworkCarveOutCents)}</span></div>}
            <div><span>IEEPA refundable</span><b>{money(m.ieepaRefundableCents)}</b></div>
            {m.underpaidOtherCents > 0 && <div><span>Underpaid 232/301/201</span><span className="neg">−{money(m.underpaidOtherCents)}</span></div>}
          </div>
        </div>
        <p className="fine">Deterministic, cents-exact. Underpaid 232/301/201 duty is what ACE may recalculate as owed against the refund.</p>
        {v.diversionRisk && <p className="fine warn" style={{ marginTop: 6 }}>This IOR has an open non-IEEPA debt; CBP may offset it against the refund (19 CFR 24.72).</p>}

        <div className="sect">
          <h3>CBP findings</h3>
          {v.findings.length === 0 ? <p className="pos" style={{ color: "var(--go-ink)" }}>No CBP validation error found for this entry by the checks in this tool.</p> : v.findings.map((f, i) => (
            <div className="finding" key={i}>
              {f.cbpError ? <div className="cbpq">&ldquo;{f.cbpError}&rdquo;</div> : <div className="cbpq soft">Filing-order guidance</div>}
              {f.cbpError && ERROR_DEFINITIONS[f.cbpError] && <p><b>CBP definition:</b> {ERROR_DEFINITIONS[f.cbpError]}</p>}
              <p>{f.detail}</p>
              {f.fix && <p className="fix"><b>Fix:</b> {f.fix}</p>}
              <p><a className="src" href={SOURCES[f.sourceId]?.url} target="_blank" rel="noreferrer">{SOURCES[f.sourceId]?.label ?? f.sourceId}</a></p>
            </div>
          ))}
        </div>

        {ex && (
          <div className="sect ultra">
            <h3>Ultra explanation <span className="cid">{ex.completionId}</span></h3>
            <p>{ex.summary}</p>
            <p><b>Broker next step:</b> {ex.brokerAction}</p>
            <p><b>Why this order:</b> {ex.whyThisOrder}</p>
            {ex.citations.length > 0 && <div className="cites">{ex.citations.map((c) => <span key={c}>{c}</span>)}</div>}
            {ex.guardStripped > 0 && <p className="fine">Number guard replaced {ex.guardStripped} figure{ex.guardStripped === 1 ? "" : "s"} that did not match the engine.</p>}
            {ex.reasoning && <details style={{ marginTop: 10 }}><summary>Ultra&apos;s reasoning trace ({ex.ms} ms)</summary><pre>{ex.reasoning}</pre></details>}
          </div>
        )}

        <div className="sect">
          <h3>Dates <span className="muted" style={{ fontWeight: 400 }}>as of {board.asOf}</span></h3>
          <table className="tbl"><tbody><tr><td>Liquidation</td><td>{info?.liquidationDate ?? info?.liquidationStatus}</td></tr></tbody></table>
          {d.capeCutoffDate && <Countdown label="CAPE Phase 1 window closes (+80d)" date={d.capeCutoffDate} left={d.capeDaysLeft} span={80} />}
          {d.protestDeadlineDate && <Countdown label="Protest window closes (+180d)" date={d.protestDeadlineDate} left={d.protestDaysLeft} span={180} />}
          <table className="tbl"><tbody>
            {d.reconDeadlineDaysLeft !== null && <tr><td>Recon deadline</td><td>{d.reconDeadlineDaysLeft} days</td></tr>}
            {d.projectedLiquidationDaysLeft !== null && <tr><td>Projected liquidation</td><td>in {d.projectedLiquidationDaysLeft} days</td></tr>}
          </tbody></table>
        </div>

        {info && (
          <div className="sect">
            <h3>Lines and broker note</h3>
            <table className="tbl"><tbody>{info.lines.map((l) => <tr key={l.lineNo}><td>#{l.lineNo} <span className="mono">{l.hts}</span> {l.country}{l.framework ? ` · ${l.framework} framework` : ""}</td><td>{l.value} / IEEPA {l.ieepaDuty}</td></tr>)}</tbody></table>
            {info.notes && <p className="note-q">&ldquo;{info.notes}&rdquo;</p>}
            {info.noteSignals.length > 0 && <div className="sig">Lightning tags: {info.noteSignals.map((s) => <span key={s}>{s}</span>)}</div>}
            {info.noteConflicts.map((c, i) => <p key={i} className="error" style={{ marginTop: 8 }}>Note conflicts with the data: {c.message}</p>)}
            {info.parseNotes.map((c, i) => <p key={i} className="fine" style={{ marginTop: 6 }}>{c}</p>)}
          </div>
        )}

        {(v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK") && <div style={{ marginTop: 28 }}><button className="btn primary lg" onClick={onToggle}>{included ? "Remove from the CAPE file" : "Add to the CAPE file"}</button></div>}
        <p className="fine" style={{ marginTop: 14 }}>{PREPARED_FOR}</p>
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

type NoticeState = { kind: "credit" | "auth" | "disabled" | "cap" | "partial"; detail?: string };
const NOTICE: Record<NoticeState["kind"], { title: string; body: string }> = {
  credit: { title: "Live runs are paused: the model account is out of credit.", body: "Nebius Token Factory answered HTTP 402 (credit balance exhausted), so no model ran. Nothing was charged to you and your file was not stored. The recorded real run shows exactly what a live run returns, completion ids included." },
  auth: { title: "Live runs are paused: the model key on this host was rejected.", body: "Token Factory refused the host's key (HTTP 401/403), so no model ran. Your file was not stored. The recorded real run shows what a live run returns." },
  disabled: { title: "Live runs are switched off on this host.", body: "No Token Factory key is configured here. The recorded real run shows what a live run returns." },
  cap: { title: "This host's live-run budget is used up.", body: "To keep the demo affordable each instance allows a fixed number of live runs. The recorded real run shows what a live run returns." },
  partial: { title: "The models did not answer, so there are no explanations on this board.", body: "The rule checks and the money below are deterministic and complete. Only the model explanations are missing." },
};
function Notice({ n, replay, canBrowser, inBrowser }: { n: NoticeState; replay: () => void; canBrowser: boolean; inBrowser: () => void }) {
  const t = NOTICE[n.kind];
  return (
    <section className="notice" role="alert">
      <h3>{t.title}</h3>
      <p>{t.body}</p>
      <div className="btnrow">
        <button className="btn primary" onClick={replay}>Play the recorded real run</button>
        {canBrowser && <button className="btn" onClick={inBrowser}>Check my file in this browser (rules only, no models)</button>}
      </div>
      {n.detail && <details><summary>What the server said</summary><pre>{n.detail}</pre></details>}
    </section>
  );
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
        {c.confirmedByTavily && <span className="fine ok">Tavily agrees</span>}
        {c.confirmedByTreg && <span className="fine ok">treg agrees</span>}
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
  const key = ch.filter((c) => c.key);
  const rest = ch.filter((c) => !c.key);
  return (
    <section className="panel watch">
      <h2>Rule-watch: did CBP change the rules since this was built?</h2>
      <p className="fine">Reads CBP&apos;s live IEEPA refunds page and compares it with an archived capture from 2026-07-11. Each change below is quoted from the page, July on the left and now on the right, with what it means for this tool&apos;s checks. Nothing here is generated by a model.</p>
      <button className="btn" disabled={busy} onClick={go}>{busy ? "Reading CBP…" : "Check CBP now"}</button>
      {r && (
        <div className="wr">
          <p className={r.ok ? "" : "error"}>{r.note}</p>
          {r.ok && <>
            <p><b>{key.length}</b> change{key.length === 1 ? "" : "s"} touch checks this tool runs; {rest.length} more are informational. CBP&apos;s &quot;Last Modified&quot; stamp: {r.lastModified?.before ?? "none in the July capture"} → <b>{r.lastModified?.after ?? "none"}</b>. {r.noiseDropped} lines of layout and wording noise were filtered.</p>
            <div className="chgs">{key.map((c, i) => <ChangeCard key={i} c={c} />)}</div>
            {rest.length > 0 && <details className="more"><summary>{rest.length} more changes (informational or not modeled)</summary><div className="chgs">{rest.map((c, i) => <ChangeCard key={i} c={c} />)}</div></details>}
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
  if (!receipt) return <section className="panel receipt"><h2>Token Factory receipt</h2><p className="fine">Appears when the run finishes.</p></section>;
  const L = receipt.lightning, U = receipt.ultra;
  const total = L.costUsd + U.costUsd;
  return (
    <section className="panel receipt">
      <h2>Token Factory receipt <span className="muted">· {receipt.mode === "replay" ? "recorded real run" : "live run"} · {new Date(receipt.ranAt).toLocaleString()}</span></h2>
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
