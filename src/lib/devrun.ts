import fs from "node:fs";
import path from "node:path";
import { DEV_RUNS_DIR, OPENROUTER_LABEL, providerName } from "./provider";
import type { RunResult } from "./pipeline";

/**
 * DEV ONLY. Writes an OpenRouter-fallback run to the gitignored .dev-runs/ directory, stamped provider=openrouter.
 * Refuses for any other provider, and can never write under data/ (the committed samples and receipts).
 */
export function writeDevRun(res: RunResult, tag: string, cwd = process.cwd()): string {
  if (providerName() !== "openrouter" || res.receipt.provider !== "openrouter") throw new Error("writeDevRun is only for OpenRouter dev runs.");
  const dir = path.resolve(cwd, DEV_RUNS_DIR);
  if (dir.startsWith(path.resolve(cwd, "data") + path.sep)) throw new Error("Refusing to write dev runs under data/.");
  fs.mkdirSync(dir, { recursive: true });
  const safe = tag.replace(/[^a-z0-9_-]/gi, "-");
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${safe}.json`);
  fs.writeFileSync(file, JSON.stringify({ provider: "openrouter", providerLabel: OPENROUTER_LABEL, devOnly: true, result: res }, null, 1));
  return file;
}
