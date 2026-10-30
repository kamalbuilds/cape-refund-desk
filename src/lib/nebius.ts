/**
 * Nebius Token Factory client (OpenAI-compatible). Findings from our smoke test are in docs/token-factory-findings.md.
 *  - Both hosts serve both models: global api.tokenfactory.nebius.com/v1 and us-central1 (fallback).
 *  - JSON mode: response_format {type:"json_object"} works on both models.
 *  - Reasoning: Ultra/Lightning return message.reasoning_content; chat_template_kwargs.enable_thinking=false turns it off.
 */
import { OPENROUTER_BASE, OPENROUTER_MODELS, assertOpenrouterAllowed, providerName, type ProviderName } from "./provider";

export const MODELS = {
  ultra: "nvidia/Nemotron-3-Ultra-550b-a55b",
  lightning: "nvidia/Nemotron-3_5-Lightning",
} as const;
export type ModelKey = keyof typeof MODELS;

// $/1M tokens. Nebius list prices observed 2026-10-29 (nebius.com/services/token-factory/models/nvidia-nemotron-models-inference);
// override with NEBIUS_PRICE_* if they change. Cost shown in the UI is an estimate from usage x list price.
export const PRICES: Record<ModelKey, { in: number; out: number }> = {
  ultra: { in: Number(process.env.NEBIUS_PRICE_ULTRA_IN ?? 1.0), out: Number(process.env.NEBIUS_PRICE_ULTRA_OUT ?? 3.0) },
  lightning: { in: Number(process.env.NEBIUS_PRICE_LIGHTNING_IN ?? 0.06), out: Number(process.env.NEBIUS_PRICE_LIGHTNING_OUT ?? 0.24) },
};
const HOSTS = [
  process.env.NEBIUS_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1",
  "https://api.tokenfactory.us-central1.nebius.com/v1",
];

export interface ChatResult {
  id: string;
  model: string;
  content: string;
  reasoning: string;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens: number;
  ms: number;
  host: string;
  provider: ProviderName;
  /** OpenRouter dev fallback only: the answer was recovered from the reasoning text because `content` came back empty. */
  fromReasoning?: boolean;
  /** OpenRouter dev fallback only: how many extra attempts were needed (null content, truncation, 429). */
  retries?: number;
}
export interface ChatOpts {
  model: ModelKey;
  system?: string;
  user: string;
  json?: boolean;
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

/** Account-level failures that will not fix themselves mid-run: out of credit (HTTP 402) or a bad key (401/403). */
export function modelErrorKind(text: string): "credit" | "auth" | null {
  if (/HTTP 402|insufficient_quota|credit_balance_exhausted/i.test(text)) return "credit";
  if (/HTTP 40[13]\b/.test(text)) return "auth";
  return null;
}
export class ModelUnavailableError extends Error {
  constructor(readonly kind: "credit" | "auth", detail: string) { super(detail); this.name = "ModelUnavailableError"; }
}
export function hasKey() { return providerName() === "openrouter" ? !!process.env.OPENROUTER_API_KEY : !!process.env.NEBIUS_API_KEY; }
/** Model id actually used for a role under the active provider (receipts show this). */
export function modelId(k: ModelKey) { return providerName() === "openrouter" ? OPENROUTER_MODELS[k] : MODELS[k]; }
/** Dev fallback prices are $0 (free tier); the receipt must not show an invented Nebius cost for it. */
export function costFor(model: ModelKey, p: number, c: number) { return providerName() === "openrouter" ? 0 : costUsd(model, p, c); }

export async function chat(o: ChatOpts): Promise<ChatResult> {
  if (providerName() === "openrouter") return chatOpenrouter(o);
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");
  const body: Record<string, unknown> = {
    model: MODELS[o.model],
    messages: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: o.user }],
    max_tokens: o.maxTokens ?? (o.thinking ? 3500 : 700),
    temperature: o.temperature ?? (o.thinking ? 0.3 : 0),
  };
  if (o.json) body.response_format = { type: "json_object" };
  if (o.thinking === false) body.chat_template_kwargs = { enable_thinking: false };
  let lastErr = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const host = HOSTS[attempt % HOSTS.length];
    const t0 = Date.now();
    try {
      const r = await fetch(host + "/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 120000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        const m = j.choices?.[0]?.message ?? {};
        return {
          id: j.id ?? "",
          model: j.model ?? MODELS[o.model],
          content: m.content ?? "",
          reasoning: m.reasoning_content ?? m.reasoning ?? "",
          promptTokens: j.usage?.prompt_tokens ?? 0,
          completionTokens: j.usage?.completion_tokens ?? 0,
          reasoningTokens: j.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          ms: Date.now() - t0,
          host: new URL(host).host,
          provider: "tokenfactory",
        };
      }
      lastErr = `HTTP ${r.status} ${JSON.stringify(j).slice(0, 160)}`;
      if (r.status < 429 && r.status !== 408) break; // 4xx other than 408/429: do not retry
    } catch (e) {
      lastErr = String(e).slice(0, 160);
    }
    await new Promise((res) => setTimeout(res, 600 * (attempt + 1)));
  }
  throw new Error(`Token Factory call failed: ${lastErr}`);
}

/** Tolerant JSON extraction (strips code fences / leading prose). */
export function parseJson<T = unknown>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t) as T; } catch { /* fall through */ }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)) as T; } catch { /* ignore */ } }
  return null;
}

export function costUsd(model: ModelKey, promptTokens: number, completionTokens: number) {
  return (promptTokens * PRICES[model].in + completionTokens * PRICES[model].out) / 1e6;
}

/* ---------- DEV-ONLY OpenRouter fallback (free tier). Never runs in production or on Vercel. ---------- */
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
/** Opt-in dev trace (CAPE_DEV_TRACE=1): status, latency and token budget per attempt. Never logs headers, bodies or keys. */
const trace = (m: string) => { if (process.env.CAPE_DEV_TRACE === "1") console.error(`[openrouter-dev] ${m}`); };

async function chatOpenrouter(o: ChatOpts): Promise<ChatResult> {
  assertOpenrouterAllowed();
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  // Reasoning models spend tokens thinking before the answer. Floor the budget so `content` is not null or cut off.
  let maxTokens = Math.max(o.maxTokens ?? 0, o.thinking === false ? 1500 : 4500);
  let retries = 0;
  let lastErr = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const body: Record<string, unknown> = {
      model: OPENROUTER_MODELS[o.model],
      messages: [...(o.system ? [{ role: "system", content: o.system }] : []), { role: "user", content: o.user }],
      max_tokens: maxTokens,
      temperature: o.temperature ?? (o.thinking ? 0.3 : 0),
    };
    if (o.json) body.response_format = { type: "json_object" };
    if (o.thinking === false) body.reasoning = { enabled: false }; // same intent as Token Factory enable_thinking=false; measured 0 reasoning tokens
    const t0 = Date.now();
    try {
      const r = await fetch(OPENROUTER_BASE + "/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "CAPE Refund Desk (dev)" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(o.timeoutMs ?? 120000),
      });
      const j = await r.json().catch(() => ({}));
      trace(`${o.model} attempt ${attempt} HTTP ${r.status} ${Date.now() - t0} ms max_tokens=${maxTokens}${j?.error ? " error=" + String(j.error?.message ?? "").slice(0, 80) : ""}`);
      if (r.ok && !j.error) {
        const ch = j.choices?.[0] ?? {};
        const m = ch.message ?? {};
        const reasoning: string = m.reasoning ?? m.reasoning_content ?? "";
        let content: string = typeof m.content === "string" ? m.content : "";
        const truncated = ch.finish_reason === "length";
        let fromReasoning = false;
        if ((!content.trim() || truncated) && attempt < 5 && maxTokens < 12000) {
          // null/empty/cut-off content: retry once with a bigger budget before touching the reasoning text
          lastErr = `empty-or-truncated content (finish=${ch.finish_reason})`; maxTokens = Math.min(maxTokens * 2, 12000); retries++;
          continue;
        }
        if (!content.trim() && o.json && reasoning) {
          const a = reasoning.lastIndexOf("{"), z = reasoning.lastIndexOf("}");
          const first = reasoning.indexOf("{");
          if (first >= 0 && z > first && parseJson(reasoning.slice(first, z + 1))) { content = reasoning.slice(first, z + 1); fromReasoning = true; }
          else if (a >= 0 && z > a && parseJson(reasoning.slice(a, z + 1))) { content = reasoning.slice(a, z + 1); fromReasoning = true; }
        }
        return {
          id: j.id ?? "", model: j.model ?? OPENROUTER_MODELS[o.model], content, reasoning,
          promptTokens: j.usage?.prompt_tokens ?? 0, completionTokens: j.usage?.completion_tokens ?? 0,
          reasoningTokens: j.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          ms: Date.now() - t0, host: "openrouter.ai", provider: "openrouter", fromReasoning, retries,
        };
      }
      const status = r.ok ? 502 : r.status;
      lastErr = `HTTP ${status} ${JSON.stringify(j).slice(0, 160)}`;
      if (status === 429) {
        // free tier is rate limited: honour Retry-After, else exponential backoff with a little jitter
        const ra = Number(r.headers.get("retry-after"));
        await sleep((Number.isFinite(ra) && ra > 0 ? ra * 1000 : 2000 * 2 ** attempt) + Math.floor(Math.random() * 400));
        retries++; continue;
      }
      if (status < 429 && status !== 408) break;
    } catch (e) { lastErr = String(e).slice(0, 160); trace(`${o.model} attempt ${attempt} threw ${lastErr.slice(0, 80)}`); }
    retries++;
    await sleep(800 * (attempt + 1));
  }
  throw new Error(`OpenRouter (dev fallback) call failed: ${lastErr}`);
}
