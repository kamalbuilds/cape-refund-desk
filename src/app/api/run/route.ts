import { hasKey } from "@/lib/nebius";
import { runPipeline, type RunEvent } from "@/lib/pipeline";
import fs from "node:fs";
import path from "node:path";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Stateless: the CSV lives in this request only. Nothing is written to disk or a database.
const MAX_BYTES = 1_000_000;
const MAX_ENTRIES_LIVE = Number(process.env.MAX_LIVE_ENTRIES ?? 150);
const MAX_RUNS = Number(process.env.LIVE_RUNS_MAX ?? 40);
let runs = 0;

export async function POST(req: Request) {
  let body: { csv?: string; sample?: boolean; asOf?: string; filerCodes?: string[] };
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body." }, { status: 400 }); }
  if (!hasKey()) return Response.json({ error: "Live runs are disabled on this host (no NEBIUS_API_KEY). Use the recorded run." }, { status: 503 });
  if (runs >= MAX_RUNS) return Response.json({ error: "Live-run budget for this instance is used up. Use the recorded run." }, { status: 429 });

  let csv = body.csv ?? "";
  let asOf = body.asOf || new Date().toISOString().slice(0, 10);
  let filerCodes = (body.filerCodes ?? []).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{3}$/.test(s));
  let label = "Uploaded file. Processed in memory, not stored.";
  if (body.sample) {
    const dir = path.join(process.cwd(), "data");
    csv = fs.readFileSync(path.join(dir, "sample-es003.csv"), "utf8");
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "sample-meta.json"), "utf8"));
    asOf = meta.asOf; filerCodes = meta.filerCodes; label = meta.label;
  }
  if (!csv.trim()) return Response.json({ error: "No CSV provided." }, { status: 400 });
  if (Buffer.byteLength(csv) > MAX_BYTES) return Response.json({ error: "File is over 1MB. CBP's own CAPE limit is 1MB; split it first." }, { status: 413 });
  if (!filerCodes.length) {
    const counts = new Map<string, number>();
    for (const m of csv.matchAll(/(?:^|[,\r\n'"])([A-Z0-9]{3})[A-Z0-9-]{8,12}/gm)) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) filerCodes = [top[0]];
  }
  const lines = csv.split(/\r?\n/).length;
  if (lines > MAX_ENTRIES_LIVE * 4) return Response.json({ error: `Live mode on this host is capped at about ${MAX_ENTRIES_LIVE} entries.` }, { status: 413 });
  runs++;

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: RunEvent) => controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
      try { await runPipeline(csv, { asOf, filerCodes, label }, send); }
      catch (err) { send({ type: "error", message: err instanceof Error ? err.message : "Run failed" }); }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

export async function GET() {
  return Response.json({ live: hasKey(), runsUsed: runs, runsMax: MAX_RUNS });
}
