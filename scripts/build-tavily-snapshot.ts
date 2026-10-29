// Builds data/cbp-snapshot-tavily.json: the SAME archived capture as cbp-snapshot.json, but pushed through Tavily Extract,
// so the live Tavily fetch is compared apples to apples (same extractor, same markdown noise).
// Usage: TAVILY_API_KEY=... tsx scripts/build-tavily-snapshot.ts 20260711193812
import fs from "node:fs";
import { cropMain, textToLines, sha, WATCH_URL } from "../src/lib/rulewatch";
async function main() {
  const ts = process.argv[2];
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY not set");
  const url = `https://web.archive.org/web/${ts}id_/${WATCH_URL}`;
  const r = await fetch("https://api.tavily.com/extract", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` }, body: JSON.stringify({ urls: [url], extract_depth: "advanced", format: "markdown" }) });
  const j = (await r.json()) as { results?: { raw_content?: string }[]; failed_results?: unknown[] };
  const t = j.results?.[0]?.raw_content;
  if (!t) throw new Error("no content: " + JSON.stringify(j).slice(0, 300));
  fs.writeFileSync(`data/snapshots/wb-${ts.slice(0, 8)}.tavily.md`, t);
  const lines = cropMain(textToLines(t));
  const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
  fs.writeFileSync("data/cbp-snapshot-tavily.json", JSON.stringify({ url: WATCH_URL, capturedAt: iso, via: `Tavily Extract of the Internet Archive Wayback capture ${ts} (web.archive.org/web/${ts}id_/${WATCH_URL})`, sha256: sha(lines), lines }, null, 1));
  console.log("tavily snapshot lines", lines.length);
}
main();
