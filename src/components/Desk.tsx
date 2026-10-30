"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERROR_DEFINITIONS, FILING_ORDER_RULES, SOURCES } from "@/lib/cbp-rules";
import { browserBoard } from "@/lib/browser-board";
import { buildCapeFiles, deadlineCsv, defaultInclude, DISCLAIMER, handoffNote, IRREVERSIBLE_PLAIN, PREPARED_FOR_PLAIN } from "@/lib/export";
import { fmtUsd } from "@/lib/money";
import type { Explanation, PortfolioNote, Receipt, RunEvent, RunResult } from "@/lib/pipeline";
import type { WatchResult, Change } from "@/lib/rulewatch";
import type { Lane, Verdict } from "@/lib/types";
import { PLAIN_FINDING, plainStep, plainTitle, plainVerdict } from "@/lib/plain";
import { LANES, laneOf } from "@/lib/lanes-ui";
import Stage from "./Stage";
import { CountInt, CountMoney, Reveal, TwistCard, Words } from "./motion";
import Waterfall from "./Waterfall";
import { AlertTriangle, Download, FileText, Play, X } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, Id } from "./ui";

type Board = Omit<RunResult, "receipt" | "explanations" | "portfolioNote">;
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
  play: <Play size={14} fill="currentColor" aria-hidden />,
  down: <Download size={16} aria-hidden />,
  file: <FileText size={14} aria-hidden />,
  close: <X size={16} aria-hidden />,
};
function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden><rect width="64" height="64" rx="16" fill="var(--text)" /><g fill="var(--ground)"><rect x="13" y="22" width="5" height="20" rx="1" /><rect x="22" y="14" width="5" height="36" rx="1" /><rect x="31" y="26" width="5" height="12" rx="1" /><rect x="40" y="14" width="5" height="36" rx="1" /><rect x="49" y="22" width="3" height="20" rx="1" /></g></svg>
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
  const [lane, setLane] = useState<Lane | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<"order" | "amount" | "time">("order");
  const [include, setInclude] = useState<Set<string>>(new Set());
  const [ack, setAck] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [filer, setFiler] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [liveOk, setLiveOk] = useState<boolean | null>(null);
  const t0 = useRef(0);

  const reset = () => { setBoard(null); setExpl({}); setPnote(null); setReceipt(null); setProg({ l: [0, 0], u: [0, 0] }); setTotal(0); setSel(null); setAck(false); setErr(""); setNotice(null); setLane(null); setExpanded(false); };

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
    for (let i = 1; i <= n; i++) { apply({ type: "lightning", done: i, total: n, lastMs: 0 }); await sleep(Math.max(18, Math.round(1900 / n))); }
    await sleep(350);
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
    if (f.size > 1_000_000) { setErr("That file is over 1MB, which is Customs' upload limit. Split it into smaller files first."); return; }
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
  const laneList = lane ? verdicts.filter((v) => v.lane === lane) : [];
  const laneMeta = lane ? laneOf(lane) : null;
  const canInclude = lane === "FILE_NOW" || lane === "NET_BILL_RISK";
  const allIn = laneList.length > 0 && laneList.every((v) => include.has(v.id));
  const setLaneInclude = (on: boolean) => setInclude((s) => { const n = new Set(s); laneList.forEach((v) => (on ? n.add(v.id) : n.delete(v.id))); return n; });
  const sortedLane = sortBy === "order" ? laneList : [...laneList].sort((a, b) => sortBy === "amount"
    ? Math.abs(b.lane === "NET_BILL_RISK" ? b.money.netCents : b.money.ieepaRefundableCents) - Math.abs(a.lane === "NET_BILL_RISK" ? a.money.netCents : a.money.ieepaRefundableCents)
    : (a.deadlines.capeDaysLeft ?? 1e9) - (b.deadlines.capeDaysLeft ?? 1e9));
  const shown = expanded ? sortedLane : sortedLane.slice(0, PAGE);
  const openFirstLane = (id: string) => { const v = verdicts.find((x) => x.id === id); if (v) setLane(v.lane); setSel(id); };
  const panelRef = useRef<HTMLElement | null>(null);
  const pickLane = (l: Lane) => {
    setLane(l); setExpanded(false);
    setTimeout(() => panelRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }), 60);
  };
  const arrived = board ? total : Math.round((prog.l[1] ? prog.l[0] / prog.l[1] : 0) * total);
  const laneTotals = board ? board.portfolio.lanes : null;

  const controls = (
    <RunControls {...{ running, liveOk, csvText, fileName, filer, setFiler, asOf, setAsOf, err, onFile, replay, live, inBrowser }} compact={!!board || running} />
  );

  const zone = board ? (
    <div className="zone-in">
      <h2 className="headline"><b><CountInt n={attention} animate={animate} dur={1000} delay={500} /></b> of {verdicts.length} shipments shouldn&apos;t go in the refund file yet. Here&apos;s why.</h2>
      {laneTotals && (
        <>
          <p className="answer">
            {laneTotals.NET_BILL_RISK.count} {laneTotals.NET_BILL_RISK.count === 1 ? "shipment" : "shipments"} could turn a refund into a bill. Open a group below to see what Customs found.
          </p>
          <div className="claimcard">
            <p className="claim-label">Safe to claim</p>
            <p className="claim-num"><CountMoney cents={laneTotals.FILE_NOW.refundCents} animate={animate} dur={800} delay={300} /></p>
            <p className="claim-sub"><b>{laneTotals.FILE_NOW.count} {laneTotals.FILE_NOW.count === 1 ? "shipment" : "shipments"}</b> · Customs&apos; checks found nothing wrong</p>
            <button className={BTN_PRIMARY} onClick={() => document.querySelector(".dock")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })}>Add safe shipments to the refund file</button>
          </div>
        </>
      )}
      <p className="runmeta">
        <span>{mode === "replay" ? "Recorded run" : mode === "live" ? "Live run" : "Browser-only check"}</span>
        <span>{/^SYNTHETIC SAMPLE/.test(board.label) ? `Sample data: ${verdicts.length} made-up shipments. Not real trade data.` : board.label}</span>
        <span>Checked as of <span className="mono">{board.asOf}</span></span>
      </p>
    </div>
  ) : (
    <div className="zone-in">
      <p className="text-sm font-medium text-zinc-900">Checking the file</p>
      <h2 className="headline text-3xl font-semibold tracking-tight text-zinc-900">Sorting {total || 69} shipments into four groups.</h2>
      <Progress prog={prog} stage={stage} />
    </div>
  );

  return (
    <div className="shell">
      <header className="top">
        <div className="head-brand">
          <Mark />
          <h1 className="head-word">CAPE Refund Desk</h1>
          <p className="head-sub">Check your tariff refund file before you send it.</p>
        </div>
        <p className="powered"><i className="live-dot" aria-hidden />Nemotron AI models on Nebius Token Factory</p>
      </header>

      <div className="r6-alert" role="alert">
        <AlertTriangle className="r6-alert-icon" aria-hidden />
        <div className="r6-alert-body">
          <p><strong>Can&apos;t be undone.</strong> {IRREVERSIBLE_PLAIN}</p>
          <p className="r6-alert-note">{PREPARED_FOR_PLAIN}</p>
        </div>
      </div>

      {!board && !running && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <h2 className="display text-3xl font-semibold tracking-tight text-zinc-900" aria-label="Check the refund file before you send it.">
                <span className="ln"><Words text="Check the refund file" /></span>
                <span className="ln"><Words text="before you send it." base={260} /></span>
              </h2>
              <p className="text-base text-zinc-600 max-w-2xl leading-relaxed mt-2">
                US importers are owed money back for tariffs that were struck down. To get it, they upload one file to Customs, and it can&apos;t be undone. One wrong shipment can turn a refund into a bill. <b className="font-semibold text-zinc-900">This checks the file first.</b>
              </p>
              <div className="cta mt-6">
                <button className={BTN_PRIMARY} disabled={running} onClick={replay}>{Icon.play} Run the sample <span className="text-xs font-normal text-zinc-300">recorded real run</span></button>
                <button className={BTN_SECONDARY} disabled={running || liveOk === false} onClick={() => live(true)} title={liveOk === false ? "Live runs are disabled on this host" : "Calls the AI now: allow up to about 3 minutes"}>Run it live</button>
              </div>
              <p className="fine">Sample data: made-up shipments, not real trade data. Not legal advice. We never ask for logins or bank details.</p>
            </div>
            <TwistCard />
          </section>

          <section aria-label="How it works" className="mt-12 mb-8 max-w-2xl">
            <h3 className="text-sm font-medium text-zinc-900">How the check works</h3>
            <ul className="mt-3 space-y-2 text-sm text-zinc-600 leading-relaxed list-disc pl-5">
              <li><b className="font-medium text-zinc-900">Plain code</b> does all the money math and sorts every shipment. The AI never makes up a number.</li>
              <li><b className="font-medium text-zinc-900">A fast AI</b> (Nemotron Lightning) cleans up messy data.</li>
              <li><b className="font-medium text-zinc-900">A reasoning AI</b> (Nemotron Ultra) explains each tricky case.</li>
            </ul>
          </section>

          <Reveal>{controls}</Reveal>
        </>
      )}

      {(board || running) && (
        <details className="panel runbar" open={false}>
          <summary>Check another file or use your own</summary>
          {controls}
        </details>
      )}

      {notice && <Notice n={notice} replay={replay} canBrowser={!!csvText} inBrowser={inBrowser} />}

      {(board || running) && (
        <>
          <Stage verdicts={verdicts} count={total || 69} arrived={arrived} lanes={laneTotals} animate={animate} lane={lane} onLane={pickLane} onOpen={openFirstLane} explained={explained} zone={zone} running={running} />

          {board && running && <section className="panel"><Progress prog={prog} stage={stage} /></section>}
          {board && !lane && <p className="hint">Pick a group above to see its shipments.</p>}

          {board && laneMeta && lane && (
            <section ref={panelRef} className={`panel lanepanel ${laneMeta.tone}`} role="tabpanel" aria-label={laneMeta.title}>
              <div className="lanepanel-h">
                <div>
                  <h2><span className={`ldot ${laneMeta.tone}`} aria-hidden /><span>{laneMeta.title}</span> <span className="muted">{laneList.length} shipments</span></h2>
                  <p>{laneMeta.sub}</p>
                </div>
                {laneList.length > 1 && <label className="flex items-center gap-2 text-sm text-zinc-600">Sort by
                  <select className="bg-white border border-zinc-300 text-zinc-900 rounded-lg px-2 py-1.5 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "order" | "amount" | "time")} aria-label="Sort shipments">
                    <option value="order">Filing order</option><option value="amount">Largest amount</option><option value="time">Least time left</option>
                  </select></label>}
                {canInclude && laneList.length > 0 && <button className={`${BTN_SECONDARY} !py-1.5 text-sm`} onClick={() => setLaneInclude(!allIn)}>{allIn ? "Take this group out of the file" : "Add this group to the file"}</button>}
              </div>
              {laneList.length === 0 ? <p className="empty">No shipments in this group.</p> : (
                <>
                  <div className="thead"><span /><span>Shipment</span><span>Importer</span><span>What Customs found</span><span className="r">Time left to claim</span><span className="r">{lane === "NET_BILL_RISK" ? "You'd get or owe" : "Refund"}</span></div>
                  <ul className="rows" key={lane}>
                    {shown.map((v, i) => (
                      <Row key={v.id} v={v} ex={expl[v.id]} i={i} animate checked={include.has(v.id)} canInclude={canInclude} active={sel === v.id} onToggle={() => toggle(v.id)} onOpen={() => setSel(v.id)} />
                    ))}
                  </ul>
                  {laneList.length > PAGE && !expanded && <div className="more-row"><button className={BTN_SECONDARY} onClick={() => setExpanded(true)}>Show all {laneList.length} shipments</button></div>}
                </>
              )}
            </section>
          )}
        </>
      )}

      {board && (
        <>
          {pnote && (
            <section className="panel analyst">
              <div className="analyst-h"><span className="spark" aria-hidden /><h2>The reasoning AI&apos;s overview</h2><span className="cid">{pnote.completionId}</span></div>
              <p className="headline2">{pnote.headline}</p>
              <div className="cols">
                <div>
                  <h3>Look at these first</h3>
                  <ul className="prio">{pnote.priorities.map((p) => <li key={p.id}><button className="linkbtn" onClick={() => openFirstLane(p.id)}><Id>{verdicts.find((v) => v.id === p.id)?.displayNumber ?? p.id}</Id></button><span>{p.reason}</span></li>)}</ul>
                </div>
                <div><h3>Ask the importer before uploading</h3><ul className="q">{pnote.brokerQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
              </div>
            </section>
          )}

          <section className="two">
            <Export board={board} include={include} incRefund={incRefund} incBill={incBill} files={files} ack={ack} setAck={setAck} />
            <div className="stack">
              <div className="panel">
                <h2>What to file, in order</h2>
                <p className="fine" style={{ marginBottom: 12 }}>Customs&apos; rules say some things must be fixed or filed before others. Code applies them. Click a row for the reason.</p>
                <ol className="order">
                  {verdicts.filter((v) => v.lane !== "BLOCKED").map((v) => (
                    <li key={v.id} onClick={() => openFirstLane(v.id)}>
                      <span className="n">{v.order}</span>
                      <span className="e"><Id>{v.displayNumber}</Id></span>
                      <span className="s">{plainStep(v.filingStep)}</span>
                      <span className="m"><Id className={v.money.netCents < 0 ? "text-red-700!" : undefined}>{money(v.money.netCents)}</Id></span>
                    </li>
                  ))}
                </ol>
                <details className="rules"><summary>The rules behind the order (quoted from Customs)</summary>
                  {FILING_ORDER_RULES.map((r) => <p key={r.id}><b>{r.rule}</b><br /><i>&ldquo;{r.quote}&rdquo;</i> <a href={SOURCES[r.sourceId].url} target="_blank" rel="noreferrer">{r.sourceId}</a></p>)}
                </details>
              </div>
              {board.portfolio.iors.length > 0 && (
                <div className="panel">
                  <h2>Importers who owe Customs money</h2>
                  <p className="fine" style={{ marginBottom: 8 }}>Customs can subtract unpaid debts from a refund before paying it (19 CFR 24.72).</p>
                  <table className="tbl num"><thead><tr><th>Importer</th><th>Owes Customs</th><th>Refund</th><th>Likely taken out</th></tr></thead>
                    <tbody>{board.portfolio.iors.map((i) => <tr key={i.ior}><td><Id>{i.ior}</Id></td><td><Id>{money(i.openDebtCents)}</Id></td><td><Id>{money(i.eligibleRefundCents)}</Id></td><td className="warn"><Id>{money(i.expectedDiversionCents)}</Id></td></tr>)}</tbody></table>
                  <p className="fine" style={{ marginTop: 10 }}>Customs adds interest to refunds. This tool doesn&apos;t estimate it.</p>
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
        <div className="foot-grid">
          <p><b>{DISCLAIMER}</b> Uses made-up sample shipments unless you upload your own. Not affiliated with or endorsed by U.S. Customs and Border Protection (CBP).</p>
          <p>
            Checks follow the published rules of the refund program (called CAPE):{" "}
            {Object.entries(SOURCES).map(([k, s], i) => <span key={k}>{i ? ", " : ""}<a href={s.url} target="_blank" rel="noreferrer">{k}</a></span>)}. MIT licensed.
          </p>
        </div>
      </footer>

      {board && !selV && (
        <div className="pinbar"><button className={BTN_PRIMARY} onClick={() => document.querySelector(".dock")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })}>Send the safe part to my broker</button></div>
      )}

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
      {!p.compact && <p className="fine">We never ask for logins, bank details or tax IDs. Files are checked in memory and never stored. You or your broker do the real upload.</p>}
      <div className="field">
        <label className="file">
          <input type="file" accept=".csv,text/csv" onChange={(e) => p.onFile(e.target.files?.[0] ?? null)} />
          <span>{Icon.file} {p.fileName ? p.fileName : "Upload your Customs shipment export (CSV)"}</span>
        </label>
        <div className="row2">
          <label className="in" title="The first 3 characters of your Customs entry numbers">Filer code<input placeholder="A7K" maxLength={3} value={p.filer} onChange={(e) => p.setFiler(e.target.value.toUpperCase())} aria-label="Filer code" /></label>
          <label className="in">Check as of<input type="date" value={p.asOf} onChange={(e) => p.setAsOf(e.target.value)} aria-label="Check as of date" /></label>
        </div>
        <div className="btnrow">
          <button className={BTN_PRIMARY} disabled={p.running || !p.csvText} onClick={p.inBrowser}>Check in this browser (no upload)</button>
          <button className={BTN_SECONDARY} disabled={p.running || !p.csvText || p.liveOk === false} onClick={() => p.live(false)}>Check with the AI</button>
        </div>
        <div className="btnrow">
          {p.compact && <button className={BTN_SECONDARY} disabled={p.running} onClick={p.replay}>{Icon.play} Replay the sample</button>}
          {p.compact && <button className={BTN_SECONDARY} disabled={p.running || p.liveOk === false} onClick={() => p.live(true)}>Run it live</button>}
          <a className={BTN_TERTIARY} href="/api/sample?f=csv"><Download size={16} aria-hidden /> Download the sample CSV</a>
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
      <div><div className="bar-h"><span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--text)" }}><b>Fast AI</b> (Lightning) cleans up the rows</span><span>{prog.l[0]} / {prog.l[1] || "…"}</span></div><div className="track"><div className="fill" style={{ transform: `scaleX(${frac(prog.l)})` }} /></div></div>
      <div><div className="bar-h"><span style={{ fontFamily: "var(--sans)", fontSize: 13, color: "var(--text)" }}><b>Reasoning AI</b> (Ultra) explains the tricky ones</span><span>{prog.u[1] ? `${prog.u[0]} / ${prog.u[1]}` : "waits for the clean-up"}</span></div><div className="track"><div className="fill" style={{ transform: `scaleX(${frac(prog.u)})` }} /></div></div>
      <div className="stage">{stage === "lightning" ? "Cleaning up the rows and reading the broker notes…" : stage === "ultra" ? "The checks are done and the board is ready. The reasoning AI is now explaining the tricky shipments…" : "Done."}</div>
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
  if (v.diversionRisk) meta.push(<span key="d" className="warn">Owes Customs money, may be taken out</span>);
  if (v.money.frameworkGroups.length > 0) meta.push(<span key="f">Trade-deal rate ({v.money.frameworkGroups.join("/")})</span>);
  if (v.leadingZeroFix) meta.push(<span key="z">leading zero kept in the CSV</span>);
  if (v.findings.length > 1) meta.push(<span key="m">+{v.findings.length - 1} more issue{v.findings.length > 2 ? "s" : ""}</span>);
  if (d.reconDeadlineDaysLeft !== null && v.lane !== "BLOCKED") meta.push(<span key="r" className="warn">Related filing due in {d.reconDeadlineDaysLeft}d</span>);
  if (ex) meta.push(<span key="u">AI explained</span>);
  if (!f) meta.unshift(<span key="s">File #{v.order}</span>);
  return (
    <li className={`row ${active ? "sel" : ""} ${animate ? "enter" : ""}`} style={animate ? { animationDelay: `${Math.min(i, 14) * 12}ms` } : undefined} onClick={onOpen}>
      {canInclude
        ? <label className="chk" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={checked} onChange={onToggle} aria-label={`Include ${v.displayNumber} in the refund file`} /></label>
        : <span className="chk na" aria-hidden />}
      <button className="en" onClick={(e) => { e.stopPropagation(); onOpen(); }}><Id>{v.displayNumber}</Id></button>
      <span className="ior" title="Importer"><Id>{v.ior}</Id></span>
      <span className="why">
        <span className={`l1 ${f ? "" : "none"}`} title={f?.cbpError ? `Customs error: "${f.cbpError}"` : undefined}>{f ? plainTitle(f.code, f.cbpError ?? f.detail) : v.lane === "NET_BILL_RISK" ? "No error, but other duties may be billed back" : "Nothing wrong found"}</span>
        <span className="l2">{meta.map((m, k) => <span key={k}>{k ? " · " : ""}{m}</span>)}{win !== null && <span className="m-only"> · {win}d left</span>}</span>
      </span>
      <span className={`win r ${win !== null && win <= 7 ? "hot" : ""}`}>{win !== null ? `${win} day${win === 1 ? "" : "s"} left` : "n/a"}</span>
      <span className={`amt ${amtC < 0 ? "neg" : ""}`}><Id className={amtC < 0 ? "text-red-700!" : undefined}>{money(amtC)}</Id>{isNet && <small>{amtC < 0 ? "you owe" : "net"}</small>}</span>
    </li>
  );
}

function Export({ board, include, incRefund, incBill, files, ack, setAck }: { board: Board; include: Set<string>; incRefund: number; incBill: number; files: ReturnType<typeof buildCapeFiles>; ack: boolean; setAck: (b: boolean) => void }) {
  const p = board.portfolio;
  const heldWait = p.verdicts.filter((v) => v.lane === "WAIT" && include.has(v.id)).length;
  return (
    <div className="panel dock">
      <h2>Your refund file</h2>
      <p className="text-sm text-zinc-600 mb-4"><b className="font-medium text-zinc-900">{include.size}</b> shipments selected. Estimated refund before interest <Id>{money(incRefund)}</Id>.{incBill > 0 && <> Possible bills in this selection <Id className="text-red-700!">{money(incBill)}</Id>.</>}</p>
      {heldWait > 0 && <p className="error" style={{ marginBottom: 12 }}>{heldWait} selected shipments need fixing first.</p>}
      <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand that once Customs accepts this file I can't edit it or remove shipments, and that my licensed customs broker will review the list before it is uploaded.</span></label>
      <div className="btns">
        {files.map((f) => (
          <button key={f.name} className={BTN_PRIMARY} disabled={!ack || !f.count} onClick={() => download(f.name, f.content)}>{Icon.down} {f.name} <span className="text-xs font-normal text-zinc-300">{f.count} shipments, {f.bytes} B{f.ok ? "" : ", check this file"}</span></button>
        ))}
        <div className="btnrow">
          <button className={BTN_SECONDARY} onClick={() => download("cape-broker-handoff.md", handoffNote(p, board.asOf, include), "text/markdown")}>{Icon.down} Note for your broker (.md)</button>
          <button className={BTN_TERTIARY} onClick={() => download("cape-deadlines.csv", deadlineCsv(p))}>{Icon.down} Deadlines (.csv)</button>
        </div>
      </div>
      <p className="fine" style={{ marginTop: 14 }}>The CSV follows Customs&apos; format: a single &ldquo;Entry Number&rdquo; column, 11 characters, no dashes, at most 9,999 shipments and 1MB per file. {PREPARED_FOR_PLAIN}</p>
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
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Shipment ${v.displayNumber}`}>
        <button ref={closeRef} className="x" onClick={onClose} aria-label="Close">{Icon.close}</button>
        <div className="d-meta"><span>Importer <Id>{v.ior}</Id></span><span>Number {v.order} in your filing order</span></div>
        <h2><Id className="text-sm!">{v.displayNumber}</Id></h2>
        <span className={`pill ${meta.tone}`}>{meta.title}</span>
        <p className="verdict">{plainVerdict(v)}</p>
        <p className="step" title={v.filingStep}>{plainStep(v.filingStep)}</p>

        <div className={`story ${m.netCents < 0 ? "bill" : "ok"}`}>
          <span className="story-l">{m.netCents < 0 ? "You'd owe Customs" : "You'd get back"}</span>
          <b className="story-n"><CountMoney cents={m.netCents} animate dur={1000} delay={150} /></b>
          <Waterfall m={m} />
          <div className="parts">
            <div><span>Struck-down tariff you paid</span><Id>{money(m.grossIeepaCents)}</Id></div>
            {m.frameworkCarveOutCents > 0 && <div><span>Part that stays owed under a trade deal ({m.frameworkGroups.join("/")})</span><Id>-{money(m.frameworkCarveOutCents)}</Id></div>}
          </div>
        </div>
        <p className="fine">Plain code worked this out to the cent. When Customs recalculates a shipment, it can also bill duties that were underpaid (under other tariff programs, 232/301/201), and that comes off the refund.</p>
        {v.diversionRisk && <p className="fine warn" style={{ marginTop: 6 }}>This importer owes Customs money from before. Customs may subtract it from the refund (19 CFR 24.72).</p>}

        {ex && (
          <div className="sect ultra">
            <div className="analyst-h"><span className="spark" aria-hidden /><h3>What the reasoning AI says</h3><span className="cid">{ex.completionId}</span></div>
            <span className="ai-tag">AI analyst · Nemotron Ultra</span>
            <p>{ex.summary}</p>
            <p className="next"><b>Next step:</b> {ex.brokerAction}</p>
            <p><b>Why it sits here:</b> {ex.whyThisOrder}</p>
            {ex.citations.length > 0 && <div className="cites">{ex.citations.map((c) => <span key={c}>{c}</span>)}</div>}
            {ex.guardStripped > 0 && <p className="fine">The number guard removed {ex.guardStripped} figure{ex.guardStripped === 1 ? "" : "s"} that didn't match the code's math.</p>}
            {ex.reasoning && <details style={{ marginTop: 10 }}><summary>The AI&apos;s reasoning trace ({ex.ms} ms)</summary><pre>{ex.reasoning}</pre></details>}
          </div>
        )}

        <div className="sect">
          <h3>What Customs&apos; checks found</h3>
          {v.findings.length === 0 ? <p className="pos" style={{ color: "var(--go-ink)" }}>{v.lane === "NET_BILL_RISK" ? "No error. The risk is the money: see the math above." : "Nothing wrong found by the checks in this tool."}</p> : v.findings.map((f, i) => (
            <div className="finding" key={i}>
              <p><b>{plainTitle(f.code, f.detail)}.</b> {PLAIN_FINDING[f.code]?.what}</p>
              <p>{f.detail}</p>
              {f.fix && <p className="fix"><b>How to fix it:</b> {f.fix}</p>}
              {f.cbpError ? <div className="cbpq">Customs&apos; exact error: &ldquo;{f.cbpError}&rdquo;{ERROR_DEFINITIONS[f.cbpError] ? <span> (means: {ERROR_DEFINITIONS[f.cbpError]})</span> : null}</div> : <div className="cbpq soft">Filing-order rule, not a Customs error</div>}
              <p><a className="src" href={SOURCES[f.sourceId]?.url} target="_blank" rel="noreferrer">{SOURCES[f.sourceId]?.label ?? f.sourceId}</a></p>
            </div>
          ))}
        </div>

        <div className="sect">
          <h3>Dates <span className="muted" style={{ fontWeight: 400 }}>as of {board.asOf}</span></h3>
          <table className="tbl"><tbody><tr><td>Finalized by Customs</td><td>{info?.liquidationDate ?? info?.liquidationStatus}</td></tr></tbody></table>
          {d.capeCutoffDate && <Countdown label="Last day to claim (80 days after Customs finalized it)" date={d.capeCutoffDate} left={d.capeDaysLeft} span={80} />}
          {d.protestDeadlineDate && <Countdown label="Last day to appeal the amount (180 days after)" date={d.protestDeadlineDate} left={d.protestDaysLeft} span={180} />}
          <table className="tbl"><tbody>
            {d.reconDeadlineDaysLeft !== null && <tr><td>Deadline for a related filing (&ldquo;reconciliation&rdquo;)</td><td>{d.reconDeadlineDaysLeft} days</td></tr>}
            {d.projectedLiquidationDaysLeft !== null && <tr><td>Customs expects to finalize it</td><td>in {d.projectedLiquidationDaysLeft} days</td></tr>}
          </tbody></table>
        </div>

        {info && (
          <div className="sect">
            <h3>Products and the broker&apos;s note</h3>
            <table className="tbl"><tbody>{info.lines.map((l) => <tr key={l.lineNo}><td>#{l.lineNo} <Id>{l.hts}</Id> {l.country}{l.framework ? ` · ${l.framework} trade deal` : ""}</td><td>{l.value} / struck-down tariff {l.ieepaDuty}</td></tr>)}</tbody></table>
            {info.notes && <p className="note-q">&ldquo;{info.notes}&rdquo;</p>}
            {info.noteSignals.length > 0 && <div className="sig">Topics the AI spotted: {info.noteSignals.map((s) => <span key={s}>{s}</span>)}</div>}
            {info.noteConflicts.map((c, i) => <p key={i} className="error" style={{ marginTop: 8 }}>The note disagrees with the data: {c.message}</p>)}
            {info.parseNotes.map((c, i) => <p key={i} className="fine" style={{ marginTop: 6 }}>{c}</p>)}
          </div>
        )}

        {(v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK") && <div style={{ marginTop: 28 }}><button className={BTN_PRIMARY} onClick={onToggle}>{included ? "Take out of the refund file" : "Add to the refund file"}</button></div>}
        <p className="fine" style={{ marginTop: 14 }}>{PREPARED_FOR_PLAIN}</p>
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
  credit: { title: "Live runs are paused: the AI account is out of credit.", body: "The AI host (Nebius Token Factory) said the credit balance is used up, so no AI ran. You weren't charged and your file wasn't stored. The recorded run shows exactly what a live run returns, with proof ids." },
  auth: { title: "Live runs are paused: this site's AI key was rejected.", body: "The AI host refused the key, so no AI ran. Your file wasn't stored. The recorded run shows what a live run returns." },
  disabled: { title: "Live runs are switched off here.", body: "No AI key is set up on this site. The recorded run shows what a live run returns." },
  cap: { title: "This site's live-run budget is used up.", body: "To keep the demo affordable, each copy of the site allows a fixed number of live runs. The recorded run shows what a live run returns." },
  partial: { title: "The AI didn't answer, so there are no explanations on this board.", body: "The checks and the money below were done by plain code and are complete. Only the AI explanations are missing." },
};
function Notice({ n, replay, canBrowser, inBrowser }: { n: NoticeState; replay: () => void; canBrowser: boolean; inBrowser: () => void }) {
  const t = NOTICE[n.kind];
  return (
    <section className="notice" role="alert">
      <h3>{t.title}</h3>
      <p>{t.body}</p>
      <div className="btnrow">
        <button className={BTN_PRIMARY} onClick={replay}>Play the recorded run</button>
        {canBrowser && <button className={BTN_SECONDARY} onClick={inBrowser}>Check my file in this browser (no AI)</button>}
      </div>
      {n.detail && <details><summary>What the server said</summary><pre>{n.detail}</pre></details>}
    </section>
  );
}

const IMPACT: Record<number, string> = { 0: "Tool updated", 1: "Checked, no change needed", 3: "Not covered by this tool" };

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
        <div><div className="when">Customs&apos; page now</div><blockquote>{f.a ?? <em>(removed)</em>}</blockquote></div>
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
    <section className="watch bg-zinc-50 border border-zinc-200 rounded-xl p-5 mt-8" aria-label="Compliance Status">
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Live CBP Check</span>
      <h2 className="mt-3 text-base font-semibold tracking-tight text-zinc-900">Compliance Status</h2>
      <p className="mt-1 text-sm font-medium text-zinc-900">Did Customs change the rules since this was built?</p>
      <p className="fine">Customs publishes the refund rules on a web page. This reads the live page and compares it with a copy saved on 2026-07-11. Every change is quoted from the page (July on the left, now on the right). No AI is involved.</p>
      <div className="mt-3"><button className={BTN_SECONDARY} disabled={busy} onClick={go}>{busy ? "Reading the page…" : "Check Customs' page now"}</button></div>
      {r && (
        <div className="wr">
          <p className={r.ok ? "" : "error"}>{r.note}</p>
          {r.ok && <>
            <p><b>{key.length}</b> change{key.length === 1 ? "" : "s"} affect this tool&apos;s checks; {rest.length} more are just for information. The page&apos;s &quot;Last Modified&quot; date: {r.lastModified?.before ?? "none in the July capture"} → <b>{r.lastModified?.after ?? "none"}</b>. {r.noiseDropped} lines of layout and wording noise were filtered.</p>
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
  if (!receipt) return <section className="panel receipt"><h2>What the AI did (receipt)</h2><p className="fine">Appears when the run finishes.</p></section>;
  const L = receipt.lightning, U = receipt.ultra;
  const total = L.costUsd + U.costUsd;
  return (
    <section className="panel receipt">
      <h2>What the AI did (receipt) <span className="muted">· {receipt.mode === "replay" ? "recorded real run" : "live run"} · {new Date(receipt.ranAt).toLocaleString()}</span></h2>
      <div className="rc">
        <div>
          <h4>Fast AI: Nemotron 3.5 Lightning <small>{L.model}</small></h4>
          <p><b>{L.calls}</b> calls in parallel · {L.promptTokens.toLocaleString()} in / {L.completionTokens.toLocaleString()} out tokens · avg {L.avgMs} ms · {L.failed} failed</p>
          <p className="fine">Job: cleaned up each row and tagged the broker&apos;s notes. Double-checked against plain code: <b>{n.agree}/{n.checked}</b> fields agree{n.disagreements.length ? `; code overrode ${n.disagreements.length} disagreement(s):` : "."}</p>
          {n.disagreements.slice(0, 5).map((d, i) => <p key={i} className="fine mono">{d.entry} · {d.field}: AI said {d.lightning}, code says {d.deterministic}</p>)}
        </div>
        <div>
          <h4>Reasoning AI: Nemotron 3 Ultra <small>{U.model}</small></h4>
          <p><b>{U.calls}</b> calls · {U.promptTokens.toLocaleString()} in / {U.completionTokens.toLocaleString()} out tokens ({U.reasoningTokens.toLocaleString()} reasoning) · avg {U.avgMs} ms · {U.failed} failed</p>
          <p className="fine">Job: explained each tricky case using Customs&apos; own rules. Any dollar figure it writes is deleted unless the code already calculated it.</p>
        </div>
        <div>
          <h4>Total</h4>
          <p><b>~{total < 0.01 ? "<$0.01" : `$${total.toFixed(3)}`}</b> at list price · wall {(receipt.wallMs / 1000).toFixed(1)} s</p>
          <p className="fine">Estimate: tokens × Nebius list price (Ultra $1.00 in / $3.00 out, Lightning $0.06 / $0.24 per 1M). Host {receipt.host}.</p>
        </div>
      </div>
      <details><summary>{L.ids.length + U.ids.length} AI call ids (proof from Token Factory)</summary>
        <pre className="ids">{[...L.ids.map((i) => `fast AI      ${i}`), ...U.ids.map((i) => `reasoning AI ${i}`)].join("\n")}</pre></details>
    </section>
  );
}
