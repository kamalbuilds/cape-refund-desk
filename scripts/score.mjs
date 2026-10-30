// Scored test: rules engine vs hand-labelled truth (data/sample-truth.json) on the 69 synthetic sample entries.
// Usage: node scripts/score.mjs [--json]   Writes nothing; exits 1 if strict accuracy drops below 90% (a regression floor, not a target).
// The model-alone arms (Nemotron Ultra, Lightning) are run by scripts/model-arms.ts; this prints their numbers from docs/receipts/model-arms-2026-10-30.json.
import fs from "node:fs";
import { tsImport } from "tsx/esm/api";
const { scoreRulesEngine } = await tsImport("../src/lib/scored-test.ts", import.meta.url);
const { LANE_ORDER, pct } = await tsImport("../src/lib/score-metrics.ts", import.meta.url);

const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const truth = JSON.parse(fs.readFileSync("data/sample-truth.json", "utf8"));
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const { strict, lenient } = scoreRulesEngine(csv, meta, truth);
const { arms } = JSON.parse(fs.readFileSync("docs/receipts/model-arms-2026-10-30.json", "utf8"));
if (process.argv.includes("--json")) { console.log(JSON.stringify({ rulesEngine: { strict, lenient }, modelArms: arms }, null, 1)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
const rpad = (s, n) => String(s).padStart(n);
for (const [name, r] of [["STRICT (primary label only)", strict], ["LENIENT (also accepts a defensible second lane)", lenient]]) {
  console.log(`\nRules engine, ${name}: ${r.correct}/${r.total} correct, accuracy ${pct(r.accuracy)}`);
  console.log(pad("lane", 15) + ["precision", "recall", "f1", "support", "predicted"].map((h) => rpad(h, 10)).join(""));
  for (const l of LANE_ORDER) { const s = r.perLane[l]; console.log(pad(l, 15) + [pct(s.precision), pct(s.recall), pct(s.f1), s.support, s.predicted].map((v) => rpad(v, 10)).join("")); }
  console.log(`macro precision ${pct(r.macroPrecision)}, macro recall ${pct(r.macroRecall)}`);
  console.log("confusion matrix (rows = truth, cols = engine)");
  console.log(pad("", 15) + LANE_ORDER.map((l) => rpad(l, 14)).join(""));
  for (const t of LANE_ORDER) console.log(pad(t, 15) + LANE_ORDER.map((p) => rpad(r.matrix[t][p], 14)).join(""));
}
console.log(`\nDisagreements with the truth (strict): ${strict.mismatches.length}`);
for (const m of strict.mismatches) console.log(` #${m.n} ${m.entryNumber}: truth ${m.truth}, engine ${m.predicted}${m.defensible ? " (engine's lane is also defensible)" : ""}\n    ${m.reason}`);
console.log("\nEngine vs model alone (from the committed receipt):");
for (const a of Object.values(arms)) console.log(` ${pad(a.label, 26)} group ${a.lane.strictCorrect}/${a.n} (${pct(a.lane.strictAccuracy)}), exact days left ${a.deadline.exactCorrect}/${a.deadline.liquidatedN} (${pct(a.deadline.exactRate)}), cost \$${a.costUsd.toFixed(3)}`);
if (strict.accuracy < 0.9) { console.error("\nFAIL: strict accuracy below the 90% regression floor"); process.exit(1); }
