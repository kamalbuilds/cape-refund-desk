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

/**
 * The hero card's example shipment (A7K-7344990-0 in the sample). tests/numbers-audit.test.ts checks these against the engine's
 * verdict for that entry, so the card cannot show a figure the app does not compute.
 */
export const HERO_TWIST = { entryNumber: "A7K-7344990-0", refundCents: 1050000, underpaidCents: 1312500 } as const;
