/**
 * Hook for an AI explanation of an offer. Cached or recorded path ONLY: this module never calls a model.
 * To add one, record a real model output offline and paste it into RECORDED_EXPLANATIONS keyed by the example id or by
 * textKey(text). With no recorded entry the UI renders nothing at all (no placeholder, no invented text).
 */
export interface RecordedExplanation { text: string; model: string; recordedAt: string }

export const RECORDED_EXPLANATIONS: Record<string, RecordedExplanation> = {};

/** FNV-1a over the whitespace-normalised, lower-cased text. Stable across runs. */
export function textKey(text: string): string {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return "h" + h.toString(16).padStart(8, "0");
}

export function recordedExplanationFor(idOrText: { exampleId?: string; text?: string }, store: Record<string, RecordedExplanation> = RECORDED_EXPLANATIONS): RecordedExplanation | null {
  if (idOrText.exampleId && store[idOrText.exampleId]) return store[idOrText.exampleId];
  if (idOrText.text) return store[textKey(idOrText.text)] ?? null;
  return null;
}
