/**
 * Headline numbers for the bundled synthetic sample (data/sample-run.json), computed by the deterministic engine as of 2026-10-29.
 * tests/features.test.ts re-derives them from the data, so these cannot drift. The sample is made-up data, not a real importer.
 */
export const SAMPLE_STATS = {
  entries: 69,
  safeCount: 39,
  safeRefundCents: 46749084,
  holdCount: 13,
  holdRefundCents: 17637200,
  billRiskCount: 2,
  billRiskBillCents: 562500,
  blockedCount: 15,
  blockedRefundCents: 16966900,
} as const;
