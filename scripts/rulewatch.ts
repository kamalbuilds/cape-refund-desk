import fs from "node:fs";
import { runRuleWatch } from "../src/lib/rulewatch";
// `npx tsx scripts/rulewatch.ts` prints the diff; add --record to store it as data/rulewatch-recorded.json (the fallback shown when this host cannot reach CBP).
runRuleWatch().then((r) => {
  if (process.argv.includes("--record")) { fs.writeFileSync("data/rulewatch-recorded.json", JSON.stringify({ ...r, added: [], removed: [] }, null, 1)); console.log("recorded", r.changes?.length, "changes"); }
  else console.log(JSON.stringify({ ...r, added: r.added.length, removed: r.removed.length }, null, 1));
});
