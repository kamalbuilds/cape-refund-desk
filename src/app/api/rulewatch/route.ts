import fs from "node:fs";
import path from "node:path";
import { runRuleWatch, type WatchResult } from "@/lib/rulewatch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Live check first. If CBP and Tavily are both unreachable from this host, show the last recorded real check, labelled as such. */
export async function GET() {
  const live = await runRuleWatch();
  if (live.ok) return Response.json(live);
  try {
    const rec = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "rulewatch-recorded.json"), "utf8")) as WatchResult;
    return Response.json({ ...rec, ok: true, note: `Live fetch failed from this host (${live.note}) Showing the recorded check from ${rec.checkedAt.slice(0, 10)} instead. ` + rec.note });
  } catch { return Response.json(live); }
}
