import fs from "node:fs";
import path from "node:path";
export const runtime = "nodejs";

/** The recorded REAL run (completion ids included) and the synthetic CSV itself. */
export async function GET(req: Request) {
  const dir = path.join(process.cwd(), "data");
  const what = new URL(req.url).searchParams.get("f");
  if (what === "csv") return new Response(fs.readFileSync(path.join(dir, "sample-es003.csv")), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="sample-es003-synthetic.csv"' } });
  return new Response(fs.readFileSync(path.join(dir, "sample-run.json")), { headers: { "content-type": "application/json", "cache-control": "public, max-age=300" } });
}
