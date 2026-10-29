"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Lane, Verdict } from "@/lib/types";
import { LANES, laneOf } from "@/lib/lanes-ui";
import { CountInt, CountMoney } from "./motion";

const CHIP = 16, GAP = 6, CELL = CHIP + GAP;
type Rect = { x: number; y: number; w: number };
type Geo = { intake: Rect | null; areas: Partial<Record<Lane, Rect>> };
type LaneTotals = { count: number; refundCents: number; billCents: number };

/**
 * The run's money shot. One chip per shipment. While the run streams, the chips arrive in an intake grid;
 * when the board lands they fly into the four lane cards (transform + opacity only) and the totals count up.
 */
export default function Stage(p: {
  verdicts: Verdict[]; count: number; arrived: number; lanes: Record<Lane, LaneTotals> | null; animate: boolean;
  lane: Lane | null; onLane: (l: Lane) => void; onOpen: (id: string) => void; explained: Set<string>;
  zone: ReactNode; running: boolean;
}) {
  const { verdicts, count, arrived, lanes, animate, lane, onLane, onOpen, explained, zone, running } = p;
  const stageRef = useRef<HTMLDivElement>(null);
  const intakeRef = useRef<HTMLDivElement>(null);
  const areaRefs = useRef<Partial<Record<Lane, HTMLSpanElement | null>>>({});
  const [geo, setGeo] = useState<Geo>({ intake: null, areas: {} });
  const sorted = verdicts.length > 0;

  const measure = useCallback(() => {
    const st = stageRef.current; if (!st) return;
    const sr = st.getBoundingClientRect();
    const rel = (el: Element | null | undefined): Rect | null => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left - sr.left), y: Math.round(r.top - sr.top), w: Math.round(r.width) }; };
    const areas: Geo["areas"] = {};
    for (const l of LANES) { const r = rel(areaRefs.current[l.id]); if (r) areas[l.id] = r; }
    const next: Geo = { intake: rel(intakeRef.current), areas };
    setGeo((g) => (JSON.stringify(g) === JSON.stringify(next) ? g : next));
  }, []);
  useLayoutEffect(() => { measure(); });
  useEffect(() => {
    const st = stageRef.current; if (!st) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(st);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [measure]);

  const cols = (w: number) => Math.max(1, Math.floor((w + GAP) / CELL));
  const rowsFor = (n: number, w: number) => Math.max(1, Math.ceil(n / cols(w)));
  const intakeW = geo.intake?.w ?? 600;
  const intakeH = rowsFor(Math.max(count, 1), intakeW) * CELL - GAP;

  // chip positions
  const chips: { id: string; lane: Lane | null; x: number; y: number; k: number }[] = [];
  const laneIdx: Record<string, number> = {};
  const n = sorted ? verdicts.length : count;
  for (let i = 0; i < n; i++) {
    const v = verdicts[i];
    let x = 0, y = 0, L: Lane | null = null, k = i;
    const ig = geo.intake;
    if (sorted && v) {
      L = v.lane; k = laneIdx[L] = (laneIdx[L] ?? -1) + 1;
      const a = geo.areas[L];
      if (a) { const c = cols(a.w); x = a.x + (k % c) * CELL; y = a.y + Math.floor(k / c) * CELL; }
    } else if (ig) {
      const c = cols(ig.w); x = ig.x + (i % c) * CELL; y = ig.y + Math.floor(i / c) * CELL;
    }
    chips.push({ id: v?.id ?? `g${i}`, lane: L, x, y, k });
  }

  return (
    <section className={`stage ${sorted ? "sorted" : "intake"} ${animate ? "anim" : ""}`} ref={stageRef} aria-label="Board summary">
      <div className="zone">
        {zone}
        {!sorted && <div className="intake-area" ref={intakeRef} style={{ height: intakeH }} aria-hidden />}
      </div>
      <div className="tabs" role="tablist" aria-label="Groups">
        {LANES.map((l, li) => {
          const t = lanes?.[l.id];
          const c = t?.count ?? 0;
          const aw = geo.areas[l.id]?.w ?? 300;
          const ah = sorted && t ? rowsFor(c, aw) * CELL - GAP : 0;
          return (
            <button key={l.id} role="tab" aria-selected={lane === l.id} className={`tab ${l.tone} ${lane && lane !== l.id ? "dim" : ""} ${t ? "lit" : "ghost"}`} onClick={() => onLane(l.id)} style={{ ["--li" as string]: li }}>
              <span className="tab-top"><span className="lane-t">{l.title}</span><span className="tab-dot" aria-hidden /></span>
              <span className="lane-h">
                <span className="lane-n">{t ? <CountInt n={t.count} animate={animate} delay={450 + li * 90} /> : "0"}</span>
                <span className="lane-u">shipments</span>
              </span>
              <span className="tab-m">
                {t ? (l.id === "NET_BILL_RISK"
                  ? <><b><CountMoney cents={t.refundCents} animate={animate} delay={450 + li * 90} /></b> refund, but up to <b className="neg"><CountMoney cents={t.billCents} animate={animate} delay={450 + li * 90} /></b> in bills</>
                  : <><b><CountMoney cents={t.refundCents} animate={animate} delay={450 + li * 90} /></b> in tariffs paid</>) : <>&nbsp;</>}
              </span>
              <span className="tab-s">{l.sub}</span>
              <span className="area" ref={(el) => { areaRefs.current[l.id] = el; }} style={{ height: Math.max(ah, 0), minHeight: sorted ? 0 : 0 }} aria-hidden />
            </button>
          );
        })}
      </div>
      <div className="chips">
        {chips.map((c, i) => {
          const shown = sorted || i < arrived;
          const tone = c.lane ? laneOf(c.lane).tone : "raw";
          const dim = lane && c.lane && c.lane !== lane;
          const delay = animate && sorted ? 120 + (LANES.findIndex((l) => l.id === c.lane) * 70) + c.k * 14 : 0;
          return (
            <button key={`c${i}`} tabIndex={-1} aria-hidden className={`chip ${tone} ${shown ? "in" : ""} ${dim ? "dim" : ""} ${c.lane && explained.has(c.id) ? "has" : ""}`}
              style={{ transform: `translate3d(${c.x}px, ${shown ? c.y : c.y - 28}px, 0)`, transitionDelay: `${delay}ms, ${delay}ms, 0ms` }}
              title={verdicts[i]?.displayNumber} onClick={() => verdicts[i] && onOpen(verdicts[i].id)}><i /></button>
          );
        })}
      </div>
      {running && !sorted && <span className="sr-only" aria-live="polite">Receiving shipments</span>}
    </section>
  );
}
