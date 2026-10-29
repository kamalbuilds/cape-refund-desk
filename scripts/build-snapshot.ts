// Builds data/cbp-snapshot.json from an archived capture of CBP's IEEPA refunds page
// (Internet Archive Wayback, raw "id_" capture). Usage: tsx scripts/build-snapshot.ts data/snapshots/wb-20260711.html 20260711193812
import fs from "node:fs";
import { htmlToLines, sha, WATCH_URL } from "../src/lib/rulewatch";
const [file, ts] = process.argv.slice(2);
const lines = htmlToLines(fs.readFileSync(file, "utf8"));
const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;
const snap = { url: WATCH_URL, capturedAt: iso, via: `Internet Archive Wayback Machine capture ${ts} of the CBP page (web.archive.org/web/${ts}id_/${WATCH_URL})`, sha256: sha(lines), lines };
fs.writeFileSync("data/cbp-snapshot.json", JSON.stringify(snap, null, 1));
console.log("snapshot lines", lines.length, snap.sha256);
