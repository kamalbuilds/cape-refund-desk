import type { Explanation, ModelReceipt, PortfolioNote, Receipt } from "./pipeline";

/** One row of the per-stage run receipt. Every value comes from the logged run; nothing is estimated. */
export interface StageRow {
  id: "lightning" | "ultra-rationale" | "ultra-memo" | "ultra-combined" | "guard" | "engine";
  stage: string;
  model: string;
  calls: number;
  failed: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  costUsd: number;
  /** Mean latency per call; null for deterministic stages. */
  avgMs: number | null;
  note: string;
}

const diff = (a: ModelReceipt, b: ModelReceipt) => ({
  calls: a.calls - b.calls, failed: a.failed - b.failed, promptTokens: a.promptTokens - b.promptTokens,
  completionTokens: a.completionTokens - b.completionTokens, reasoningTokens: a.reasoningTokens - b.reasoningTokens,
  costUsd: Math.round((a.costUsd - b.costUsd) * 1e6) / 1e6,
});

export function guardStats(explanations: Record<string, Explanation>, note: PortfolioNote | null) {
  const ex = Object.values(explanations);
  const checked = ex.length * 3 + (note ? 1 + note.priorities.length + note.brokerQuestions.length : 0);
  const stripped = ex.reduce((s, e) => s + e.guardStripped, 0) + (note?.guardStripped ?? 0);
  return { checked, stripped };
}

export function stageRows(r: { receipt: Receipt; explanations: Record<string, Explanation>; portfolioNote: PortfolioNote | null }): StageRow[] {
  const { receipt: x } = r;
  const rows: StageRow[] = [];
  rows.push({ id: "lightning", stage: "Classify and normalize every entry", model: x.lightning.model, calls: x.lightning.calls, failed: x.lightning.failed,
    promptTokens: x.lightning.promptTokens, completionTokens: x.lightning.completionTokens, reasoningTokens: x.lightning.reasoningTokens, costUsd: x.lightning.costUsd,
    avgMs: x.lightning.avgMs, note: "One call per CSV row: canonical entry number and dates, status flags, tags from the free-text notes. Never computes money." });
  if (x.memo) {
    const d = diff(x.ultra, x.memo);
    rows.push({ id: "ultra-rationale", stage: "Per-entry rationale (judgment entries)", model: x.ultra.model, ...d, avgMs: d.calls ? Math.round((x.ultra.avgMs * x.ultra.calls - x.memo.avgMs * x.memo.calls) / d.calls) : 0,
      note: "Ultra reasons over CBP's rules and the engine's findings, and writes the explanation shown in each drawer." });
    rows.push({ id: "ultra-memo", stage: "Broker memo", model: x.memo.model, calls: x.memo.calls, failed: x.memo.failed, promptTokens: x.memo.promptTokens,
      completionTokens: x.memo.completionTokens, reasoningTokens: x.memo.reasoningTokens, costUsd: x.memo.costUsd, avgMs: x.memo.avgMs,
      note: "One Ultra call that writes the headline, priorities and questions for the broker." });
  } else {
    rows.push({ id: "ultra-combined", stage: "Per-entry rationale and broker memo", model: x.ultra.model, calls: x.ultra.calls, failed: x.ultra.failed,
      promptTokens: x.ultra.promptTokens, completionTokens: x.ultra.completionTokens, reasoningTokens: x.ultra.reasoningTokens, costUsd: x.ultra.costUsd, avgMs: x.ultra.avgMs,
      note: "Per-entry rationale plus one broker-memo call. This run was logged before the rationale and memo were tracked separately, so only the combined total is shown." });
  }
  const g = guardStats(r.explanations, r.portfolioNote);
  rows.push({ id: "guard", stage: "Number guard", model: "deterministic code", calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0, avgMs: null,
    note: `Checked ${g.checked} model texts and replaced ${g.stripped} dollar figure${g.stripped === 1 ? "" : "s"} the engine did not compute. A model can never put a made-up dollar amount on screen.` });
  rows.push({ id: "engine", stage: "Rules engine", model: "deterministic code", calls: 0, failed: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0, avgMs: null,
    note: "Eligibility, deadlines and every dollar figure, in integer cents. No model touches the numbers." });
  return rows;
}

export function stageTotals(rows: StageRow[]) {
  return rows.reduce((t, r) => ({ calls: t.calls + r.calls, promptTokens: t.promptTokens + r.promptTokens, completionTokens: t.completionTokens + r.completionTokens,
    reasoningTokens: t.reasoningTokens + r.reasoningTokens, costUsd: Math.round((t.costUsd + r.costUsd) * 1e6) / 1e6 }),
    { calls: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0, costUsd: 0 });
}
