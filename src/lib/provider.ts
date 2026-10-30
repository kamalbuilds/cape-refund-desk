/**
 * Model-provider switch. DEFAULT is Nebius Token Factory and is unchanged.
 *
 * NEMOTRON_PROVIDER=openrouter is a DEV-ONLY fallback (free-tier Nemotron on OpenRouter) for exercising the live paths
 * while Token Factory credit is out. It is refused on Vercel and in NODE_ENV=production (unless CAPE_DEV_LOCAL=1 on a
 * non-Vercel machine, for a local `next start`). When refused, the switch is ignored and Token Factory behaviour
 * (including the honest 402 "live paused" state) is exactly as before.
 * Anything the fallback produces is labelled provider=openrouter and must never be used as a Nebius run or in the submission.
 */
export type ProviderName = "tokenfactory" | "openrouter";
export const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_MODELS = {
  ultra: "nvidia/nemotron-3-ultra-550b-a55b:free",
  lightning: "nvidia/nemotron-3.5-lightning:free",
} as const;
export const OPENROUTER_LABEL = "Dev run via OpenRouter (free tier), not a Nebius Token Factory run";
/** Dev outputs go here (gitignored). Never data/ or any committed sample/receipt. */
export const DEV_RUNS_DIR = ".dev-runs";

type Env = Record<string, string | undefined>;

export interface Resolved { provider: ProviderName; requested: string; refused: boolean; reason?: string }

/** True only on a local, non-Vercel machine that is not running a production build (or has opted in with CAPE_DEV_LOCAL=1). */
export function openrouterAllowed(env: Env = process.env): { ok: boolean; reason?: string } {
  if (env.VERCEL || env.VERCEL_ENV || env.VERCEL_URL) return { ok: false, reason: "OpenRouter dev fallback is refused on Vercel." };
  if (env.NODE_ENV === "production" && env.CAPE_DEV_LOCAL !== "1") return { ok: false, reason: "OpenRouter dev fallback is refused when NODE_ENV=production." };
  return { ok: true };
}

export function resolveProvider(env: Env = process.env): Resolved {
  const requested = (env.NEMOTRON_PROVIDER ?? "tokenfactory").trim().toLowerCase() || "tokenfactory";
  if (requested !== "openrouter") return { provider: "tokenfactory", requested, refused: false };
  const a = openrouterAllowed(env);
  if (!a.ok) return { provider: "tokenfactory", requested, refused: true, reason: a.reason };
  return { provider: "openrouter", requested, refused: false };
}
export const providerName = (env: Env = process.env): ProviderName => resolveProvider(env).provider;
export const isDevFallback = (env: Env = process.env) => providerName(env) === "openrouter";

/** Throws unless the OpenRouter path is allowed. Called at the top of the OpenRouter request code as a second guard. */
export function assertOpenrouterAllowed(env: Env = process.env) {
  const a = openrouterAllowed(env);
  if (!a.ok) throw new Error(a.reason);
}

/** Stamp added to every run result and receipt produced by a non-default provider. */
export function providerStamp(p: ProviderName = providerName()) {
  return p === "openrouter"
    ? { provider: "openrouter" as const, providerLabel: OPENROUTER_LABEL, devOnly: true as const }
    : { provider: "tokenfactory" as const };
}
