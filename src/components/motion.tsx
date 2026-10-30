"use client";
import { useEffect, useState, type ReactNode } from "react";
import { fmtUsd } from "@/lib/money";

export function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

const easeOut = (k: number) => 1 - Math.pow(1 - k, 4);

/** Animated number. Re-runs from 0 whenever `n` changes and `animate` is on; otherwise shows the final value at once. */
export function CountMoney({ cents, animate, dur = 1100, delay = 0 }: { cents: number; animate: boolean; dur?: number; delay?: number }) {
  const [v, setV] = useState(animate ? 0 : cents);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!animate || reduced) { setV(cents); return; }
    let raf = 0; let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t + delay;
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      setV(Math.round(cents * easeOut(k)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [cents, animate, dur, delay, reduced]);
  return <>{fmtUsd(v)}</>;
}

export function CountInt({ n, animate, dur = 900, delay = 0 }: { n: number; animate: boolean; dur?: number; delay?: number }) {
  const [v, setV] = useState(animate ? 0 : n);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (!animate || reduced) { setV(n); return; }
    let raf = 0; let t0 = 0;
    const step = (t: number) => {
      if (!t0) t0 = t + delay;
      const k = Math.max(0, Math.min(1, (t - t0) / dur));
      setV(Math.round(n * easeOut(k)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [n, animate, dur, delay, reduced]);
  return <>{v}</>;
}

/** Renders its children in a plain wrapper. Content is always visible, never hidden behind scroll or a transition. */
export function Reveal({ children, className = "", delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return <div className={className}>{children}</div>;
}

/** Renders a statement as plain words. No masking or delayed reveal. Accessible name stays on the container. */
export function Words({ text, base = 0, step = 70 }: { text: string; base?: number; step?: number }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <span key={i}>{w} </span>
      ))}
    </>
  );
}

/**
 * The hero's twist, shown as a loop: a refund counts up, then other duties come off and the same shipment flips to a bill.
 * The figures are the real sample shipment A7K-7344990-0 (see the drawer): $10,500.00 refundable, $13,125.00 of other duties underpaid.
 */
const REFUND = 1050000, UNDER = 1312500, NET = REFUND - UNDER;
export function TwistCard() {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let raf = 0; let t0 = 0; let vis = true;
    const onVis = () => { vis = document.visibilityState === "visible"; };
    document.addEventListener("visibilitychange", onVis);
    const step = (now: number) => {
      if (!t0) t0 = now;
      if (vis) setT((now - t0) % 9000);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); document.removeEventListener("visibilitychange", onVis); };
  }, [reduced]);
  const T = reduced ? 6000 : t;
  const up = easeOut(Math.min(1, T / 800));
  const roll = Math.min(1, Math.max(0, (T - 2600) / 1200));
  const rollE = roll * roll * (3 - 2 * roll);
  const value = Math.round(T < 2600 ? REFUND * up : REFUND + (NET - REFUND) * rollE);
  const bill = T >= 3200;
  const under = T >= 2000;
  return (
    <div className={`twist ${bill ? "bill" : ""}`} role="img" aria-label="Example: a shipment worth a $10,500.00 refund turns into a $2,625.00 bill once other duties it underpaid are netted off.">
      <div className="twist-top">
        <span className="twist-lbl">{bill ? "You'd owe Customs" : "You'd get back"}</span>
        <span className="twist-id mono">A7K-7344990-0</span>
      </div>
      <div className="twist-num" aria-hidden>
        <b>{fmtUsd(value)}</b>
      </div>
      <div className="twist-breakdown" aria-hidden>
        <div className="twist-row"><span>Refundable tariff</span><b>{fmtUsd(REFUND)}</b></div>
        <div className="twist-row"><span>Other duties underpaid</span><b>{fmtUsd(-UNDER)}</b></div>
        <div className="twist-row twist-net"><span>Net</span><b>{fmtUsd(NET)}</b></div>
      </div>
      <div className="twist-bar" aria-hidden>
        <i className="r" style={{ transform: `scaleX(${T < 2600 ? up : 1})` }} />
        <i className="u" style={{ transform: `scaleX(${under ? Math.min(1, (T - 2000) / 1000) : 0})` }} />
      </div>
      <div className="twist-base" aria-hidden>$0 baseline</div>
      <p className="twist-cap" aria-hidden>Same shipment. One catch. Checked before you file, not after.</p>
    </div>
  );
}
