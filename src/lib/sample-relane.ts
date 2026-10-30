import fs from "node:fs";
import path from "node:path";
import { parseEs003 } from "./parse";
import { validateEntries, type Portfolio } from "./validate";
import type { Verdict } from "./types";

/**
 * The recorded sample run predates the net-bill rule fix (a positive other-duty underpayment no longer sends a shipment to
 * "Your broker decides"; only net <= 0 does). It cannot be regenerated without paid AI credit, and the lane is purely
 * deterministic, so it is re-derived from the same synthetic CSV and applied by CSV row (entryIdx). Ids, order, AI text and
 * every AI-written word are left exactly as recorded. Group totals, importer debt summaries and declaration counts come from
 * the same fresh engine run, so the board adds up.
 */
export function applyFreshLanes<R extends { portfolio: { verdicts: Verdict[]; lanes: Portfolio["lanes"]; iors: Portfolio["iors"]; declarations: Portfolio["declarations"] } }>(run: R, fresh: Portfolio): R {
  const byIdx = new Map(fresh.verdicts.map((v) => [v.entryIdx, v]));
  for (const v of run.portfolio.verdicts) {
    const f = byIdx.get(v.entryIdx);
    if (f && f.lane !== v.lane) { v.lane = f.lane; v.filingStep = f.filingStep; }
  }
  run.portfolio.lanes = fresh.lanes;
  run.portfolio.iors = fresh.iors;
  run.portfolio.declarations = fresh.declarations;
  return run;
}

export function withCurrentLanes<R extends Parameters<typeof applyFreshLanes>[0]>(run: R): R {
  const dir = path.join(process.cwd(), "data");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "sample-meta.json"), "utf8"));
  const { entries } = parseEs003(fs.readFileSync(path.join(dir, "sample-es003.csv"), "utf8"));
  return applyFreshLanes(run, validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes }));
}
