import { LIMITS } from "./cbp-rules";
import { fmtUsd } from "./money";
import type { Verdict } from "./types";

/**
 * Deterministic number guard for model text. Ultra explains; it never gets to state a number the engine did not produce.
 *   1. Unknown dollar figure: a $ amount that is not one of this entry's engine figures is replaced.
 *   2. Mislabelled dollar figure: the amount IS one of the entry's figures, but sits next to a label for a different one
 *      (for example "net refund $7,600" when $7,600 is the gross IEEPA duty and the net is $6,080). Replaced too.
 *   3. Wrong day count: "N days" where N is not a deadline the engine computed for this entry or a CBP limit
 *      (80, 90, 180, 30). Replaced.
 * Pure string work, no model, no network. Replacements are visible on the board as "(amount on board)" / "(see deadlines)".
 */
export const MONEY_RE = /\$\s?-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g;
const DAYS_RE = /(\d+)[\s-]+(?:calendar[\s-]+)?days?\b/gi;
const normMoney = (m: string) => m.replace(/[\s,$]/g, "").replace(/\.00$/, "");

type Field = "net" | "refundable" | "gross" | "underpaid" | "carve" | "bill";
/** What each phrase in the text claims the number is. Order matters only for readability; all labels near the amount are collected. */
const LABELS: [RegExp, Field][] = [
  [/\bnet(?:ting|s|ted)?\b(?!\s+bill)/i, "net"],
  [/\bnet bill\b|\bbill\b|\bbilled\b|\bowe[sd]?\b|\bshortfall\b/i, "bill"],
  [/underpa|other[\s-]duty|section\s*(?:232|301|201)|\b(?:232|301|201)\b/i, "underpaid"],
  [/carve|framework|stays owed|column 1|general duty/i, "carve"],
  [/\bgross\b|ieepa duty\b/i, "gross"],
  [/refundable|ieepa refund/i, "refundable"],
];

export interface DayFigures {
  /** how many days ago the entry liquidated (an "ago" / "since liquidation" claim must match this exactly) */
  since: Set<number>;
  /** days left on a computed deadline ("N days left / away / until / closes in N days") */
  left: Set<number>;
  /** any computed day figure or CBP limit; used when the text gives no direction */
  any: Set<number>;
}
export interface EntryFigures { fields: Record<Field, number>; days: DayFigures }

export function figuresFor(v: Verdict): EntryFigures {
  const m = v.money;
  const d = v.deadlines;
  const num = (...xs: (number | null)[]) => new Set(xs.filter((x): x is number => typeof x === "number").flatMap((x) => [x, Math.abs(x)]));
  const left = num(d.capeDaysLeft, d.protestDaysLeft, d.reconDeadlineDaysLeft, d.projectedLiquidationDaysLeft);
  const since = num(d.daysSinceLiquidation);
  const any = new Set<number>([LIMITS.liquidationWindowDays, LIMITS.reliquidationLimitDays, LIMITS.protestDays, LIMITS.reconPriorityDays, ...left, ...since]);
  return { fields: { net: m.netCents, refundable: m.ieepaRefundableCents, gross: m.grossIeepaCents, underpaid: m.underpaidOtherCents, carve: m.frameworkCarveOutCents, bill: m.billCents }, days: { since, left, any } };
}

/**
 * Count claims in portfolio text. "N entries expiring today" is checked against the engine (entries with 0 days left in the
 * CAPE window, not blocked). A wrong count is replaced with the engine's count, so the sentence stays readable and true.
 */
export function guardCounts(text: string, vs: Verdict[]): { text: string; stripped: number } {
  const today = vs.filter((v) => v.lane !== "BLOCKED" && v.deadlines.capeDaysLeft === 0).length;
  let stripped = 0;
  const out = text.replace(/(\d+)(\s+(?:\w+\s+){0,2}?)(entries|entry)(\s+(?:expiring|closing|expire|close|due)\s+today)/gi, (m, n: string, mid: string, _noun: string, tail: string) => {
    if (Number(n) === today) return m;
    stripped++; return `${today}${mid}${today === 1 ? "entry" : "entries"}${tail}`;
  });
  return { text: out, stripped };
}

const key = (cents: number) => normMoney(fmtUsd(Math.abs(cents)));

const SINCE = /\bago\b|since (?:the )?liquidat|\bliquidated\b/i, LEFT = /\bleft\b|remain|\baway\b|\buntil\b|\bcloses?\b|\bexpires?\b|\bdays? to\b|\bin$/i, WINDOW = /within|preceding|\bpast\b|\blast\b|\bwindow\b|\bthe\s*$/i;
export function guardDays(text: string, f: DayFigures): { text: string; stripped: number } {
  let stripped = 0;
  const out = text.replace(DAYS_RE, (m, n: string, off: number, whole: string) => {
    const x = Number(n);
    const before = whole.slice(Math.max(0, off - 40), off), after = whole.slice(off + m.length, off + m.length + 30);
    const near = before.split(/[.;]/).pop()! + " " + after.split(/[.;]/)[0];
    let ok: boolean;
    if (SINCE.test(near) && !WINDOW.test(before.slice(-25))) ok = f.since.has(x);
    else if (LEFT.test(before.trim().split(/\s+/).slice(-1)[0] ?? "") || LEFT.test(after)) ok = f.left.has(x) || (f.left.size === 0 && f.any.has(x));
    else ok = f.any.has(x);
    if (ok) return m;
    stripped++; return "(see deadlines)";
  });
  return { text: out, stripped };
}

export interface GuardReport { text: string; unknown: number; mislabeled: number; badDays: number; stripped: number }

export function guardEntryText(text: string, f: EntryFigures): GuardReport {
  const all = new Map<string, Set<Field>>();
  for (const [fld, cents] of Object.entries(f.fields) as [Field, number][]) { const k = key(cents); (all.get(k) ?? all.set(k, new Set()).get(k)!).add(fld); }
  let unknown = 0, mislabeled = 0, badDays = 0;
  const withMoney = text.replace(MONEY_RE, (m, off: number, whole: string) => {
    const k = normMoney(m).replace(/^-/, "");
    const owners = all.get(k);
    if (!owners) { unknown++; return "(amount on board)"; }
    // the clause around the amount, bounded by sentence/clause punctuation
    const before = whole.slice(0, off).split(/[.;:]/).pop()!.slice(-45);
    const after = whole.slice(off + m.length).split(/[.;:]/)[0].slice(0, 32);
    // "$a ... $b" lists: the label for $b must not be read from the text that belongs to $a
    const near = before.split(/\$\s?\d[\d,]*/).pop()! + " " + after.split(/\$\s?\d[\d,]*/)[0];
    const claimed = LABELS.filter(([re]) => re.test(near)).map(([, fld]) => fld);
    if (claimed.length && !claimed.some((c) => owners.has(c))) { mislabeled++; return "(amount on board)"; }
    return m;
  });
  const d = guardDays(withMoney, f.days);
  badDays = d.stripped;
  return { text: d.text, unknown, mislabeled, badDays, stripped: unknown + mislabeled + badDays };
}

/** Day counts for a portfolio-level sentence: any deadline of any entry in the packet, or a CBP limit (direction is not checked there). */
export function portfolioDays(vs: Verdict[]): DayFigures {
  const any = new Set<number>();
  for (const v of vs) for (const x of figuresFor(v).days.any) any.add(x);
  return { since: any, left: any, any };
}

/**
 * Re-run today's guard over a recorded run before it is shown. The recording is the raw model output from the day it was made;
 * the board always shows guarded text. Idempotent: text that already passed comes back unchanged.
 */
export function reguardRun<R extends { portfolio: { verdicts: Verdict[] }; explanations: Record<string, { summary: string; brokerAction: string; whyThisOrder: string; guardStripped: number }>; portfolioNote?: { headline: string; priorities: { id: string; reason: string }[]; brokerQuestions: string[]; guardStripped: number } | null }>(run: R): R {
  const vs = run.portfolio.verdicts;
  const byId = new Map(vs.map((v) => [v.id, v]));
  const explanations: Record<string, R["explanations"][string]> = {};
  for (const [id, e] of Object.entries(run.explanations)) {
    const v = byId.get(id); if (!v) { explanations[id] = e as R["explanations"][string]; continue; }
    const f = figuresFor(v); let n = 0;
    const g = (t: string) => { const r = guardEntryText(t, f); n += r.stripped; return r.text; };
    explanations[id] = { ...e, summary: g(e.summary), brokerAction: g(e.brokerAction), whyThisOrder: g(e.whyThisOrder), guardStripped: e.guardStripped + n } as R["explanations"][string];
  }
  let portfolioNote = run.portfolioNote;
  if (portfolioNote) {
    const days = portfolioDays(portfolioNote.priorities.map((p) => byId.get(p.id)!).filter(Boolean).concat(vs.filter((v) => v.lane === "FILE_NOW" || v.lane === "NET_BILL_RISK" || /Step 0/.test(v.filingStep)).slice(0, 12)));
    let n = 0;
    const g = (t: string) => { const d = guardDays(t, days); const c = guardCounts(d.text, vs); n += d.stripped + c.stripped; return c.text; };
    portfolioNote = { ...portfolioNote, headline: g(portfolioNote.headline), priorities: portfolioNote.priorities.map((p) => ({ ...p, reason: g(p.reason) })), brokerQuestions: portfolioNote.brokerQuestions.map(g), guardStripped: portfolioNote.guardStripped + n };
  }
  return { ...run, explanations: explanations as R["explanations"], portfolioNote };
}
