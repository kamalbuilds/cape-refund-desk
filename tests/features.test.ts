import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { buildIcs, fold, icsEvents } from "../src/lib/ics";
import { brokerPacket, markdownToPdf } from "../src/lib/packet";
import { parseEs003 } from "../src/lib/parse";
import { rescore, SCENARIOS } from "../src/lib/rescore";
import { guardStats, stageRows, stageTotals } from "../src/lib/receipt-stages";
import { defaultInclude } from "../src/lib/export";
import { validateEntries } from "../src/lib/validate";
import type { RunResult } from "../src/lib/pipeline";

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const run = JSON.parse(fs.readFileSync("data/sample-run.json", "utf8")) as RunResult;
const { entries } = parseEs003(csv);
const base = { asOf: meta.asOf as string, filerCodes: meta.filerCodes as string[] };
const pf = validateEntries(entries, base);

describe(".ics deadline export", () => {
  const ics = buildIcs(pf, base.asOf);
  it("is a well-formed RFC 5545 calendar with CRLF endings and balanced components", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "").includes("\n")).toBe(false);
    const n = (s: string) => ics.split(`\r\n${s}\r\n`).length - 1;
    expect(n("BEGIN:VEVENT")).toBe(n("END:VEVENT"));
    expect(n("BEGIN:VEVENT")).toBe(icsEvents(pf, base.asOf).length);
    expect(n("BEGIN:VEVENT")).toBeGreaterThan(10);
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
  });
  it("has unique UIDs, all-day dates, and protest + CAPE-window events with the right dates", () => {
    const uids = [...ics.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(uids.length);
    expect(ics).toMatch(/DTSTART;VALUE=DATE:\d{8}\r\n/);
    const ev = icsEvents(pf, base.asOf);
    expect(ev.some((e) => e.summary.startsWith("Protest window closes"))).toBe(true);
    expect(ev.some((e) => e.summary.startsWith("CAPE window closes"))).toBe(true);
    for (const v of pf.verdicts) if (v.lane !== "BLOCKED" && v.deadlines.capeDaysLeft !== null && v.deadlines.capeDaysLeft >= 0)
      expect(ev.find((e) => e.uid === `${v.key}-cape@cape-refund-desk`)?.date).toBe(v.deadlines.capeCutoffDate);
    expect(ev.every((e, i) => i === 0 || ev[i - 1].date <= e.date)).toBe(true);
  });
  it("folds long lines and escapes commas, semicolons and newlines", () => {
    expect(fold("X:" + "a".repeat(200)).split("\r\n ").every((p) => p.length <= 75)).toBe(true);
    expect(buildIcs(pf, base.asOf)).not.toMatch(/SUMMARY:[^\r]*[^\\],/);
  });
  it("respects an include filter", () => {
    const one = new Set([pf.verdicts[0].id]);
    expect(icsEvents(pf, base.asOf, { include: one }).every((e) => e.uid.startsWith(pf.verdicts[0].key))).toBe(true);
  });
});

describe("broker packet + PDF", () => {
  const include = defaultInclude(pf);
  const input = { portfolio: run.portfolio, asOf: run.asOf, label: run.label, include: defaultInclude(run.portfolio), explanations: run.explanations, portfolioNote: run.portfolioNote, receipt: run.receipt, mode: "replay" as const };
  const md = brokerPacket(input);
  it("includes the memo, per-entry rationale, CBP sources and a recorded-run receipt", () => {
    expect(md).toContain("## AI broker memo (Nemotron Ultra)");
    expect(md).toContain("from a recorded real run");
    expect(md).toContain(run.portfolioNote!.headline);
    expect(md).toContain("## Per-entry rationale");
    expect(md).toContain("https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds");
    expect(md).toContain("RECORDED run, real logged values");
    expect(md).toContain("Not legal or customs advice");
    expect(include.size).toBeGreaterThan(0);
  });
  it("renders a valid PDF with every page referenced and the text recoverable", () => {
    const pdf = new TextDecoder().decode(markdownToPdf(md));
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    const pages = (pdf.match(/\/Type \/Page /g) ?? []).length;
    expect(pages).toBeGreaterThan(1);
    expect(pdf).toContain(`/Count ${pages}`);
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe("xref");
    expect(pdf).toContain("CAPE pre-flight note for broker review");
    expect(markdownToPdf("").length).toBeGreaterThan(100);
  });
});

describe("rule-watch re-scoring", () => {
  it("replaying CSMS 69127837 moves the bonded-warehouse entry into BLOCKED with the CBP error and loses its refund", () => {
    const r = rescore(entries, base, SCENARIOS.find((s) => s.id === "csms-69127837")!);
    expect(r.scenario.kind).toBe("real");
    expect(r.moves.length).toBeGreaterThanOrEqual(1);
    const m = r.moves.find((x) => x.to === "BLOCKED")!;
    expect(m).toBeTruthy();
    expect(m.why).toMatch(/entry type/i);
    expect(r.after.lanes.BLOCKED.count).toBe(r.before.lanes.BLOCKED.count + r.moves.filter((x) => x.to === "BLOCKED").length);
  });
  it("the 'after' side of the real scenario equals the shipped board exactly", () => {
    const r = rescore(entries, base, SCENARIOS[0]);
    expect(r.after.lanes.FILE_NOW.refundCents).toBe(pf.lanes.FILE_NOW.refundCents);
    expect(r.after.verdicts.map((v) => v.lane)).toEqual(pf.verdicts.map((v) => v.lane));
  });
  it("a tighter what-if window pushes entries out of FILE_NOW and a wider one never loses safe dollars", () => {
    const tight = rescore(entries, base, SCENARIOS.find((s) => s.id === "window-60")!);
    expect(tight.scenario.kind).toBe("whatif");
    expect(tight.moves.length).toBeGreaterThan(0);
    expect(tight.safeRefundDeltaCents).toBeLessThan(0);
    const wide = rescore(entries, base, SCENARIOS.find((s) => s.id === "window-90")!);
    expect(wide.safeRefundDeltaCents).toBeGreaterThanOrEqual(0);
  });
  it("is deterministic, lane counts are conserved, and no override means no change", () => {
    const a = rescore(entries, base, SCENARIOS[1]), b = rescore(entries, base, SCENARIOS[1]);
    expect(a.moves).toEqual(b.moves);
    const total = (l: Record<string, { afterCount: number }>) => Object.values(l).reduce((s, x) => s + x.afterCount, 0);
    expect(total(a.lanes)).toBe(pf.verdicts.length);
    expect(rescore(entries, base, { ...SCENARIOS[1], from: {}, to: {} }).moves).toEqual([]);
  });
});

describe("per-stage run receipt (recorded run)", () => {
  const rows = stageRows(run);
  it("reports the real logged totals without inventing a rationale/memo split", () => {
    expect(rows.map((r) => r.id)).toEqual(["lightning", "ultra-combined", "guard", "engine"]);
    const t = stageTotals(rows);
    expect(t.calls).toBe(run.receipt.lightning.calls + run.receipt.ultra.calls);
    expect(t.costUsd).toBeCloseTo(run.receipt.lightning.costUsd + run.receipt.ultra.costUsd, 6);
    expect(rows[0].promptTokens).toBe(26813);
  });
  it("splits Ultra into rationale and memo when the run tracked them, and the parts add up", () => {
    const memo = { ...run.receipt.ultra, calls: 1, failed: 0, promptTokens: 3000, completionTokens: 2000, reasoningTokens: 1500, costUsd: 0.01, avgMs: 9000 };
    const split = stageRows({ ...run, receipt: { ...run.receipt, memo } });
    expect(split.map((r) => r.id)).toEqual(["lightning", "ultra-rationale", "ultra-memo", "guard", "engine"]);
    expect(split[1].calls + split[2].calls).toBe(run.receipt.ultra.calls);
    expect(split[1].promptTokens + split[2].promptTokens).toBe(run.receipt.ultra.promptTokens);
  });
  it("number-guard stats come from the recorded explanations", () => {
    const g = guardStats(run.explanations, run.portfolioNote);
    expect(g.checked).toBeGreaterThan(60);
    expect(g.stripped).toBeGreaterThanOrEqual(0);
    expect(rows.find((r) => r.id === "guard")!.note).toContain(`replaced ${g.stripped}`);
  });
});

import { SAMPLE_STATS } from "../src/lib/sample-stats";
import { SOURCE_PANEL } from "../src/lib/sources";
import { SOURCES } from "../src/lib/cbp-rules";

describe("impact copy cannot drift from the engine", () => {
  it("SAMPLE_STATS equals the recorded board", () => {
    const l = run.portfolio.lanes;
    expect(SAMPLE_STATS.entries).toBe(run.portfolio.verdicts.length);
    expect(SAMPLE_STATS.safeCount).toBe(l.FILE_NOW.count);
    expect(SAMPLE_STATS.safeRefundCents).toBe(l.FILE_NOW.refundCents);
    expect(SAMPLE_STATS.holdCount).toBe(l.WAIT.count);
    expect(SAMPLE_STATS.holdRefundCents).toBe(l.WAIT.refundCents);
    expect(SAMPLE_STATS.billRiskCount).toBe(l.NET_BILL_RISK.count);
    expect(SAMPLE_STATS.billRiskBillCents).toBe(l.NET_BILL_RISK.billCents);
    expect(SAMPLE_STATS.blockedCount).toBe(l.BLOCKED.count);
    expect(SAMPLE_STATS.blockedRefundCents).toBe(l.BLOCKED.refundCents);
    expect(pf.lanes.FILE_NOW.refundCents).toBe(SAMPLE_STATS.safeRefundCents);
  });
  it("the source panel is https, unique, and covers every source the engine cites", () => {
    expect(new Set(SOURCE_PANEL.map((s) => s.id)).size).toBe(SOURCE_PANEL.length);
    SOURCE_PANEL.forEach((s) => expect(s.url).toMatch(/^https:\/\//));
    for (const k of Object.keys(SOURCES)) expect(SOURCE_PANEL.find((s) => s.id === k)?.url).toBe(SOURCES[k].url);
    expect(SOURCE_PANEL.filter((s) => s.kind === "CSMS").length).toBeGreaterThanOrEqual(2);
    expect(SOURCE_PANEL.filter((s) => s.kind === "19 CFR").length).toBeGreaterThanOrEqual(2);
  });
});
