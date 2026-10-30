"use client";
import { OPENROUTER_LABEL } from "@/lib/provider";
import { CoverageLine, DrawerCustoms, PhaseChip, rowCustoms } from "./CustomsPanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ERROR_DEFINITIONS, FILING_ORDER_RULES, SOURCES } from "@/lib/cbp-rules";
import { browserBoard } from "@/lib/browser-board";
import { buildCapeDeclaration, buildCapeFiles, deadlineCsv, defaultInclude, DISCLAIMER, handoffNote, IRREVERSIBLE_PLAIN, PREPARED_FOR_PLAIN } from "@/lib/export";
import { zipFiles } from "@/lib/cape-template";
import { fmtUsd } from "@/lib/money";
import { checkUpload } from "@/lib/parse";
import { vetoStats } from "@/lib/signals";
import type { Explanation, PortfolioNote, Receipt, RunEvent, RunResult } from "@/lib/pipeline";
import type { WatchResult, Change } from "@/lib/rulewatch";
import type { Lane, Verdict } from "@/lib/types";
import { PLAIN_FINDING, otherDutyNote, plainStep, plainTitle, plainVerdict } from "@/lib/plain";
import { LANES, amountHeader, drawerHero, laneOf } from "@/lib/lanes-ui";
import Stage from "./Stage";
import { CountInt, CountMoney, Reveal, TwistCard, Words } from "./motion";
import Waterfall from "./Waterfall";
import { AlertTriangle, ChevronDown, Download, FileText, Play, Upload, X } from "lucide-react";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_TERTIARY, Id } from "./ui";
import Audience from "./Audience";
import Deadlines, { DrawerRoutes } from "./Deadlines";
import ExportExtras from "./ExportExtras";
import RuleRescore from "./RuleRescore";
import OfferCheck from "./OfferCheck";
import ScoredTest from "./ScoredTest";
import Sources from "./Sources";
import StageReceipt from "./StageReceipt";
import WhyLlm from "./WhyLlm";

type Board = Omit<RunResult, "receipt" | "explanations" | "portfolioNote">;
const PAGE = 12;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (c: number) => fmtUsd(c);
function download(name: string, content: string, type = "text/csv") {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function downloadZip(name: string, files: { name: string; content: string }[]) {
  const url = URL.createObjectURL(new Blob([zipFiles(files) as BlobPart], { type: "application/zip" }));
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
    <svg className="mark" viewBox="0 0 64 64" aria-hidden><rect width="64" height="64" rx="16" fill="var(--accent)" /><g fill="var(--accent-ink)"><rect x="13" y="22" width="5" height="20" rx="1" /><rect x="22" y="14" width="5" height="36" rx="1" /><rect x="31" y="26" width="5" height="12" rx="1" /><rect x="40" y="14" width="5" height="36" rx="1" /><rect x="49" y="22" width="3" height="20" rx="1" /></g></svg>
  );
}

export default function Desk() {
  const [board, setBoard] = useState<Board | null>(null);
  const [runOpen, setRunOpen] = useState(false);
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
  const [liveNote, setLiveNote] = useState("");
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

  async function live(useSample: boolean | "mini") {
    reset(); setMode("live"); t0.current = Date.now();
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(useSample === "mini" ? { mini: true } : useSample ? { sample: true } : { csv: csvText, asOf, filerCodes: filer ? [filer] : [] }) });
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
    const text = await f.text();
    const chk = checkUpload(text);
    if (!chk.ok) { setCsvText(""); setFileName(""); setErr(chk.error); return; }
    setCsvText(text); setFileName(f.name); setErr("");
  }
  useEffect(() => { fetch("/api/run").then((r) => r.json()).then((j) => { setLiveOk(!!j.live); setLiveNote(j.live ? "" : String(j.note ?? "Live AI is not available right now.")); }).catch(() => setLiveOk(false)); }, []);

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
    <RunControls {...{ running, liveOk, liveNote, csvText, fileName, filer, setFiler, asOf, setAsOf, err, onFile, replay, live, inBrowser }} compact={!!board || running} />
  );

  const zone = board ? (
    <div className="zone-in board-top">
      <div className="board-copy">
        <h2 className="headline"><b><CountInt n={attention} animate={animate} dur={1000} delay={500} /></b> of {verdicts.length} shipments shouldn&apos;t go in the refund file yet. Here&apos;s why.</h2>
        {laneTotals && (
          <p className="answer">
            {laneTotals.NET_BILL_RISK.count} {laneTotals.NET_BILL_RISK.count === 1 ? "shipment" : "shipments"} could turn a refund into a bill. Open a group below to see what Customs found.
          </p>
        )}
        <p className="runmeta">
          <span>{/^SYNTHETIC SAMPLE/.test(board.label) ? `Sample data: ${verdicts.length} made-up shipments. Not real trade data.` : board.label}</span>
          <span>Checked as of <span className="mono">{board.asOf}</span></span>
          {board.asOf !== today() && <span data-testid="asof-note">Day counts run from {board.asOf}, the date in this data, not from today ({today()}).</span>}
        </p>
      </div>
      {laneTotals && (
        <div className="claimcard">
          <p className="claim-label">Safe to claim</p>
          <p className="claim-num"><CountMoney cents={laneTotals.FILE_NOW.refundCents} animate={animate} dur={800} delay={300} /></p>
          <p className="claim-sub"><b>{laneTotals.FILE_NOW.count} {laneTotals.FILE_NOW.count === 1 ? "shipment" : "shipments"}</b> · Customs&apos; checks found nothing wrong</p>
          <button className={BTN_PRIMARY} onClick={() => document.querySelector(".dock")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" })}>Add safe shipments to the refund file</button>
        </div>
      )}
    </div>
  ) : (
    <div className="zone-in">
      <p className="text-sm font-medium text-[var(--text)]">Checking the file</p>
      <h2 className="headline text-3xl font-semibold tracking-tight text-[var(--text)]">Sorting {total || 69} shipments into four groups.</h2>
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
        <p className="powered"><i className="live-dot" aria-hidden />{receipt?.provider === "openrouter" ? OPENROUTER_LABEL : "Nemotron AI models on Nebius Token Factory"}</p>
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
              <h2 className="display hero-headline" aria-label="Check the refund file before you send it.">
                Check the refund file<br />before you send it.
              </h2>
              <p className="hero-lead">
                US importers are owed money back for tariffs that were struck down. To get it, they upload one file to Customs, and it can&apos;t be undone. One wrong shipment can turn a refund into a bill. <b className="font-medium text-[var(--text)]">This checks the file first.</b>
              </p>
              <div className="cta mt-6 flex flex-wrap items-center gap-3">
                <button className="hero-btn-primary" disabled={running} onClick={replay}>{Icon.play} Run the sample</button>
                <button className="hero-btn-secondary" disabled={running || liveOk === false} onClick={() => live(true)} title={liveOk === false ? liveNote : "Calls the AI now: allow up to about 3 minutes"}>Run it live</button>
              </div>
              {liveOk === false && <p className="hero-disclosure" data-testid="live-note" role="status">{liveNote}</p>}
              <p className="hero-disclosure">Sample data: made-up shipments, not real trade data. Not legal advice. We never ask for logins or bank details.</p>
            </div>
            <TwistCard />
          </section>

          <Audience />

          <section aria-label="How it works" className="how-it-works max-w-2xl">
            <h3 className="how-title">How the check works</h3>
            <div className="how-rows">
              <div className="how-row">
                <h4 className="how-h">Plain code</h4>
                <p className="how-p">does all the money math and sorts every shipment. The AI never makes up a number.</p>
              </div>
              <div className="how-row">
                <h4 className="how-h">A fast AI</h4>
                <p className="how-p">(Nemotron Lightning) cleans up messy data.</p>
              </div>
              <div className="how-row">
                <h4 className="how-h">A reasoning AI</h4>
                <p className="how-p">(Nemotron Ultra) explains each tricky case.</p>
              </div>
            </div>
          </section>

          <WhyLlm />

          <Reveal>{controls}</Reveal>
        </>
      )}

      {(board || running) && (
        <>
          <div className="boardbar">
            <p className="boardbar-t"><span className="boardbar-dot" aria-hidden />{mode === "replay" ? "Recorded run" : mode === "live" ? "Live run" : mode === "browser" ? "Browser-only check" : "Checking"}</p>
            <button type="button" className={`${BTN_TERTIARY} boardbar-btn`} aria-expanded={runOpen} aria-controls="runbar-panel" onClick={() => setRunOpen((o) => !o)}>
              <Upload size={14} aria-hidden /><span>Check another file<span className="boardbar-more"> or use your own</span></span>
            </button>
          </div>
          {runOpen && <section id="runbar-panel" className="panel runbar-panel">{controls}</section>}
        </>
      )}

      {notice && <Notice n={notice} replay={replay} canBrowser={!!csvText} inBrowser={inBrowser} />}

      {(board || running) && (
        <>
          <Stage verdicts={verdicts} count={total || 69} arrived={arrived} lanes={laneTotals} animate={animate} lane={lane} onLane={pickLane} onOpen={openFirstLane} explained={explained} zone={zone} running={running} hero={!!board} />

          {board && running && <section className="panel"><Progress prog={prog} stage={stage} /></section>}
          {board && !lane && <p className="hint">Pick a group above to see its shipments.</p>}

          {board && laneMeta && lane && (
            <section ref={panelRef} className={`panel lanepanel ${laneMeta.tone}`} role="tabpanel" aria-label={laneMeta.title}>
              <div className="lanepanel-h">
                <div>
                  <h2><span className={`ldot ${laneMeta.tone}`} aria-hidden /><span>{laneMeta.title}</span> <span className="muted">{laneList.length} shipments</span></h2>
                  <p>{laneMeta.sub}</p>
                </div>
                {laneList.length > 1 && <label className="flex items-center gap-2 text-sm text-[var(--muted)]">Sort by
                  <select className="bg-[var(--raised)] border border-[var(--control)] text-[var(--text)] rounded-lg px-2 py-1.5 text-sm" value={sortBy} onChange={(e) => setSortBy(e.target.value as "order" | "amount" | "time")} aria-label="Sort shipments">
                    <option value="order">Filing order</option><option value="amount">Largest amount</option><option value="time">Least time left</option>
                  </select></label>}
                {canInclude && laneList.length > 0 && <button className={`${BTN_SECONDARY} !py-1.5 text-sm`} onClick={() => setLaneInclude(!allIn)}>{allIn ? "Take this group out of the file" : "Add this group to the file"}</button>}
              </div>
              {laneList.length === 0 ? <p className="empty">No shipments in this group.</p> : (
                <>
                  <div className="thead"><span /><span>Shipment</span><span>Importer</span><span>What Customs found</span><span className="r">Time left to claim</span><span className="r">{amountHeader(lane)}</span></div>
                  <ul className="rows" key={lane}>
                    {shown.map((v, i) => (
                      <Row key={v.id} caught={(board.entryInfo[v.id]?.noteConflicts.length ?? 0) > 0} v={v} ex={expl[v.id]} i={i} animate checked={include.has(v.id)} canInclude={canInclude} active={sel === v.id} onToggle={() => toggle(v.id)} onOpen={() => setSel(v.id)} />
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
            <section className="analyst r6-detail r6-analyst">
              <h2 className="r6-title">The reasoning AI&apos;s overview</h2>
              <p className="headline2">{pnote.headline}</p>
              <div className="cols">
                <div>
                  <h3 className="r6-sub">Look at these first</h3>
                  <ul className="prio">{pnote.priorities.map((p) => <li key={p.id}><button className="linkbtn" onClick={() => openFirstLane(p.id)}><Id>{verdicts.find((v) => v.id === p.id)?.displayNumber ?? p.id}</Id></button><span>{p.reason}</span></li>)}</ul>
                </div>
                <div><h3 className="r6-sub">Ask the importer before uploading</h3><ul className="q">{pnote.brokerQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></div>
              </div>
              <p className="r6-cid">{pnote.completionId}</p>
            </section>
          )}

          <section className="two r6-two">
            <Export board={board} include={include} incRefund={incRefund} incBill={incBill} files={files} ack={ack} setAck={setAck} extras={<ExportExtras board={board} include={include} explanations={expl} portfolioNote={pnote} receipt={receipt} mode={mode} ack={ack} />} />
            <div className="stack">
              <div className="r6-detail r6-filing">
                <h2 className="r6-title">What to file, in order</h2>
                <p className="r6-fine">Customs&apos; rules say some things must be fixed or filed before others. Code applies them. Click a row for the reason.</p>
                <ol className="order">
                  {verdicts.filter((v) => v.lane !== "BLOCKED").map((v) => (
                    <li key={v.id} onClick={() => openFirstLane(v.id)}>
                      <span className="n">{v.order}</span>
                      <span className="e"><Id>{v.displayNumber}</Id></span>
                      <span className="s">{plainStep(v.filingStep, board.asOf)}</span>
                      <span className={`m r6-money${v.money.netCents < 0 ? " r6-owe" : ""}`}>{money(v.money.netCents)}</span>
                    </li>
                  ))}
                </ol>
                <details className="rules"><summary>The rules behind the order (quoted from Customs)</summary>
                  {FILING_ORDER_RULES.map((r) => <p key={r.id}><b>{r.rule}</b><br /><i>&ldquo;{r.quote}&rdquo;</i> <a href={SOURCES[r.sourceId].url} target="_blank" rel="noreferrer">{r.sourceId}</a></p>)}
                </details>
              </div>
              {board.portfolio.iors.length > 0 && (
                <div className="r6-detail r6-iors">
                  <h2 className="r6-title">Importers who owe Customs money</h2>
                  <p className="r6-fine">Customs can subtract unpaid debts from a refund before paying it (19 CFR 24.72).</p>
                  <table className="tbl num"><thead><tr><th>Importer</th><th>Owes Customs</th><th>Refund</th><th>Likely taken out</th></tr></thead>
                    <tbody>{board.portfolio.iors.map((i) => <tr key={i.ior}><td><Id>{i.ior}</Id></td><td className="r6-money">{money(i.openDebtCents)}</td><td className="r6-money">{money(i.eligibleRefundCents)}</td><td className="r6-money r6-owe">{money(i.expectedDiversionCents)}</td></tr>)}</tbody></table>
                  <p className="r6-fine">Customs adds interest to refunds. This tool doesn&apos;t estimate it.</p>
                </div>
              )}
            </div>
          </section>

          <Deadlines portfolio={board.portfolio} asOf={board.asOf} onOpen={openFirstLane} />
          <RuleWatch />
          <RuleRescore csvText={csvText} asOf={board.asOf} filerCodes={board.filerCodes} isSample={!csvText} />
          <ScoredTest />
          <ReceiptPanel receipt={receipt} board={board} mode={mode} />
          <StageReceipt receipt={receipt} explanations={expl} portfolioNote={pnote} mode={mode} />
        </>
      )}
      {!board && <RuleWatch />}
      {!board && <ScoredTest />}

      <OfferCheck />

      <Sources />
      <CoverageLine />

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
type RunControlProps = { running: boolean; liveOk: boolean | null; liveNote: string; csvText: string; fileName: string; filer: string; setFiler: (s: string) => void; asOf: string; setAsOf: (s: string) => void; err: string; onFile: (f: File | null) => void; replay: () => void; live: (sample: boolean | "mini") => void; inBrowser: () => void; compact: boolean };
function RunControls(p: RunControlProps) {
  return (
    <div className={p.compact ? "" : "panel runbox"}>
      {!p.compact && <h3>Check your own file</h3>}
      {!p.compact && <p className="fine">We never ask for logins, bank details or tax IDs. Files are checked in memory and never stored. You or your broker do the real upload.</p>}
      <div className="field">
        <label className="file run-file">
          <input type="file" accept=".csv,text/csv" onChange={(e) => p.onFile(e.target.files?.[0] ?? null)} />
          <span>{Icon.file} {p.fileName ? p.fileName : "Upload your Customs shipment export (CSV)"}</span>
        </label>
        <div className="row2">
          <label className="in run-field" title="The first 3 characters of your Customs entry numbers"><span className="run-label">Filer code</span><input className="run-input" placeholder="A7K" maxLength={3} value={p.filer} onChange={(e) => p.setFiler(e.target.value.toUpperCase())} aria-label="Filer code" /></label>
          <label className="in run-field"><span className="run-label">Check as of</span><input className="run-input" type="date" value={p.asOf} onChange={(e) => p.setAsOf(e.target.value)} aria-label="Check as of date" /></label>
        </div>
        <div className="btnrow">
          <button className={BTN_PRIMARY} disabled={p.running || !p.csvText} onClick={p.inBrowser}>Check in this browser (no upload)</button>
          <button className={BTN_SECONDARY} disabled={p.running || !p.csvText || p.liveOk === false} onClick={() => p.live(false)}>Check with the AI</button>
        </div>
        <div className="btnrow">
          {p.compact && <button className={BTN_SECONDARY} disabled={p.running} onClick={p.replay}>{Icon.play} Replay the sample</button>}
          {p.compact && <button className={BTN_SECONDARY} disabled={p.running || p.liveOk === false} onClick={() => p.live(true)} title={p.liveOk === false ? p.liveNote : undefined}>Run it live</button>}
          <button className={BTN_TERTIARY} disabled={p.running || p.liveOk === false} onClick={() => p.live("mini")} title={p.liveOk === false ? p.liveNote : "10 shipments, 3 with notes that contradict the data. About 20 seconds."} data-testid="live-mini">Live mini-run (10 shipments)</button>
          <a className={BTN_TERTIARY} href="/api/sample?f=csv"><Download size={16} aria-hidden /> Download the sample CSV</a>
        </div>
        <p className="fine" data-testid="schema-note">Upload format: a derived schema. It follows CBP&apos;s ES-003 report (entry, lines, IEEPA duty) plus ES-701 dates, and adds columns of our own (hts_valid, framework_group, non_ieepa_underpaid_usd, broker_note) that you fill in or leave blank. The file you send to CBP is different: one column, &ldquo;Entry Number&rdquo;.</p>
        {p.liveOk === false && p.liveNote && <p className="fine" data-testid="live-note-controls">{p.liveNote}</p>}
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

function Row({ caught: board_caught, v, ex, i, animate, checked, canInclude, active, onToggle, onOpen }: { caught?: boolean; v: Verdict; ex?: Explanation; i: number; animate: boolean; checked: boolean; canInclude: boolean; active: boolean; onToggle: () => void; onOpen: () => void }) {
  const f = v.findings[0];
  const d = v.deadlines;
  const isNet = v.lane === "NET_BILL_RISK";
  const amtC = isNet || v.lane === "FILE_NOW" ? v.money.netCents : v.money.ieepaRefundableCents;
  const win = d.capeDaysLeft !== null && d.capeDaysLeft >= 0 ? d.capeDaysLeft : null;
  const meta: React.ReactNode[] = [];
  meta.push(...rowCustoms(v));
  if (otherDutyNote(v)) meta.push(<span key="od" className="warn" data-testid="other-duty-row">{otherDutyNote(v)}</span>);
  if (v.diversionRisk) meta.push(<span key="d" className="warn">Owes Customs money, may be taken out</span>);
  if (v.money.frameworkGroups.length > 0) meta.push(<span key="f">Trade-deal rate ({v.money.frameworkGroups.join("/")})</span>);
  if (v.leadingZeroFix) meta.push(<span key="z">leading zero kept in the CSV</span>);
  if (v.findings.length > 1) meta.push(<span key="m">+{v.findings.length - 1} more issue{v.findings.length > 2 ? "s" : ""}</span>);
  if (d.reconDeadlineDaysLeft !== null && v.lane !== "BLOCKED") meta.push(<span key="r" className="warn">Related filing due in {d.reconDeadlineDaysLeft}d</span>);
  if (board_caught) meta.push(<span key="c" className="warn" data-testid="ai-caught-row">AI caught a note that disagrees</span>);
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
      <span className={`amt ${amtC < 0 ? "neg" : ""}`}><Id className={amtC < 0 ? "text-[var(--stop-ink)]!" : undefined}>{money(amtC)}</Id>{isNet && <small>{amtC < 0 ? "you owe" : "net"}</small>}</span>
    </li>
  );
}

function Export({ board, include, incRefund, incBill, files, ack, setAck, extras }: { extras?: React.ReactNode; board: Board; include: Set<string>; incRefund: number; incBill: number; files: ReturnType<typeof buildCapeFiles>; ack: boolean; setAck: (b: boolean) => void }) {
  const p = board.portfolio;
  const heldWait = p.verdicts.filter((v) => v.lane === "WAIT" && include.has(v.id)).length;
  const build = useMemo(() => buildCapeDeclaration(p.verdicts, include), [p.verdicts, include]);
  return (
    <div className="dock r6-detail r6-dock">
      <h2 className="r6-title">Your refund file</h2>
      <p className="r6-body"><b>{include.size}</b> shipments selected. Estimated refund before interest <span className="r6-money">{money(incRefund)}</span>.{incBill > 0 && <> Possible bills in this selection <span className="r6-money r6-owe">{money(incBill)}</span>.</>}</p>
      {heldWait > 0 && <p className="error" style={{ marginBottom: 12 }}>{heldWait} selected shipments need fixing first.</p>}
      <label className="ack"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /><span>I understand that once Customs accepts this file I can't edit it or remove shipments, and that my licensed customs broker will review the list before it is uploaded.</span></label>
      <div className="btns">
        {!build.ok && <p className="error" role="alert" data-testid="cape-refused">{build.message}</p>}
        {build.ok && build.files.length > 1 && <p className="r6-body" data-testid="cape-batch-note">{build.note}</p>}
        <div className="r6-primary-row">
          {build.ok && files.map((f, i) => (
            <button key={f.name} className={`${i === 0 ? BTN_PRIMARY : BTN_SECONDARY}${i === 0 ? " r6-primary" : ""}`} disabled={!ack || !f.count} onClick={() => download(f.name, f.content)}>{Icon.down} <span className="r6-file-name">{f.name}</span> <span className="r6-file-meta">{f.count.toLocaleString("en-US")} shipments, {f.bytes.toLocaleString("en-US")} B{f.ok ? "" : ", check this file"}</span></button>
          ))}
          {build.ok && files.length > 1 && (
            <button className={BTN_SECONDARY} data-testid="dl-cape-zip" disabled={!ack} title={ack ? undefined : "Tick the box above first"} onClick={() => downloadZip("cape-declarations.zip", files)}>{Icon.down} Download all {files.length} files (.zip)</button>
          )}
        </div>
        <div className="r6-secondary-row">
          <button className={BTN_SECONDARY} disabled={!ack} title={ack ? undefined : "Tick the box above first"} onClick={() => download("cape-broker-handoff.md", handoffNote(p, board.asOf, include), "text/markdown")}>{Icon.down} Note for your broker (.md)</button>
          <button className={BTN_TERTIARY} disabled={!ack} title={ack ? undefined : "Tick the box above first"} onClick={() => download("cape-deadlines.csv", deadlineCsv(p))}>{Icon.down} Deadlines (.csv)</button>
        </div>
        {extras}
      </div>
      <p className="r6-fine">The CSV follows Customs&apos; upload template: a single &ldquo;Entry Number&rdquo; column, 11 characters, no dashes, a leading zero kept with an apostrophe, and at most 9,999 shipments and 1MB per file. Longer lists are split into numbered files automatically. {PREPARED_FOR_PLAIN}</p>
    </div>
  );
}

function Countdown({ label, date, left, span }: { label: string; date: string; left: number | null; span: number }) {
  if (left === null) return null;
  const closed = left < 0;
  const used = Math.max(0, Math.min(1, (span - left) / span));
  const hot = !closed && left <= 7;
  return (
    <div className="d-cd">
      <div className="d-cd-h"><span>{label} <span className="d-muted">{date}</span></span><b className={hot || closed ? "d-hot" : ""}>{closed ? "closed" : `${left} day${left === 1 ? "" : "s"} left`}</b></div>
      <div className="d-cd-track" role="img" aria-label={`${label}: ${closed ? "closed" : `${left} days left`}`}><i className={hot || closed ? "d-hot" : ""} style={{ width: `${(closed ? 1 : used) * 100}%` }} /></div>
    </div>
  );
}

function Drawer({ v, board, ex, onClose, included, onToggle }: { v: Verdict; board: Board; ex?: Explanation; onClose: () => void; included: boolean; onToggle: () => void }) {
  const info = board.entryInfo[v.id];
  const m = v.money; const d = v.deadlines;
  const meta = laneOf(v.lane);
  const hero = drawerHero(v.lane, m);
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
        <div className="d-bar">
          <div className="d-bar-l">
            <Id className="d-chip">{v.displayNumber}</Id>
            <span className={`d-status ${meta.tone}`}><i aria-hidden />{meta.title}</span>
            {v.customs && <PhaseChip phase={v.customs.phase} lane={v.lane} />}
          </div>
          <button ref={closeRef} className="x" onClick={onClose} aria-label="Close">{Icon.close}</button>
        </div>
        <p className="d-sub">Importer <span className="d-id">{v.ior}</span> · Number {v.order} in your filing order</p>
        <p className="d-answer">{plainVerdict(v)}</p>
        <p className="d-step" title={v.filingStep}>{plainStep(v.filingStep)}</p>

        {v.lane === "BLOCKED" ? (
          <div className="d-money">
            <p className="d-money-l">Not claimable</p>
            <p className="d-figure" aria-label="No refund">{"\u2014"}</p>
            <p className="d-note" data-testid="not-claimable">Customs would reject this shipment, so nothing is refunded. For reference only, the struck-down tariff paid on it was {money(m.grossIeepaCents)}.</p>
          </div>
        ) : (
        <div className="d-money">
            <p className="d-money-l" data-testid="hero-label">{hero.label}</p>
            <p className={`d-figure ${hero.tone}`} data-testid="hero-figure" data-tone={hero.tone}>{money(hero.cents)}</p>
            {hero.note && <p className={`d-money-note ${hero.tone === "bill" ? "bill" : ""}`} data-testid="hero-note">{hero.note}</p>}
            <dl className="d-break">
              <div className="d-brk"><dt>Struck-down tariff you paid</dt><dd>{money(m.grossIeepaCents)}</dd></div>
              {m.frameworkCarveOutCents > 0 && <div className="d-brk d-brk-sub"><dt>Part kept under a trade deal ({m.frameworkGroups.join("/")})</dt><dd>-{money(m.frameworkCarveOutCents)}</dd></div>}
              <div className="d-brk"><dt>Other duties you underpaid</dt><dd className={m.underpaidOtherCents > 0 ? "bill" : ""}>{m.underpaidOtherCents > 0 ? `-${money(m.underpaidOtherCents)}` : money(0)}</dd></div>
              <div className="d-brk d-brk-net"><dt>Net</dt><dd className={m.netCents < 0 ? "bill" : ""}>{money(m.netCents)}</dd></div>
            </dl>
            <Waterfall m={m} pending={v.lane !== "FILE_NOW"} />
          </div>
        )}
        {otherDutyNote(v) && <p className="d-alert" data-testid="other-duty-note"><AlertTriangle size={16} aria-hidden /><span>{otherDutyNote(v)}</span></p>}
        <p className="d-note">Plain code worked this out to the cent. When Customs recalculates a shipment, it can also bill duties that were underpaid (under other tariff programs, 232/301/201), and that comes off the refund.</p>
        {v.diversionRisk && <p className="d-alert"><AlertTriangle size={16} aria-hidden /><span>This importer owes Customs money from before. Customs may subtract it from the refund (19 CFR 24.72).</span></p>}

        <DrawerCustoms v={v} />

        {ex && (
          <section className="d-sect">
            <h3>What the reasoning AI says</h3>
            <p className="d-tag"><span>AI analyst · Nemotron Ultra</span><span className="d-cid">{ex.completionId}</span></p>
            <p className="d-body">{ex.summary}</p>
            <div className="d-next"><span>Next step</span><p>{ex.brokerAction}</p></div>
            <details className="d-reason">
              <summary>Why this was flagged <ChevronDown size={16} aria-hidden /></summary>
              <p><b>Why it sits here:</b> {ex.whyThisOrder}</p>
              {ex.citations.length > 0 && <p className="d-cites">{ex.citations.map((c) => <span key={c}>{c}</span>)}</p>}
              {ex.guardStripped > 0 && <p className="d-small">The number guard removed {ex.guardStripped} figure{ex.guardStripped === 1 ? "" : "s"} that didn&apos;t match the code&apos;s math.</p>}
              {ex.reasoning && <details className="d-trace"><summary>The AI&apos;s reasoning trace ({ex.ms} ms)</summary><pre>{ex.reasoning}</pre></details>}
            </details>
          </section>
        )}

        <section className="d-sect">
          <h3>What Customs&apos; checks found</h3>
          {v.findings.length === 0 ? <p className="d-body">{v.lane === "NET_BILL_RISK" ? "No error. The risk is the money: see the math above." : "Nothing wrong found by the checks in this tool."}</p> : v.findings.map((f, i) => (
            <div className="d-finding" key={i}>
              <p><b>{plainTitle(f.code, f.detail)}.</b> {PLAIN_FINDING[f.code]?.what}</p>
              <p>{f.detail}</p>
              {f.fix && <p className="d-fix"><b>How to fix it:</b> {f.fix}</p>}
              {f.cbpError ? <p className="d-quote">Customs&apos; exact error: &ldquo;{f.cbpError}&rdquo;{ERROR_DEFINITIONS[f.cbpError] ? <span> (means: {ERROR_DEFINITIONS[f.cbpError]})</span> : null}</p> : <p className="d-quote d-quote-soft">Filing-order rule, not a Customs error</p>}
              {f.code === "SUSPENSION" && <p className="d-small" data-testid="suspension-note" title="CBP's CAPE FAQ allows suspended entries, but its error table rejects 'Has Suspension Record'. We follow the error table (the stricter reading) and say so.">Sources disagree: CBP&apos;s FAQ allows suspended entries, but its error table rejects &ldquo;Has Suspension Record&rdquo;. We hold the shipment, the safer reading.</p>}
              <p className="d-src"><a href={SOURCES[f.sourceId]?.url} target="_blank" rel="noreferrer">{SOURCES[f.sourceId]?.label ?? f.sourceId}</a></p>
            </div>
          ))}
        </section>

        <section className="d-sect">
          <h3>Dates <span className="d-muted">as of {board.asOf}</span></h3>
          <table className="tbl"><tbody><tr><td>Finalized by Customs</td><td>{info?.liquidationDate ?? info?.liquidationStatus}</td></tr></tbody></table>
          <DrawerRoutes v={v} asOf={board.asOf} />
        </section>

        {info && (
          <section className="d-sect">
            <h3>Products and the broker&apos;s note</h3>
            <table className="tbl"><tbody>{info.lines.map((l) => <tr key={l.lineNo}><td>#{l.lineNo} <Id>{l.hts}</Id> {l.country}{l.framework ? ` · ${l.framework} trade deal` : ""}</td><td>{l.value} / struck-down tariff {l.ieepaDuty}</td></tr>)}</tbody></table>
            {info.notes && <p className="d-quote">&ldquo;{info.notes}&rdquo;</p>}
            {info.noteSignals.length > 0 && <p className="d-small d-sig">Topics the AI spotted: {info.noteSignals.map((s) => <span key={s}>{s}</span>)}</p>}
            {info.noteConflicts.map((c, i) => <p key={i} className="d-fix bill" data-testid="ai-caught"><b>AI caught: </b>The note disagrees with the data: {c.message} Check this before filing.</p>)}
            {(info.noteVetoed ?? []).map((x, i) => <p key={i} className="d-small" data-testid="code-veto">Code vetoed the AI&apos;s &ldquo;{x.signal}&rdquo; tag: {x.why}</p>)}
            {info.parseNotes.map((c, i) => <p key={i} className="d-small">{c}</p>)}
          </section>
        )}

        <p className="d-prepared">{PREPARED_FOR_PLAIN}</p>
        <div className="d-foot">
          {v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK" ? (
            <>
              <button className={`${BTN_PRIMARY} d-btn`} onClick={onToggle}>{included ? "Take out of the refund file" : "Add to the refund file"}</button>
              <button className={`${BTN_SECONDARY} d-btn`} onClick={onClose}>Close</button>
            </>
          ) : (
            <button className={`${BTN_PRIMARY} d-btn`} onClick={onClose}>Done</button>
          )}
        </div>
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
    <section className="watch r6-watch" aria-label="Compliance Status">
      <span className="r6-badge"><span className="r6-dot"></span> Live CBP Check</span>
      <h2 className="r6-title mt-3">Compliance Status</h2>
      <p className="r6-body">Did Customs change the rules since this was built?</p>
      <p className="r6-fine">Customs publishes the refund rules on a web page. This reads the live page and compares it with a copy saved on 2026-07-11. Every change is quoted from the page (July on the left, now on the right). No AI is involved.</p>
      <div className="mt-4"><button className={BTN_PRIMARY} disabled={busy} onClick={go}>{busy ? "Reading the page…" : "Check Customs' page now"}</button></div>
      {r && (
        <div className="wr">
          <p className={r.ok ? "" : "error"}>{r.note}</p>
          {r.ok && <>
            <p><b>{key.length}</b> change{key.length === 1 ? "" : "s"} affect this tool&apos;s checks; {rest.length} more are just for information. The page&apos;s &quot;Last Modified&quot; date: {r.lastModified?.before ?? "none in the July capture"} → <b>{r.lastModified?.after ?? "none"}</b>. {r.noiseDropped} lines of layout and wording noise were filtered.</p>
            <div className="chgs">{key.map((c, i) => <ChangeCard key={i} c={c} />)}</div>
            {rest.length > 0 && <details className="more"><summary>{rest.length} more changes (informational or not modeled)</summary><div className="chgs">{rest.map((c, i) => <ChangeCard key={i} c={c} />)}</div></details>}
            <p className="r6-fine">Snapshot {r.snapshot.capturedAt.slice(0, 10)} ({r.snapshot.sha256}) vs live {new Date(r.checkedAt).toLocaleString()} ({r.live?.sha256}).</p>
          </>}
        </div>
      )}
    </section>
  );
}

function ReceiptPanel({ receipt, board, mode }: { receipt: Receipt | null; board: Board; mode: string }) {
  const n = board.normalization;
  if (mode === "browser") return null;
  if (!receipt) return <section className="receipt r6-detail r6-receipt"><h2 className="r6-title">What the AI did (receipt)</h2><p className="r6-fine">Appears when the run finishes.</p></section>;
  const L = receipt.lightning, U = receipt.ultra;
  const vs = vetoStats(Object.values(board.entryInfo));
  const total = L.costUsd + U.costUsd;
  return (
    <section className="receipt r6-detail r6-receipt">
      {receipt.provider === "openrouter" && <p className="r6-fine warn" data-testid="dev-provider-badge" role="status"><b>{OPENROUTER_LABEL}.</b> provider=openrouter. Dev only: not for the submission or video.</p>}
      <h2 className="r6-title">What the AI did (receipt) <span className="r6-meta">· {receipt.provider === "openrouter" ? "DEV run via OpenRouter" : receipt.mode === "replay" ? "recorded real run" : "live run"} · {new Date(receipt.ranAt).toLocaleString()}</span></h2>
      <div className="rc">
        <div>
          <h4 className="r6-sub">Fast AI: Nemotron 3.5 Lightning <small>{L.model}</small></h4>
          <p><b>{L.calls}</b> calls in parallel · {L.promptTokens.toLocaleString()} in / {L.completionTokens.toLocaleString()} out tokens · avg {L.avgMs} ms · {L.failed} failed</p>
          <p className="r6-fine">Job: cleaned up each row and tagged the broker&apos;s notes. Double-checked against plain code: <b>{n.agree}/{n.checked}</b> fields agree{n.disagreements.length ? `; code overrode ${n.disagreements.length} disagreement(s):` : "."}</p>
          {n.disagreements.slice(0, 5).map((d, i) => <p key={i} className="r6-fine r6-mono">{d.entry} · {d.field}: AI said {d.lightning}, code says {d.deterministic}</p>)}
          {vs.tagged > 0 && <p className="r6-fine" data-testid="veto-receipt">Code veto on note tags: the AI tagged {vs.tagged} topics, code removed {vs.vetoed} the note text did not support. Note-versus-data conflicts: {vs.conflictsBefore} before the veto, {vs.conflictsAfter} after, in {vs.entriesTouched} entries.</p>}
        </div>
        <div>
          <h4 className="r6-sub">Reasoning AI: Nemotron 3 Ultra <small>{U.model}</small></h4>
          <p><b>{U.calls}</b> calls · {U.promptTokens.toLocaleString()} in / {U.completionTokens.toLocaleString()} out tokens ({U.reasoningTokens.toLocaleString()} reasoning) · avg {U.avgMs} ms · {U.failed} failed</p>
          <p className="r6-fine">Job: explained each tricky case using Customs&apos; own rules. Any dollar figure it writes is deleted unless the code already calculated it.</p>
        </div>
        <div>
          <h4 className="r6-sub">Total</h4>
          <p><b>~{total < 0.01 ? "<$0.01" : `$${total.toFixed(3)}`}</b> at list price · wall {(receipt.wallMs / 1000).toFixed(1)} s</p>
          <p className="r6-fine">{receipt.provider === "openrouter" ? `Free tier, no cost estimated. Provider openrouter, host ${receipt.host}.` : `Estimate: tokens × Nebius list price (Ultra $1.00 in / $3.00 out, Lightning $0.06 / $0.24 per 1M). Host ${receipt.host}.`}</p>
        </div>
      </div>
      <details><summary>{L.ids.length + U.ids.length} AI call ids ({receipt.provider === "openrouter" ? "from OpenRouter, dev run" : "proof from Token Factory"})</summary>
        <pre className="ids">{[...L.ids.map((i) => `fast AI      ${i}`), ...U.ids.map((i) => `reasoning AI ${i}`)].join("\n")}</pre></details>
    </section>
  );
}
