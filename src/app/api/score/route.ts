import fs from "node:fs";
import path from "node:path";
import { AI_ALONE_ARM, scoreRulesEngine } from "@/lib/scored-test";
import type { Truth } from "@/lib/score-metrics";
export const runtime = "nodejs";

/** Scored test on the bundled synthetic sample: the deterministic engine vs the hand-labelled truth. No AI call is made here. */
export async function GET() {
  const dir = path.join(process.cwd(), "data");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "sample-meta.json"), "utf8"));
  const truth = JSON.parse(fs.readFileSync(path.join(dir, "sample-truth.json"), "utf8")) as Truth;
  const csv = fs.readFileSync(path.join(dir, "sample-es003.csv"), "utf8");
  const rules = scoreRulesEngine(csv, meta, truth);
  return Response.json({ asOf: meta.asOf, method: truth.method, laneDefinitions: truth.laneDefinitions, rules, aiAlone: AI_ALONE_ARM }, { headers: { "cache-control": "public, max-age=300" } });
}
