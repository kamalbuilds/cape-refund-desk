"use client";
import type { Explanation, PortfolioNote, Receipt } from "@/lib/pipeline";
import { OPENROUTER_LABEL } from "@/lib/provider";
import { stageRows, stageTotals } from "@/lib/receipt-stages";

const usd = (n: number) => (n === 0 ? "$0" : n < 0.001 ? "<$0.001" : `$${n.toFixed(3)}`);

export default function StageReceipt({ receipt, explanations, portfolioNote, mode }: { receipt: Receipt | null; explanations: Record<string, Explanation>; portfolioNote: PortfolioNote | null; mode: string }) {
  if (!receipt || mode === "browser") return null;
  const rows = stageRows({ receipt, explanations, portfolioNote });
  const t = stageTotals(rows);
  const replay = receipt.mode === "replay";
  return (
    <section className="panel" aria-label="Run receipt by stage" data-testid="stage-receipt">
      <h2>Run receipt, stage by stage</h2>
      {receipt.provider === "openrouter" && <p className="fine warn" data-testid="dev-provider-badge-stage"><b>{OPENROUTER_LABEL}.</b> provider=openrouter. Free tier, cost $0.</p>}
      <p className="fine">{receipt.provider === "openrouter" ? "Dev run: values logged from this run's own OpenRouter calls." : replay ? "Recorded run: real logged values from the live Nebius Token Factory run, replayed here. Nothing below is estimated or typed in by hand." : "Live run: values logged from this run's own calls."} {receipt.provider === "openrouter" ? "" : "Cost is tokens times Nebius list price."}</p>
      <div style={{ overflowX: "auto" }}>
        <table className="tbl" style={{ marginTop: 10 }}>
          <thead><tr><th>Stage</th><th>Model</th><th className="num">Calls</th><th className="num">Tokens in / out</th><th className="num">Avg ms</th><th className="num">Cost</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`stage-row-${r.id}`}>
                <td><b className="font-medium text-[var(--text)]">{r.stage}</b><br /><span className="fine">{r.note}</span></td>
                <td className="mono" style={{ fontSize: 12 }}>{r.model}</td>
                <td className="num">{r.calls || "-"}</td>
                <td className="num">{r.calls ? `${r.promptTokens.toLocaleString()} / ${r.completionTokens.toLocaleString()}` : "-"}</td>
                <td className="num">{r.avgMs === null ? "-" : r.avgMs.toLocaleString()}</td>
                <td className="num">{usd(r.costUsd)}</td>
              </tr>))}
            <tr><td><b className="font-medium text-[var(--text)]">Total</b></td><td /><td className="num">{t.calls}</td><td className="num">{t.promptTokens.toLocaleString()} / {t.completionTokens.toLocaleString()}</td><td className="num">wall {(receipt.wallMs / 1000).toFixed(1)} s</td><td className="num">{usd(t.costUsd)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
