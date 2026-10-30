// DEV ONLY. Exercises the live paths against the OpenRouter free-tier fallback on the small mini CSV and writes the
// result to the gitignored .dev-runs/. Never writes data/. Run:  zsh -ic 'NEMOTRON_PROVIDER=openrouter npx tsx scripts/dev-live.ts'
import fs from "node:fs";
import { runPipeline } from "../src/lib/pipeline";
import { chat } from "../src/lib/nebius";
import { providerName, OPENROUTER_LABEL } from "../src/lib/provider";
import { writeDevRun } from "../src/lib/devrun";

async function main() {
  if (providerName() !== "openrouter") { console.error("Set NEMOTRON_PROVIDER=openrouter (dev only, not on Vercel / production)."); process.exit(1); }
  console.log(`[provider=openrouter] ${OPENROUTER_LABEL}`);
  const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
  const csv = fs.readFileSync("data/sample-mini.csv", "utf8");
  // 1. Lightning fast call
  const lf = await chat({ model: "lightning", thinking: false, json: true, user: 'Return JSON {"ok":true}.', maxTokens: 200 });
  console.log(`lightning fast call: ${lf.ms} ms, content=${JSON.stringify(lf.content.slice(0, 40))}, retries=${lf.retries}, fromReasoning=${!!lf.fromReasoning}, model=${lf.model}`);
  // 2. Mini pipeline (Lightning fan-out, code veto, Ultra explanations, broker memo)
  const t0 = Date.now();
  const res = await runPipeline(csv, { asOf: meta.asOf, filerCodes: meta.filerCodes, label: "SYNTHETIC MINI-RUN (dev)", ultraMax: 4, lightningConcurrency: 3, ultraConcurrency: 2 }, (e) => {
    if (e.type === "lightning" && e.done % 5 === 0) console.log("lightning", e.done, "/", e.total);
    if (e.type === "ultra") console.log("ultra", e.done, "/", e.total);
    if (e.type === "portfolio-note") console.log("portfolio note ok");
  });
  const file = writeDevRun(res, "dev-live-mini");
  const r = res.receipt;
  console.log(`wall ${Date.now() - t0} ms; receipt.provider=${r.provider}; label=${res.label.slice(0, 80)}`);
  console.log(`lightning: ${r.lightning.calls} calls, ${r.lightning.failed} failed, avg ${r.lightning.avgMs} ms, model ${r.lightning.model}, cost $${r.lightning.costUsd}${r.lightning.firstError ? ", firstError " + r.lightning.firstError : ""}`);
  console.log(`ultra: ${r.ultra.calls} calls, ${r.ultra.failed} failed, avg ${r.ultra.avgMs} ms, model ${r.ultra.model}, reasoning tokens ${r.ultra.reasoningTokens}${r.ultra.firstError ? ", firstError " + r.ultra.firstError : ""}`);
  console.log(`explanations: ${Object.keys(res.explanations).length}; portfolio note: ${res.portfolioNote ? "yes" : "no"}`);
  console.log(`normalization: ${res.normalization.agree}/${res.normalization.checked} fields agree`);
  // 3. Auditor / veto: which entries got 'AI caught' note conflicts
  for (const v of res.portfolio.verdicts) {
    const i = res.entryInfo[v.id];
    if (!i.notes && !i.noteConflictsRaw?.length) continue;
    console.log(`note ${v.displayNumber}: raw tags [${(i.noteSignalsRaw ?? []).join(",")}] kept [${i.noteSignals.join(",")}] conflicts raw=${i.noteConflictsRaw?.length ?? 0} final=${i.noteConflicts.length}${i.noteConflicts.length ? " -> " + i.noteConflicts.map((c) => c.signal).join(",") : ""}${i.noteVetoed?.length ? " vetoed " + i.noteVetoed.map((x) => x.signal).join(",") : ""}`);
  }
  console.log("saved", file);
}
main().catch((e) => { console.error("FAILED:", String(e instanceof Error ? e.message : e).slice(0, 300)); process.exit(1); });
