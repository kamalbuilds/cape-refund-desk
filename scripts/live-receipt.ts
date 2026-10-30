// Token Factory live run with a committed receipt. Default provider only (refuses NEMOTRON_PROVIDER=openrouter).
//   zsh -ic 'cd <repo> && npx tsx scripts/live-receipt.ts mini'   -> 13-row seeded-conflict mini run
//   zsh -ic 'cd <repo> && npx tsx scripts/live-receipt.ts full'   -> 69-shipment run; writes data/sample-run.json
// Writes docs/receipts/tokenfactory-<mode>.json (summary, committed) and the full result blob to $CAPE_BLOB_DIR (default .dev-runs/).
// Never prints or stores keys.
import fs from "node:fs";
import path from "node:path";
import { runPipeline, type RunResult } from "../src/lib/pipeline";
import { chat, startCallLog, takeCallLog, hasKey } from "../src/lib/nebius";
import { providerName } from "../src/lib/provider";
import { vetoStats } from "../src/lib/signals";

const mode = process.argv[2] === "full" ? "full" : "mini";
if ((process.env.NEMOTRON_PROVIDER ?? "tokenfactory").toLowerCase() !== "tokenfactory" || providerName() !== "tokenfactory") { console.error("Token Factory only. Unset NEMOTRON_PROVIDER."); process.exit(1); }
if (!hasKey()) { console.error("NEBIUS_API_KEY is not set"); process.exit(1); }

const pct = (a: number[], p: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : 0; };
const stat = (calls: ReturnType<typeof takeCallLog>) => ({
  calls: calls.length,
  medianMs: pct(calls.map((c) => c.ms), 50), p95Ms: pct(calls.map((c) => c.ms), 95), maxMs: Math.max(0, ...calls.map((c) => c.ms)),
  promptTokens: calls.reduce((a, c) => a + c.promptTokens, 0), completionTokens: calls.reduce((a, c) => a + c.completionTokens, 0), reasoningTokens: calls.reduce((a, c) => a + c.reasoningTokens, 0),
  modelIdsReturned: [...new Set(calls.map((c) => c.modelReturned))],
});

// Seeded conflicts in data/sample-mini.csv: the broker note contradicts the structured columns. The auditor (fast-model tag + code veto) must keep these.
const SEEDED = [
  { entry: "A7K80000033", signal: "drawback_claim", planted: "note says drawback claim DBK-4410 but drawback_claim=N" },
  { entry: "A7K80000011", signal: "protest", planted: "note says protest filed but protest_status is not Open/Suspended/Denied" },
  { entry: "A7K80000022", signal: "recon", planted: "note says Type 09 recon filed but recon_flag=N" },
];

async function main() {
  const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
  const csv = fs.readFileSync(mode === "full" ? "data/sample-es003.csv" : "data/sample-mini.csv", "utf8");
  const startedAt = new Date().toISOString();
  startCallLog();
  const t0 = Date.now();
  const opts = mode === "full"
    ? { asOf: meta.asOf, filerCodes: meta.filerCodes, label: meta.label }
    : { asOf: meta.asOf, filerCodes: meta.filerCodes, label: "SYNTHETIC MINI-RUN", ultraMax: 4, lightningConcurrency: 3, ultraConcurrency: 2 };
  let res: RunResult;
  try {
    res = await runPipeline(csv, opts, (e) => {
      if (e.type === "lightning" && e.done % 10 === 0) console.error("lightning", e.done, "/", e.total);
      if (e.type === "ultra") console.error("ultra", e.done, "/", e.total);
      if (e.type === "portfolio-note") console.error("portfolio note ok");
    });
  } catch (e) { takeCallLog(); console.error("RUN FAILED:", String(e instanceof Error ? e.message : e).slice(0, 300)); process.exit(2); }
  const wallMs = Date.now() - t0;
  const calls = takeCallLog();
  const light = calls.filter((c) => c.role === "lightning"), ultra = calls.filter((c) => c.role === "ultra");
  const r = res.receipt;

  // Auditor outcome per entry that carries a broker note
  const notes = Object.entries(res.entryInfo).filter(([, i]) => i.notes).map(([id, i]) => {
    const raw = i.noteSignalsRaw ?? i.noteSignals;
    return { id, note: i.notes, rawTags: raw, keptTags: i.noteSignals, vetoedTags: (i.noteVetoed ?? []).map((v) => v.signal), conflictsFinal: i.noteConflicts.map((c) => c.signal) };
  });
  const vetoedTotal = notes.reduce((a, n) => a + n.vetoedTags.length, 0);
  const seeded = mode === "mini" ? SEEDED.map((s) => {
    const n = notes.find((x) => x.id.startsWith(s.entry + "#"));
    return { ...s, caught: !!n?.conflictsFinal.includes(s.signal), conflictsFinal: n?.conflictsFinal ?? [] };
  }) : undefined;
  const guardStripped = Object.values(res.explanations).reduce((a, e) => a + e.guardStripped, 0) + (res.portfolioNote?.guardStripped ?? 0);

  const receipt = {
    provider: "nebius-token-factory",
    providerLabel: "Real run on Nebius Token Factory (default provider). Not OpenRouter, not replayed.",
    mode, startedAt, ranAt: r.ranAt, host: r.host,
    inputs: { csv: mode === "full" ? "data/sample-es003.csv (69 synthetic shipments, 79 rows)" : "data/sample-mini.csv (synthetic mini set, 13 rows)", asOf: meta.asOf },
    modelsRequested: { ultra: "nvidia/Nemotron-3-Ultra-550b-a55b", lightning: "nvidia/Nemotron-3_5-Lightning" },
    modelsReturnedByApi: { ultra: stat(ultra).modelIdsReturned, lightning: stat(light).modelIdsReturned },
    wallMs, wallSeconds: Math.round(wallMs / 100) / 10,
    totals: { ...stat(calls), failedCalls: r.lightning.failed + r.ultra.failed, estCostUsd: Math.round((r.lightning.costUsd + r.ultra.costUsd - 0) * 10000) / 10000 },
    lightning: { ...stat(light), failed: r.lightning.failed, firstError: r.lightning.firstError ?? null },
    ultra: { ...stat(ultra), failed: r.ultra.failed, firstError: r.ultra.firstError ?? null, explanations: Object.keys(res.explanations).length, portfolioNote: !!res.portfolioNote },
    normalization: { checked: res.normalization.checked, agree: res.normalization.agree },
    auditor: { notesChecked: notes.length, fabricatedTagsRemovedByCodeVeto: vetoedTotal, // entries that carry a broker note
      tagVetoAllEntries: vetoStats(Object.values(res.entryInfo)), // every entry, same numbers the credibility test and /api/sample use
      numberGuardStrippedFromUltraText: guardStripped, seededConflicts: seeded, seededCaught: seeded ? seeded.filter((s) => s.caught).length : undefined, seededTotal: seeded?.length, perNote: notes },
    perCall: calls.map((c) => ({ role: c.role, model: c.modelReturned, id: c.id, ms: c.ms, promptTokens: c.promptTokens, completionTokens: c.completionTokens, reasoningTokens: c.reasoningTokens })),
    note: "estCostUsd uses Nebius list prices x usage (see src/lib/nebius.ts PRICES); latencies are client-side wall time per successful call.",
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const blobDir = process.env.CAPE_BLOB_DIR ?? ".dev-runs";
  fs.mkdirSync(blobDir, { recursive: true });
  fs.writeFileSync(path.join(blobDir, `${stamp}-tokenfactory-${mode}-result.json`), JSON.stringify(res));
  fs.writeFileSync(path.join(blobDir, `${stamp}-tokenfactory-${mode}-receipt.json`), JSON.stringify(receipt, null, 1));
  console.log(JSON.stringify({ ...receipt, perCall: undefined, auditor: { ...receipt.auditor, perNote: undefined } }, null, 1));
  console.log("notes:"); for (const n of notes) console.log(" ", n.id, "raw", n.rawTags.join(","), "kept", n.keptTags.join(","), "vetoed", n.vetoedTags.join(","), "conflicts", n.conflictsFinal.join(","));
  if (process.env.CAPE_WRITE === "1") {
    fs.mkdirSync("docs/receipts", { recursive: true });
    fs.writeFileSync(`docs/receipts/tokenfactory-${mode}.json`, JSON.stringify(receipt, null, 1) + "\n");
    if (mode === "full") fs.writeFileSync("data/sample-run.json", JSON.stringify(res));
    console.log("written docs/receipts/tokenfactory-" + mode + ".json" + (mode === "full" ? " and data/sample-run.json" : ""));
  }
}
main();
