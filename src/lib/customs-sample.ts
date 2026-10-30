import fs from "node:fs";
import path from "node:path";
import { parseEs003 } from "./parse";
import { validateEntries } from "./validate";
import type { Verdict } from "./types";

/**
 * The recorded sample run predates the `customs` field and cannot be regenerated without paid AI credit. The field is purely
 * deterministic, so it is recomputed from the same synthetic CSV and merged by entry id. Nothing AI-written is touched.
 */
export function withCustoms<R extends { portfolio: { verdicts: Verdict[] } }>(run: R): R {
  const dir = path.join(process.cwd(), "data");
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "sample-meta.json"), "utf8"));
  const { entries } = parseEs003(fs.readFileSync(path.join(dir, "sample-es003.csv"), "utf8"));
  const fresh = new Map(validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes }).verdicts.map((v) => [v.id, v.customs]));
  for (const v of run.portfolio.verdicts) if (!v.customs && fresh.get(v.id)) v.customs = fresh.get(v.id);
  return run;
}
