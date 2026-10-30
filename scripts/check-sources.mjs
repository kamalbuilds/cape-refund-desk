// Re-verify every cited authority resolves. Usage: node scripts/check-sources.mjs  (needs network; exits 1 on any failure)
import fs from "node:fs";
const src = fs.readFileSync(new URL("../src/lib/sources.ts", import.meta.url), "utf8");
const urls = [...src.matchAll(/url: "(https:[^"]+)"/g)].map((m) => m[1]);
let bad = 0;
for (const u of urls) {
  try {
    const r = await fetch(u, { redirect: "follow", headers: { "user-agent": "Mozilla/5.0 (compatible; cape-refund-desk source check)" }, signal: AbortSignal.timeout(25000) });
    console.log(r.ok ? "ok  " : "FAIL", r.status, u);
    if (!r.ok) bad++;
  } catch (e) { console.log("FAIL", String(e.message ?? e), u); bad++; }
}
console.log(`${urls.length - bad}/${urls.length} resolve`);
process.exit(bad ? 1 : 0);
