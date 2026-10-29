import fs from "node:fs";
import path from "node:path";
import { runRuleWatch, type WatchResult } from "@/lib/rulewatch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Live check first. If CBP and Tavily are both unreachable from this host, show the last recorded real check, labelled as such. */
export async function GET() {
  const live = await runRuleWatch();
  const load = () => JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "rulewatch-recorded.json"), "utf8")) as WatchResult;
  if (live.ok) {
    // The treg cross-check is run offline (scripts/treg-crosscheck.mjs). Carry its result over to a live change only when the quoted text is identical.
    try {
      const rec = load(); const sig = (c: { before: string; after: string }) => (c.before + "|" + c.after).replace(/\s+/g, " ").slice(0, 400);
      const m = new Map((rec.changes ?? []).map((c) => [sig(c), c.confirmedByTreg]));
      for (const c of live.changes ?? []) if (m.get(sig(c))) c.confirmedByTreg = true;
    } catch { /* no recorded file: no treg badge */ }
    return Response.json(live);
  }
  try {
    const rec = load();
    return Response.json({ ...rec, ok: true, note: `Live fetch failed from this host (${live.note}) Showing the recorded check from ${rec.checkedAt.slice(0, 10)} instead. ` + rec.note });
  } catch { return Response.json(live); }
}
