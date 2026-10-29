import fs from "node:fs";
import { parseEs003 } from "../src/lib/parse";
import { validateEntries } from "../src/lib/validate";
const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const { entries } = parseEs003(fs.readFileSync("data/sample-es003.csv", "utf8"));
const pf = validateEntries(entries, { asOf: meta.asOf, filerCodes: meta.filerCodes });
for (const v of pf.verdicts) console.log(String(v.order).padStart(2), v.lane.padEnd(13), v.displayNumber.padEnd(14), (v.money.netCents / 100).toFixed(0).padStart(9), v.findings.map((f) => f.cbpError ?? f.code).join(" | ").slice(0, 90), "::", v.filingStep.slice(0, 40));
console.log(JSON.stringify(pf.lanes), JSON.stringify(pf.iors), pf.declarations);
