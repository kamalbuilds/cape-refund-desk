"use client";
import { AlertTriangle } from "lucide-react";
import "../app/customs.css";
import { CUSTOMS_SOURCES, type Lockout, type PhaseInfo } from "@/lib/customs-checks";
import { CAUSES, coverage } from "@/lib/coverage";
import type { Verdict } from "@/lib/types";

const TONE: Record<string, string> = { 1: "p1", 2: "p2", 3: "p3", later: "later", none: "none" };

function SrcLink({ id }: { id: string }) {
  const s = CUSTOMS_SOURCES[id];
  return s ? <a className="src" data-testid="customs-source" href={s.url} target="_blank" rel="noreferrer">{s.label}</a> : null;
}

/** Small phase pill, used on rows and in the drawer header. */
export function PhaseChip({ phase, title }: { phase: PhaseInfo; title?: boolean }) {
  return <span className={`cu-chip ${TONE[String(phase.id)]}`} data-testid="phase-chip" data-phase={String(phase.id)} title={title ? phase.plain : undefined}>{phase.chip}</span>;
}

/** Row meta items: the phase chip first (so row ellipsis never hides it), then a marker for each lock-out. */
export function rowCustoms(v: Verdict): React.ReactNode[] {
  const c = v.customs;
  if (!c) return [];
  const out: React.ReactNode[] = [<PhaseChip key="ph" phase={c.phase} title />];
  for (const l of c.lockouts) out.push(<span key={`lo-${l.id}`} className="warn" data-testid="lockout-marker" title={l.plain}>{l.marker}</span>);
  return out;
}

function LockoutAlert({ l }: { l: Lockout }) {
  return (
    <div className="d-alert cu-alert" data-testid="lockout-warning" data-lockout={l.id}>
      <AlertTriangle size={16} aria-hidden />
      <div>
        <p className="cu-title">{l.title}</p>
        <p>{l.plain}</p>
        <blockquote className="cu-quote">{l.quote}</blockquote>
        <p className="cu-src">CBP wording, <SrcLink id={l.sourceId} /></p>
      </div>
    </div>
  );
}

/** Drawer: which phase, in plain words with CBP's wording, then the bordered lock-out warnings. */
export function DrawerCustoms({ v }: { v: Verdict }) {
  const c = v.customs;
  if (!c) return null;
  const p = c.phase;
  return (
    <>
      <section className="d-sect cu-sect" data-testid="phase-section">
        <h3>Which refund phase <PhaseChip phase={p} /></h3>
        <p className="d-body">{p.plain}</p>
        <details className="cu-more">
          <summary>What the source says</summary>
          <blockquote className="cu-quote">{p.quote}</blockquote>
          <p className="cu-src"><SrcLink id={p.sourceId} />{p.id === 3 && <>, and <SrcLink id="PHASE3_LAW" /></>}</p>
        </details>
      </section>
      {c.lockouts.map((l) => <LockoutAlert key={l.id} l={l} />)}
    </>
  );
}

/** The honest coverage line, with the list of which published causes are covered. Counted from CBP's two error tables. */
export function CoverageLine() {
  const cov = coverage();
  return (
    <section className="cu-cov" data-testid="coverage" aria-label="What this tool checks">
      <h2 className="cu-cov-h" data-testid="coverage-line">{cov.line}.</h2>
      <p className="cu-cov-p">CBP publishes {cov.total} distinct reasons it can reject a CAPE file or entry (its File Validation and Entry Validation tables). {cov.byData} are checked from your ACE report, {cov.byExport} are ruled out by how the upload file is built, and {cov.notCheckable.length} cannot be checked from a report. They are listed so you know what is left to your broker.</p>
      <details className="cu-more">
        <summary>All {cov.total} causes and what is checked</summary>
        <ul className="cu-list">
          {CAUSES.map((c) => (
            <li key={c.id} data-status={c.status}>
              <span className={`cu-mark ${c.status}`}>{c.status === "none" ? "Not checkable from this file" : c.status === "export" ? "Built into the file" : "Checked"}</span>{" "}
              <b>{c.cbp}</b> <span className="cu-how">{c.how}</span>
            </li>
          ))}
        </ul>
        <p className="cu-src">Counted from the tables on <SrcLink id="FAQ" />; the file table is also in <SrcLink id="QRG" />. One cause, "Entry Summary Not Found or Archived in ACE", sits in both tables and is counted once. CBP also lists items that are not errors, such as direct-deposit (ACH) setup and anti-dumping duties; they are not in the error tables, so they are not counted.</p>
      </details>
    </section>
  );
}
