/**
 * Rule-watch: a REAL diff of CBP's IEEPA refund page against a stored snapshot.
 *
 * - Snapshot (data/cbp-snapshot.json): text lines extracted from an archived capture of CBP's page
 *   (Internet Archive Wayback capture, see the snapshot's `via`). Built by scripts/build-snapshot.ts.
 * - Live: fetched now. With TAVILY_API_KEY set, Tavily Extract is tried first (it works from hosts that
 *   cbp.gov blocks); otherwise, or if Tavily fails, a direct fetch. If both fail the panel says so and
 *   shows the stored snapshot only. Nothing is ever simulated.
 * - The diff is a line-level LCS over normalized text. We report added and removed lines and flag the ones
 *   that touch rules this app depends on.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const WATCH_URL = "https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds";

export interface Snapshot { url: string; capturedAt: string; via: string; sha256: string; lines: string[] }
export interface DiffLine { kind: "added" | "removed"; text: string; relevant: boolean }
/** One change between the stored (July) capture and the live (now) page: the text on each side, quoted from the page. */
export interface Change {
  kind: "reworded" | "added" | "removed";
  before: string; // text in the stored capture ("" when added)
  after: string;  // text on the live page ("" when removed)
  stampBefore?: string; stampAfter?: string; // CBP's own "Updated m/d/yyyy" stamps for that section
  relevant: boolean;
  engineLevel?: 0 | 1 | 2 | 3; // 0 engine changed because of this, 1 checked and unchanged, 3 not modeled / informational
  confirmedByTavily?: boolean; // an independent extractor (Tavily) also sees this difference
  engine?: string; // what this means for the checks in this app, when we know
}
export interface WatchResult {
  changes?: Change[];
  lastModified?: { before?: string; after?: string };
  ok: boolean;
  checkedAt: string;
  liveVia: "tavily" | "direct" | "unavailable";
  tavilyConfigured: boolean;
  note: string;
  snapshot: { capturedAt: string; via: string; lines: number; sha256: string };
  live?: { lines: number; sha256: string };
  changed: boolean;
  added: DiffLine[];
  removed: DiffLine[];
  unchangedLines: number;
  noiseDropped?: number;
  relevantChanges: number;
}

const ENT: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&rsquo;": "'", "&lsquo;": "'", "&ldquo;": '"', "&rdquo;": '"', "&ndash;": "-", "&mdash;": "-" };
const decode = (s: string) => s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, g: string) => {
  if (ENT[m]) return ENT[m];
  if (g[0] === "#") { const n = g[1].toLowerCase() === "x" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m; }
  return m;
});

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** Main-content text of CBP's page, one line per paragraph / list item / table cell. */
export function htmlToLines(html: string): string[] {
  const m = html.match(/<main[\s\S]*?<\/main>/i);
  let h = m ? m[0] : html;
  const k = h.indexOf('id="block-cbpd8-gov-theme-cbp-gov-theme-system-main"'); // skip CBP's mega-menu / sidebar chrome
  if (k > 0) h = h.slice(k);
  h = h.replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ");
  h = h.replace(/<\/?(p|li|tr|td|th|h[1-6]|div|br|ul|ol|table|section|article|details|summary|button)\b[^>]*>/gi, "\n");
  h = h.replace(/<[^>]+>/g, " ");
  return toLines(decode(h));
}
/** Markdown / plain text (Tavily) to the same line form. */
export function textToLines(t: string): string[] {
  return toLines(t.replace(/\|/g, "\n").replace(/[#*_`>]/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1"));
}
/** Tavily returns the whole page as markdown, mega-menu and footer included. Keep only the page body:
 * from the first exact "IEEPA - Duty Refunds" heading to the footer's CBP seal image. */
export function cropMain(lines: string[]): string[] {
  const start = lines.findIndex((l) => /^IEEPA - Duty Refunds$/i.test(l));
  if (start < 0) return lines;
  let end = lines.findIndex((l, i) => i > start && /^!?\[?Image \d+.*CBP Seal/i.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start, end).filter((l) => !/^!?\[?Image \d+/i.test(l));
}
function toLines(t: string): string[] {
  const out: string[] = [];
  for (const raw of t.split(/\n+/)) {
    const l = clean(raw);
    if (l.length < 3 || /^[-:\s]+$/.test(l)) continue;
    if (out[out.length - 1] !== l) out.push(l);
  }
  return out;
}
const norm = (l: string) => l.toLowerCase().replace(/[^a-z0-9$%./ ]+/g, " ").replace(/\s+/g, " ").trim();
export const sha = (lines: string[]) => crypto.createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);

/** Rules this app mirrors: a change touching any of these is flagged. */
const RELEVANT = /(psc|post.?summary|liquidat|protest|drawback|reconcil|recon\b|9,?999|1\s?mb|\b80\b|\b180\b|\b90\b|\b30 days|entry type|injunction|suspen|csv|cape|phase|error|apostrophe|declaration|ieepa|interest|offset|debt|amend|ace portal|ach)/i;

export function diffLines(a: string[], b: string[]): { added: DiffLine[]; removed: DiffLine[]; same: number } {
  const A = a.map(norm), B = b.map(norm);
  const n = A.length, m = B.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const added: DiffLine[] = [], removed: DiffLine[] = [];
  let i = 0, j = 0, same = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { i++; j++; same++; }
    else if (L[i + 1][j] >= L[i][j + 1]) { removed.push({ kind: "removed", text: a[i], relevant: RELEVANT.test(a[i]) }); i++; }
    else { added.push({ kind: "added", text: b[j], relevant: RELEVANT.test(b[j]) }); j++; }
  }
  for (; i < n; i++) removed.push({ kind: "removed", text: a[i], relevant: RELEVANT.test(a[i]) });
  for (; j < m; j++) added.push({ kind: "added", text: b[j], relevant: RELEVANT.test(b[j]) });
  return { added, removed, same };
}

const STAMP = /^updated\s+\d/i;
/** What a change means for this app's checks. Only statements that are true of the code in this repo. */
const ENGINE: { re: RegExp; level: 0 | 1 | 2 | 3; note: string }[] = [
  { level: 0, re: /warehouse entries.*(21|22)/i, note: "Engine updated after this diff: entry types 21 and 22 are blocked with CBP's \"Entry Type Not Allowed\" (CSMS 69127837, effective 2026-07-07); warehouse withdrawals (31, 32, 34, 38) are still accepted." },
  { level: 3, re: /Form 5106|\bACH\b|bank (account|information)/, note: "Not modeled on purpose: this tool never asks for or stores bank details or an ACE login. The importer or broker handles ACH enrollment in ACE." },
  { level: 3, re: /ES-022/i, note: "Informational: ES-022 links accepted declarations to entries and refund numbers. Nothing to change here." },
  { level: 1, re: /\b80 days\b/i, note: "Engine unchanged: the 80-day liquidation window (LIMITS.liquidationWindowDays) still matches." },
  { level: 1, re: /Phase 2|flagged for reconciliation where/i, note: "Engine unchanged: recon-flagged entries without a Recon on file are accepted if unliquidated or within 80 days; they go to \"Recon first\" when the deadline is near." },
  { level: 1, re: /protest under 19|timely protest|Should you disagree/i, note: "Engine unchanged: protest window stays 180 days (19 U.S.C. 1514); PSCs and protests on entries in an accepted declaration remain blocked until liquidation." },
  { level: 1, re: /90 days from the date of the original liquidation|90-day|90th day/i, note: "Engine unchanged: 90-day voluntary reliquidation limit." },
];

export function toChanges(a: string[], b: string[]): { changes: Change[]; same: number; dropped: number } {
  const A = a.map(norm), B = b.map(norm);
  const n = A.length, m = B.length;
  const L: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const hunks: { r: string[]; ad: string[] }[] = [];
  let cur: { r: string[]; ad: string[] } | null = null;
  const flush = () => { if (cur && (cur.r.length || cur.ad.length)) hunks.push(cur); cur = null; };
  let i = 0, j = 0, same = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { flush(); i++; j++; same++; continue; }
    cur ??= { r: [], ad: [] };
    if (j >= m || (i < n && L[i + 1][j] >= L[i][j + 1])) { cur.r.push(a[i]); i++; } else { cur.ad.push(b[j]); j++; }
  }
  flush();
  const changes: Change[] = [];
  let dropped = 0;
  for (const h of hunks) {
    const stampB = h.r.find((x) => STAMP.test(x)), stampA = h.ad.find((x) => STAMP.test(x));
    const keep = (x: string) => !STAMP.test(x) && !/\?\s*$/.test(x) && !/^!/.test(x) && !/^last modified/i.test(x) && !/^past webinar/i.test(x) && !/^\d\.\s/.test(x) && !/^(close all|open all|menu|trade|subsequent (phases|deployments) of cape)$/i.test(x.trim()) && x.length >= 25;
    const r = h.r.filter(keep), ad = h.ad.filter(keep);
    const before = r.join(" ").replace(/\s+/g, " ").trim(), after = ad.join(" ").replace(/\s+/g, " ").trim();
    const nb = norm(before), na = norm(after);
    if (!before && !after) { dropped++; continue; }
    if (nb === na) { dropped++; continue; }
    // same text reflowed or lightly edited (one side starts with the other's first 60 chars) is still shown, as reworded
    const kind: Change["kind"] = !before ? "added" : !after ? "removed" : "reworded";
    const probe = before + " " + after;
    const hits = ENGINE.filter((e) => e.re.test(probe));
    const eng = [...new Set(hits.map((e) => e.note))].join(" ");
    changes.push({ kind, before, after, stampBefore: stampB, stampAfter: stampA, relevant: RELEVANT.test(probe), engine: eng || undefined, engineLevel: hits.length ? (Math.min(...hits.map((h) => h.level)) as 0 | 1 | 2 | 3) : undefined });
  }
  return { changes, same, dropped };
}

/** Drop presentation noise so the panel shows content changes: FAQ question headings (accordion titles render
 * differently from one capture to the next), "Updated m/d/yyyy" stamps, nav / breadcrumb / image lines, and
 * lines that are the same sentence reflowed (one side contains the other). */
export function settle(d: { added: DiffLine[]; removed: DiffLine[]; same: number }): { added: DiffLine[]; removed: DiffLine[]; same: number; dropped: number } {
  const noisy = (t: string) => /\?\s*$/.test(t) || /^updated\s+\d/i.test(t) || /^!/.test(t) || /^\d\.\s/.test(t) || /^(trade|travel|border security|newsroom|about cbp|careers|employee resources|cbp\.gov|close all|open all|menu)$/i.test(t) || /^an official website|^a lock|^lock/i.test(t) || t.length < 6;
  const keep = (x: DiffLine) => !noisy(x.text);
  let added = d.added.filter(keep), removed = d.removed.filter(keep);
  const N = (t: string) => norm(t);
  const reflowed = (a: string, b: string) => { const x = N(a), y = N(b); const [lo, hi] = x.length < y.length ? [x, y] : [y, x]; return lo.length >= 40 && hi.includes(lo.slice(0, Math.min(lo.length, 80))); };
  const usedR = new Set<number>();
  added = added.filter((a) => { const k = removed.findIndex((r, i) => !usedR.has(i) && reflowed(a.text, r.text)); if (k >= 0) { usedR.add(k); return false; } return true; });
  removed = removed.filter((_, i) => !usedR.has(i));
  return { added, removed, same: d.same, dropped: d.added.length + d.removed.length - added.length - removed.length };
}

export function loadSnapshot(kind: "html" | "tavily" = "html"): Snapshot {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", kind === "tavily" ? "cbp-snapshot-tavily.json" : "cbp-snapshot.json"), "utf8")) as Snapshot;
}

async function viaTavily(key: string): Promise<string[] | null> {
  try {
    const r = await fetch("https://api.tavily.com/extract", {
      method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ urls: [WATCH_URL], extract_depth: "advanced", format: "markdown" }), signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { results?: { raw_content?: string }[] };
    const t = j.results?.[0]?.raw_content;
    if (!t || t.length < 2000) return null;
    const lines = cropMain(textToLines(t));
    return lines.length > 50 ? lines : null;
  } catch { return null; }
}
async function viaDirect(): Promise<string[] | null> {
  try {
    const r = await fetch(WATCH_URL, { headers: { "user-agent": "Mozilla/5.0 (compatible; cape-refund-desk rulewatch)", accept: "text/html" }, signal: AbortSignal.timeout(25000) });
    if (!r.ok) return null;
    const lines = htmlToLines(await r.text());
    return lines.length > 50 ? lines : null;
  } catch { return null; }
}

const words = (t: string) => norm(t).split(" ").filter((w) => w.length > 3);
/** Does an independent extraction show the same difference? Checks that the words new on the live side are present (or, for a removal, absent). */
function confirms(other: string[], c: Change): boolean {
  const blob = new Set(other.flatMap(words));
  const b = new Set(words(c.before)), a = words(c.after);
  const fresh = a.filter((w) => !b.has(w));
  if (fresh.length) return fresh.filter((w) => blob.has(w)).length / fresh.length >= 0.8;
  const gone = [...b].filter((w) => !a.includes(w));
  return gone.length > 0 && gone.filter((w) => !blob.has(w)).length / gone.length >= 0.8;
}

/**
 * Order: direct fetch of cbp.gov first (same HTML-to-text path as the stored July capture, so the diff is clean), Tavily Extract as
 * an independent second reader that corroborates each change, and Tavily alone as the fallback if cbp.gov blocks the direct fetch
 * (its markdown is structured differently, so that diff is noisier and the note says so).
 */
export async function runRuleWatch(): Promise<WatchResult> {
  const key = process.env.TAVILY_API_KEY;
  let snap = loadSnapshot();
  const base0 = () => ({ snapshot: { capturedAt: snap.capturedAt, via: snap.via, lines: snap.lines.length, sha256: snap.sha256 } });
  const base = { checkedAt: new Date().toISOString(), tavilyConfigured: !!key, ...base0() };
  const [direct, tav] = await Promise.all([viaDirect(), key ? viaTavily(key) : Promise.resolve(null)]);
  let live: string[] | null = direct, via: WatchResult["liveVia"] = direct ? "direct" : "unavailable";
  if (!live && tav) { live = tav; via = "tavily"; snap = loadSnapshot("tavily"); }
  if (!live) {
    return { ...base, ok: false, liveVia: "unavailable", note: key ? "Tavily and a direct fetch both failed, so no live comparison was possible." : "Live fetch failed (set TAVILY_API_KEY to fetch through Tavily).", changed: false, added: [], removed: [], unchangedLines: 0, relevantChanges: 0 };
  }
  const d = settle(diffLines(snap.lines, live));
  const hk = toChanges(snap.lines, live);
  const changes = hk.changes
    .map((c) => (via === "direct" && tav ? { ...c, confirmedByTavily: confirms(tav, c) } : c))
    .filter((c) => c.relevant || c.engine)
    .sort((x, y) => (x.engineLevel ?? 2) - (y.engineLevel ?? 2));
  const lm = live.find((l) => /^last modified:/i.test(l));
  const lmSnap = snap.lines.find((l) => /^last modified:/i.test(l)) ?? (via === "tavily" ? loadSnapshot().lines.find((l) => /^last modified:/i.test(l)) : undefined);
  const confirmed = changes.filter((c) => (c as Change).confirmedByTavily).length;
  const note = (via === "direct"
    ? `Live page fetched directly from cbp.gov and compared with the stored 2026-07-11 capture (same HTML-to-text path on both sides).${tav ? ` Tavily Extract read the page independently and agrees with ${confirmed} of ${changes.length} changes.` : key ? " Tavily could not read the page for the cross-check." : ""}`
    : "cbp.gov blocked the direct fetch, so the live page came from Tavily Extract and was compared with a Tavily Extract of the same July capture. Its markdown is structured differently, so expect extra structural noise.")
    + (lm ? ` CBP's page now says "${lm}"${lmSnap ? `; the July capture said "${lmSnap}"` : ""}.` : "");
  return {
    ...base, ok: true, liveVia: via, note, live: { lines: live.length, sha256: sha(live) }, changes,
    lastModified: { before: lmSnap?.replace(/^last modified:\s*/i, ""), after: lm?.replace(/^last modified:\s*/i, "") },
    changed: changes.length > 0, added: d.added, removed: d.removed, unchangedLines: d.same, noiseDropped: d.dropped + hk.dropped,
    relevantChanges: changes.length,
  };
}
