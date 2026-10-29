import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelUnavailableError, modelErrorKind } from "../src/lib/nebius";
import { runPipeline, type RunEvent } from "../src/lib/pipeline";

const csv = fs.readFileSync("data/sample-es003.csv", "utf8");
const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const opts = { asOf: meta.asOf, filerCodes: meta.filerCodes as string[], label: meta.label };

describe("out-of-credit (HTTP 402) fails fast and says so", () => {
  const old = process.env.NEBIUS_API_KEY;
  beforeEach(() => { process.env.NEBIUS_API_KEY = "test-key-not-real"; });
  afterEach(() => { vi.unstubAllGlobals(); if (old === undefined) delete process.env.NEBIUS_API_KEY; else process.env.NEBIUS_API_KEY = old; });

  it("classifies the exact Token Factory 402 body", () => {
    expect(modelErrorKind('Token Factory call failed: HTTP 402 {"error":{"type":"insufficient_quota","code":"credit_balance_exhausted"}}')).toBe("credit");
    expect(modelErrorKind("Token Factory call failed: HTTP 401 {}")).toBe("auth");
    expect(modelErrorKind("Token Factory call failed: HTTP 429 {}")).toBeNull();
    expect(modelErrorKind("fetch failed")).toBeNull();
  });

  it("a 402 on the first Lightning calls aborts the run with ModelUnavailableError, emits no board, and stops calling the API", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: { type: "insufficient_quota", code: "credit_balance_exhausted" } }), { status: 402 }));
    vi.stubGlobal("fetch", f);
    const events: RunEvent[] = [];
    await expect(runPipeline(csv, opts, (e) => events.push(e))).rejects.toBeInstanceOf(ModelUnavailableError);
    expect(events.some((e) => e.type === "board")).toBe(false);
    // 69 entries, concurrency 10: only the in-flight first wave may hit the API (one call each, 4xx is not retried)
    expect(f.mock.calls.length).toBeLessThanOrEqual(12);
  });
});
