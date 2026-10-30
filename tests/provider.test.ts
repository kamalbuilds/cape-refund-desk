import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chat, hasKey, modelId } from "../src/lib/nebius";
import { OPENROUTER_LABEL, OPENROUTER_MODELS, assertOpenrouterAllowed, openrouterAllowed, resolveProvider } from "../src/lib/provider";
import { runPipeline } from "../src/lib/pipeline";
import { writeDevRun } from "../src/lib/devrun";

const mini = fs.readFileSync("data/sample-mini.csv", "utf8");
const meta = JSON.parse(fs.readFileSync("data/sample-meta.json", "utf8"));
const SAVED = { ...process.env };
const reset = () => {
  for (const k of ["NEMOTRON_PROVIDER", "VERCEL", "VERCEL_ENV", "VERCEL_URL", "CAPE_DEV_LOCAL", "OPENROUTER_API_KEY", "NEBIUS_API_KEY"]) delete process.env[k];
};
beforeEach(reset);
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); reset(); Object.assign(process.env, SAVED); });

describe("provider switch", () => {
  it("defaults to tokenfactory when NEMOTRON_PROVIDER is unset, empty or unknown", () => {
    expect(resolveProvider({}).provider).toBe("tokenfactory");
    expect(resolveProvider({ NEMOTRON_PROVIDER: "" }).provider).toBe("tokenfactory");
    expect(resolveProvider({ NEMOTRON_PROVIDER: "tokenfactory" }).provider).toBe("tokenfactory");
    expect(resolveProvider({ NEMOTRON_PROVIDER: "whatever" }).provider).toBe("tokenfactory");
  });
  it("default hasKey and model ids are the Token Factory ones", () => {
    process.env.NEBIUS_API_KEY = "x"; process.env.OPENROUTER_API_KEY = "y";
    expect(hasKey()).toBe(true);
    delete process.env.NEBIUS_API_KEY;
    expect(hasKey()).toBe(false); // an OpenRouter key alone never enables live mode by default
    expect(modelId("ultra")).toBe("nvidia/Nemotron-3-Ultra-550b-a55b");
  });
  it("openrouter is used on a local dev machine", () => {
    expect(resolveProvider({ NEMOTRON_PROVIDER: "openrouter", NODE_ENV: "development" })).toMatchObject({ provider: "openrouter", refused: false });
    expect(OPENROUTER_MODELS.ultra).toBe("nvidia/nemotron-3-ultra-550b-a55b:free");
    expect(OPENROUTER_MODELS.lightning).toBe("nvidia/nemotron-3.5-lightning:free");
  });
  it("openrouter is refused in production and on Vercel, falling back to tokenfactory", () => {
    const p = resolveProvider({ NEMOTRON_PROVIDER: "openrouter", NODE_ENV: "production" });
    expect(p).toMatchObject({ provider: "tokenfactory", refused: true });
    expect(resolveProvider({ NEMOTRON_PROVIDER: "openrouter", VERCEL: "1" }).provider).toBe("tokenfactory");
    expect(resolveProvider({ NEMOTRON_PROVIDER: "openrouter", VERCEL_ENV: "preview", CAPE_DEV_LOCAL: "1" }).provider).toBe("tokenfactory"); // Vercel can never opt in
    expect(openrouterAllowed({ NODE_ENV: "production" }).ok).toBe(false);
    expect(openrouterAllowed({ NODE_ENV: "production", CAPE_DEV_LOCAL: "1" }).ok).toBe(true); // explicit local `next start` only
    expect(() => assertOpenrouterAllowed({ NODE_ENV: "production" })).toThrow(/refused/);
  });
  it("the OpenRouter request code refuses in production and never calls the network", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEMOTRON_PROVIDER = "openrouter"; process.env.OPENROUTER_API_KEY = "k"; process.env.NEBIUS_API_KEY = "n";
    const f = vi.fn(async () => new Response("{}", { status: 402 }));
    vi.stubGlobal("fetch", f);
    // refused switch means this goes to Token Factory (honest 402), never to openrouter.ai
    await expect(chat({ model: "lightning", user: "hi" })).rejects.toThrow(/Token Factory call failed: HTTP 402/);
    for (const c of f.mock.calls) expect(String((c as unknown[])[0])).not.toContain("openrouter.ai");
    expect(f).toHaveBeenCalled();
  });
});

const okBody = (content: string | null, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "gen-test", model: "nvidia/nemotron-3.5-lightning:free", choices: [{ message: { content, reasoning: extra.reasoning ?? "" }, finish_reason: extra.finish ?? "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20, completion_tokens_details: { reasoning_tokens: 5 } } });

describe("OpenRouter dev client", () => {
  beforeEach(() => { vi.stubEnv("NODE_ENV", "test"); process.env.NEMOTRON_PROVIDER = "openrouter"; process.env.OPENROUTER_API_KEY = "test-not-real"; });
  it("floors max_tokens for reasoning models and labels the result provider=openrouter", async () => {
    const f = vi.fn(async () => new Response(okBody('{"a":1}'), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await chat({ model: "lightning", json: true, user: "x", maxTokens: 500, thinking: false });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const sent = JSON.parse(String(init.body));
    expect(sent.max_tokens).toBeGreaterThanOrEqual(1500);
    expect(sent.reasoning).toEqual({ enabled: false });
    await chat({ model: "ultra", json: true, thinking: true, user: "x", maxTokens: 3000 });
    const sent2 = JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(sent2.max_tokens).toBeGreaterThanOrEqual(4000);
    expect(sent2.reasoning).toBeUndefined();
    expect(r).toMatchObject({ provider: "openrouter", host: "openrouter.ai", content: '{"a":1}' });
  });
  it("retries with a bigger budget on null content, then recovers JSON from reasoning if still empty", async () => {
    let n = 0;
    const f = vi.fn(async () => new Response(okBody(n++ === 0 ? null : '{"b":2}', { finish: n === 1 ? "length" : "stop" }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const r = await chat({ model: "ultra", json: true, thinking: true, user: "x" });
    expect(f).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String((f.mock.calls[1] as unknown as [string, RequestInit])[1].body)).max_tokens).toBeGreaterThan(JSON.parse(String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)).max_tokens);
    expect(r.content).toBe('{"b":2}'); expect(r.retries).toBe(1);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(okBody(null, { reasoning: 'thinking... the answer is {"c":3}' }), { status: 200 })));
    const r2 = await chat({ model: "ultra", json: true, thinking: true, user: "x" });
    expect(r2.fromReasoning).toBe(true); expect(r2.content).toBe('{"c":3}');
  });
  it("backs off on 429 and then succeeds", async () => {
    vi.useFakeTimers();
    let n = 0;
    const f = vi.fn(async () => (n++ < 2 ? new Response("{}", { status: 429, headers: { "retry-after": "1" } }) : new Response(okBody("ok"), { status: 200 })));
    vi.stubGlobal("fetch", f);
    const p = chat({ model: "lightning", user: "x" });
    await vi.advanceTimersByTimeAsync(10_000);
    const r = await p;
    vi.useRealTimers();
    expect(f).toHaveBeenCalledTimes(3); expect(r.retries).toBe(2);
  });
  it("the receipt and run label carry provider=openrouter, $0 cost, and the dev label; Nebius is never claimed", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body));
      const content = b.model.includes("ultra")
        ? JSON.stringify({ summary: "s", broker_action: "a", why_this_order: "w", citations: [], headline: "h", priorities: [], broker_questions: [] })
        : JSON.stringify({ entry_number: "A7K63252888", note_signals: [], note_summary: "" });
      return new Response(okBody(content), { status: 200 });
    }));
    const res = await runPipeline(mini, { asOf: meta.asOf, filerCodes: meta.filerCodes, label: "mini", ultraMax: 1 });
    expect(res.receipt).toMatchObject({ provider: "openrouter", devOnly: true, host: "openrouter.ai", mode: "live" });
    expect(res.receipt.providerLabel).toBe(OPENROUTER_LABEL);
    expect(res.receipt.lightning.model).toBe(OPENROUTER_MODELS.lightning);
    expect(res.receipt.ultra.model).toBe(OPENROUTER_MODELS.ultra);
    expect(res.receipt.lightning.costUsd + res.receipt.ultra.costUsd).toBe(0);
    expect(res.label).toContain("not a Nebius Token Factory run");
    expect(JSON.stringify(res.receipt)).not.toMatch(/api\.tokenfactory/);
  });
  it("dev runs are written under .dev-runs only, stamped, and never into data/; .dev-runs is gitignored", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(okBody('{"entry_number":"x","note_signals":[],"note_summary":""}'), { status: 200 })));
    const res = await runPipeline(mini, { asOf: meta.asOf, filerCodes: meta.filerCodes, ultraMax: 0 });
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "devrun-"));
    const file = writeDevRun(res, "t", tmp);
    expect(file.startsWith(path.join(fs.realpathSync(tmp), ".dev-runs")) || file.startsWith(path.join(tmp, ".dev-runs"))).toBe(true);
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    expect(j).toMatchObject({ provider: "openrouter", providerLabel: OPENROUTER_LABEL, devOnly: true });
    expect(fs.readFileSync(".gitignore", "utf8")).toMatch(/^\.dev-runs\/$/m);
    // a Token Factory receipt cannot be written as a dev run
    delete process.env.NEMOTRON_PROVIDER;
    expect(() => writeDevRun(res, "t", tmp)).toThrow(/only for OpenRouter/);
  });
});

describe("no secrets in source", () => {
  it("the provider code never prints or embeds a key", () => {
    for (const f of ["src/lib/provider.ts", "src/lib/nebius.ts", "src/lib/devrun.ts", "scripts/dev-live.ts"]) {
      const t = fs.readFileSync(f, "utf8");
      expect(t).not.toMatch(/sk-or-[A-Za-z0-9]/);
      expect(t).not.toMatch(/console\.(log|error|warn)\([^)]*(OPENROUTER_API_KEY|NEBIUS_API_KEY)/);
    }
  });
});
