import { chat, hasKey, modelErrorKind } from "./nebius";
import { OPENROUTER_LABEL, providerName } from "./provider";

export type LiveReason = "ok" | "disabled" | "credit" | "auth" | "error";
export interface LiveHealth { live: boolean; reason: LiveReason; note: string; checkedAt: string }

/** Plain-English note for each reason. Shown next to the disabled "Run it live" button. */
export const LIVE_NOTES: Record<LiveReason, string> = {
  ok: "Live AI is available.",
  disabled: "Live runs are off on this host (no API key). The recorded real run still works.",
  credit: "Live AI is paused: the Nebius Token Factory account is out of credit (HTTP 402). The recorded real run still works.",
  auth: "Live AI is paused: Token Factory rejected the API key. The recorded real run still works.",
  error: "Live AI is not answering right now. The recorded real run still works.",
};

export function classifyProbeError(message: string): LiveReason {
  return modelErrorKind(message) ?? "error";
}

let cache: { at: number; value: LiveHealth } | null = null;
const TTL_MS = 60_000;

/** Cheapest possible real call (1 output token on the small model) so "live" means a call would actually be served. Cached for 60 s. */
export async function probeLive(opts: { force?: boolean; run?: () => Promise<unknown>; keyPresent?: boolean } = {}): Promise<LiveHealth> {
  const now = Date.now();
  if (!opts.force && !opts.run && cache && now - cache.at < TTL_MS) return cache.value;
  const dev = providerName() === "openrouter";
  const mk = (reason: LiveReason): LiveHealth => ({ live: reason === "ok", reason, note: dev ? `${OPENROUTER_LABEL}. ${LIVE_NOTES[reason]}` : LIVE_NOTES[reason], checkedAt: new Date().toISOString() });
  let value: LiveHealth;
  if (!(opts.keyPresent ?? hasKey())) value = mk("disabled");
  else {
    try {
      await (opts.run ? opts.run() : chat({ model: "lightning", user: "Reply with the single word ok.", maxTokens: 1, thinking: false, timeoutMs: dev ? 60000 : 8000 }));
      value = mk("ok");
    } catch (e) { value = mk(classifyProbeError(String(e instanceof Error ? e.message : e))); }
  }
  if (!opts.run) cache = { at: now, value };
  return value;
}
