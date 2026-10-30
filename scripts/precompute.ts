// Runs the REAL pipeline once against Token Factory on the synthetic sample and stores data/sample-run.json
// (with completion ids) so the demo can replay it in seconds. Live mode stays available in the UI.
import fs from "node:fs";
import { runPipeline } from "../src/lib/pipeline";
if ((process.env.NEMOTRON_PROVIDER ?? "tokenfactory").toLowerCase() !== "tokenfactory") { console.error("precompute writes the committed data/sample-run.json and must be a Token Factory run. Unset NEMOTRON_PROVIDER."); process.exit(1); }
const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
async function main() {
const t = Date.now();
const res = await runPipeline(csv, { asOf: meta.asOf, filerCodes: meta.filerCodes, label: meta.label }, (e) => {
  if (e.type === "lightning" && e.done % 10 === 0) console.error("lightning", e.done, "/", e.total);
  if (e.type === "ultra") console.error("ultra", e.done, "/", e.total);
  if (e.type === "portfolio-note") console.error("portfolio note");
});
fs.writeFileSync("data/sample-run.json", JSON.stringify(res));
console.error("done in", Date.now() - t, "ms");
console.error(JSON.stringify({ l: { ...res.receipt.lightning, ids: res.receipt.lightning.ids.length }, u: { ...res.receipt.ultra, ids: res.receipt.ultra.ids.length }, norm: { c: res.normalization.checked, a: res.normalization.agree }, expl: Object.keys(res.explanations).length }));
}
main();
