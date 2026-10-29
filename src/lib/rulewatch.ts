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
export interface WatchResult {
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

export function loadSnapshot(): Snapshot {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "cbp-snapshot.json"), "utf8")) as Snapshot;
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
    return t && t.length > 2000 ? textToLines(t) : null;
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

export async function runRuleWatch(): Promise<WatchResult> {
  const snap = loadSnapshot();
  const key = process.env.TAVILY_API_KEY;
  const base = { checkedAt: new Date().toISOString(), tavilyConfigured: !!key, snapshot: { capturedAt: snap.capturedAt, via: snap.via, lines: snap.lines.length, sha256: snap.sha256 } };
  let live: string[] | null = null;
  let via: WatchResult["liveVia"] = "unavailable";
  if (key) { live = await viaTavily(key); if (live) via = "tavily"; }
  if (!live) { live = await viaDirect(); if (live) via = "direct"; }
  if (!live) {
    return { ...base, ok: false, liveVia: "unavailable", note: key ? "Tavily and a direct fetch both failed, so no live comparison was possible. Showing the stored snapshot only." : "Live fetch failed (set TAVILY_API_KEY to fetch through Tavily). Showing the stored snapshot only.", changed: false, added: [], removed: [], unchangedLines: 0, relevantChanges: 0 };
  }
  const d = diffLines(snap.lines, live);
  const note = via === "tavily"
    ? "Live text fetched with Tavily Extract (markdown), compared with the stored snapshot after normalizing. Minor formatting noise is possible."
    : "Live page fetched directly from cbp.gov and compared with the stored snapshot.";
  return { ...base, ok: true, liveVia: via, note, live: { lines: live.length, sha256: sha(live) }, changed: d.added.length + d.removed.length > 0, added: d.added, removed: d.removed, unchangedLines: d.same, relevantChanges: [...d.added, ...d.removed].filter((x) => x.relevant).length };
}
