/**
 * Nebius Token Factory client (OpenAI-compatible). Findings from our smoke test are in docs/token-factory-findings.md.
 *  - Both hosts serve both models: global api.tokenfactory.nebius.com/v1 and us-central1 (fallback).
 *  - JSON mode: response_format {type:"json_object"} works on both models.
 *  - Reasoning: Ultra/Lightning return message.reasoning_content; chat_template_kwargs.enable_thinking=false turns it off.
 */
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

export function hasKey() { return !!process.env.NEBIUS_API_KEY; }

export async function chat(o: ChatOpts): Promise<ChatResult> {
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
