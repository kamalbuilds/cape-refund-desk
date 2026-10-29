// Third, independent reading of the rule-watch changes, through `treg` (web.extract), for the recorded check.
//   TREG_TOKEN comes from your shell; this script never prints it. Usage: node scripts/treg-crosscheck.mjs
// For each "key" change it checks that the words that are NEW on the CBP page appear in treg's extract of the
// live page, and that the words that DISAPPEARED appear in treg's extract of the July 11 Wayback capture.
import fs from "node:fs";
import { execFileSync } from "node:child_process";

const snap = JSON.parse(fs.readFileSync("data/cbp-snapshot.json", "utf8"));
const ts = (snap.via.match(/capture (\d{14})/) ?? [])[1];
const LIVE = snap.url, WAYBACK = `https://web.archive.org/web/${ts}id_/${snap.url}`;

function extract(url) {
  const out = execFileSync("treg", ["call", "treg.web.extract", "--header", "X-Treg-Route-Max-Cost: 0.01", "--data", JSON.stringify({ url })], { encoding: "utf8", maxBuffer: 64e6, stdio: ["ignore", "pipe", "pipe"] });
  const md = JSON.parse(out).output.pages[0].markdown;
  if (!md || md.length < 5000) throw new Error("treg returned too little text for " + url);
  return md;
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9§ ]+/g, " ").replace(/\s+/g, " ").trim();
const words = (s) => norm(s).split(" ").filter((w) => w.length > 2);
/** words in `a` that are not in `b` (the part of the change that is new on that side) */
const fresh = (a, b) => { const B = new Set(words(b)); return [...new Set(words(a).filter((w) => !B.has(w)))]; };

const rec = JSON.parse(fs.readFileSync("data/rulewatch-recorded.json", "utf8"));
const live = norm(extract(LIVE)), july = norm(extract(WAYBACK));
const has = (page, w) => page.includes(w);
if (has(live, "zzqxkjvw") || has(july, "zzqxkjvw")) throw new Error("negative control failed");
const report = [];
for (const c of rec.changes) {
  const fa = fresh(c.after, c.before), fb = fresh(c.before, c.after);
  const a = fa.length ? fa.filter((w) => has(live, w)).length / fa.length : 1;
  const b = fb.length ? fb.filter((w) => has(july, w)).length / fb.length : 1;
  c.confirmedByTreg = fa.length + fb.length > 0 && a >= 0.9 && b >= 0.9; // a change with no fresh words (pure reflow) is not confirmed
  report.push({ key: !!c.key, kind: c.kind, newWords: fa.length, newOnLive: +a.toFixed(2), goneWords: fb.length, presentJuly: +b.toFixed(2), confirmed: c.confirmedByTreg, head: (c.after || c.before).slice(0, 60) });
}
rec.tregCrossCheckedAt = new Date().toISOString();
fs.writeFileSync("data/rulewatch-recorded.json", JSON.stringify(rec, null, 1));
console.table(report);
console.log(`treg confirms ${report.filter((r) => r.confirmed).length} of ${report.length} changes (${report.filter((r) => r.key && r.confirmed).length} of ${report.filter((r) => r.key).length} key)`);
