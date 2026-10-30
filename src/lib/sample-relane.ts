import fs from "node:fs";
import path from "node:path";
import { parseEs003 } from "./parse";
import { validateEntries, type Portfolio } from "./validate";
import type { Verdict } from "./types";

/**
 * The recorded sample run predates the net-bill rule fix (a positive other-duty underpayment no longer sends a shipment to
 * "Your broker decides"; only net <= 0 does). It cannot be regenerated without paid AI credit, and the lane is purely
 * deterministic, so it is re-derived from the same synthetic CSV and applied by CSV row (entryIdx). Ids, order and the AI text of every entry
 * whose group did not change are left exactly as recorded; the AI text of the entries that moved is dropped (it names the old group). Group totals, importer debt summaries and declaration counts come from
 * the same fresh engine run, so the board adds up.
 */
export function applyFreshLanes<R extends { portfolio: { verdicts: Verdict[]; lanes: Portfolio["lanes"]; iors: Portfolio["iors"]; declarations: Portfolio["declarations"] }; explanations?: Record<string, unknown> }>(run: R, fresh: Portfolio): R {
  const byIdx = new Map(fresh.verdicts.map((v) => [v.entryIdx, v]));
  for (const v of run.portfolio.verdicts) {
    const f = byIdx.get(v.entryIdx);
    if (f && f.lane !== v.lane) {
      v.lane = f.lane; v.filingStep = f.filingStep;
      // The recorded AI text for a re-laned entry says it sits in the old lane ("NET_BILL_RISK lane"), which the board now contradicts.
      // Drop it rather than show a sentence that disagrees with the group the entry is in. Nothing is rewritten or invented.
      if (run.explanations) delete run.explanations[v.id];
    }
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
