import fs from "node:fs";
import path from "node:path";
import { reguardRun } from "@/lib/numberguard";
import { applyCodeVeto } from "@/lib/signals";
import { withCustoms } from "@/lib/customs-sample";
export const runtime = "nodejs";

/** The recorded REAL run (completion ids included) and the synthetic CSV itself. */
export async function GET(req: Request) {
  const dir = path.join(process.cwd(), "data");
  const what = new URL(req.url).searchParams.get("f");
  if (what === "csv") return new Response(fs.readFileSync(path.join(dir, "sample-es003.csv")), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sample-es003-synthetic.csv"' } });
  const run = withCustoms(reguardRun(JSON.parse(fs.readFileSync(path.join(dir, "sample-run.json"), "utf8"))));
  for (const k of Object.keys(run.entryInfo)) run.entryInfo[k] = applyCodeVeto(run.entryInfo[k]);
  return new Response(JSON.stringify(run), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
