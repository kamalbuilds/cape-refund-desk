import { SOURCES } from "./cbp-rules";
import { DISCLAIMER, handoffNote } from "./export";
import type { Explanation, PortfolioNote, Receipt } from "./pipeline";
import { stageRows, stageTotals } from "./receipt-stages";
import type { Portfolio } from "./validate";

export interface PacketInput {
  portfolio: Portfolio;
  asOf: string;
  label: string;
  include: Set<string>;
  explanations: Record<string, Explanation>;
  portfolioNote: PortfolioNote | null;
  receipt: Receipt | null;
  /** "replay" = a recorded real run, labelled as such in the packet. */
  mode: "live" | "replay";
}

/** Broker handoff packet (Markdown): the pre-flight note, Ultra's memo and per-entry rationale, sources and the run receipt. */
export function brokerPacket(i: PacketInput): string {
  const L: string[] = [];
  const vById = new Map(i.portfolio.verdicts.map((v) => [v.id, v]));
  L.push(handoffNote(i.portfolio, i.asOf, i.include), "");
  const how = i.mode === "replay" ? "from a recorded real run (not generated live for this export)" : "generated live for this run";
  if (i.portfolioNote) {
    const n = i.portfolioNote;
    L.push("## AI broker memo (Nemotron Ultra)", `_Drafted by the model ${how}. Every dollar figure was checked by the deterministic number guard; the model's own figures are removed._`, "", `**${n.headline}**`, "");
    if (n.priorities.length) { L.push("Priorities:"); n.priorities.forEach((p) => L.push(`- ${vById.get(p.id)?.displayNumber ?? p.id}: ${p.reason}`)); L.push(""); }
    if (n.brokerQuestions.length) { L.push("Questions to settle before upload:"); n.brokerQuestions.forEach((q) => L.push(`- ${q}`)); L.push(""); }
  }
  const ex = i.portfolio.verdicts.filter((v) => i.explanations[v.id]);
  if (ex.length) {
    L.push(`## Per-entry rationale (${ex.length} judgment entries)`, `_Written by Nemotron Ultra ${how}, grounded in CBP's rules and this tool's findings._`, "");
    for (const v of ex) {
      const e = i.explanations[v.id];
      L.push(`### ${v.displayNumber} (${v.lane.replace(/_/g, " ")})`, e.summary, "", `Broker action: ${e.brokerAction}`);
      if (e.whyThisOrder) L.push(`Why this order: ${e.whyThisOrder}`);
      if (e.citations.length) L.push(`Cited: ${e.citations.join(", ")}`);
      L.push("");
    }
  }
  L.push("## CBP sources");
  Object.values(SOURCES).forEach((s) => L.push(`- ${s.label}: ${s.url}`));
  L.push("");
  if (i.receipt) {
    const rows = stageRows({ receipt: i.receipt, explanations: i.explanations, portfolioNote: i.portfolioNote });
    const t = stageTotals(rows);
    L.push(`## Run receipt (${i.mode === "replay" ? "RECORDED run, real logged values" : "live run"}, ${i.receipt.ranAt})`);
    rows.forEach((r) => L.push(`- ${r.stage} [${r.model}]: ${r.calls} calls, ${r.promptTokens} in / ${r.completionTokens} out tokens, $${r.costUsd.toFixed(6)}${r.avgMs !== null ? `, ${r.avgMs} ms avg` : ""}`));
    L.push(`- Total: ${t.calls} model calls, ${t.promptTokens + t.completionTokens} tokens, $${t.costUsd.toFixed(6)}`, "");
  }
  L.push(`Sample/label: ${i.label || "uploaded file"}. ${DISCLAIMER}`);
  return L.join("\n");
}

/* ---------- Minimal PDF writer (Courier, US Letter, no dependencies) ---------- */
const FONT = 10, LEAD = 12, MARGIN = 54, PAGE_W = 612, PAGE_H = 792, COLS = Math.floor((PAGE_W - MARGIN * 2) / (FONT * 0.6));
const LINES_PER_PAGE = Math.floor((PAGE_H - MARGIN * 2) / LEAD);

function latin1(s: string): string {
  return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, "-").replace(/\u2026/g, "...").replace(/\u2192/g, "->")
    .replace(/[^\x20-\x7e\n]/g, "?");
}
const pdfEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

function wrap(line: string): string[] {
  if (line.length <= COLS) return [line];
  const out: string[] = []; const indent = /^(\s*(?:[-*]|\d+\.)?\s*)/.exec(line)![1].replace(/\S/g, " ");
  let cur = "";
  for (const w of line.split(" ")) {
    let word = w;
    while (word.length > COLS - indent.length) { // break very long tokens (URLs)
      if (cur.trim()) { out.push(cur); cur = indent; }
      const room = COLS - cur.length; out.push(cur + word.slice(0, room)); word = word.slice(room); cur = indent;
    }
    if ((cur + (cur.trim() ? " " : "") + word).length > COLS) { out.push(cur); cur = indent + word; }
    else cur = cur.trim() ? cur + " " + word : (cur || "") + word;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function markdownToPdf(md: string): Uint8Array {
  const lines: string[] = [];
  for (const raw of latin1(md).split("\n")) {
    const t = raw.replace(/^#{1,3} /, (m) => (m.length === 4 ? "== " : "")).replace(/\*\*|__|`/g, "").replace(/^_(.*)_$/, "$1");
    if (/^## /.test(raw) || /^# /.test(raw)) lines.push("");
    wrap(t).forEach((w) => lines.push(w));
  }
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_PAGE) pages.push(lines.slice(i, i + LINES_PER_PAGE));
  if (!pages.length) pages.push([""]);
  const objs: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`, "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");
  pages.forEach((pg, i) => {
    const stream = `BT /F1 ${FONT} Tf ${LEAD} TL ${MARGIN} ${PAGE_H - MARGIN - FONT} Td\n` + pg.map((l) => `(${pdfEsc(l)}) Tj T*`).join("\n") + "\nET";
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n"; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out); // all ASCII, so string length == byte length
}
