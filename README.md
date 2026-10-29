# CAPE Refund Desk

**The pre-flight check before an irreversible CAPE upload.** Powered by NVIDIA Nemotron on Nebius Token Factory.

> Prepared for licensed customs broker review. **Not legal or customs advice. Verify with your licensed customs broker.**
> Uses realistic sample entries unless you upload your own. Not affiliated with or endorsed by U.S. Customs and Border Protection.

A CAPE (Consolidated Administration and Processing of Entries) declaration cannot be amended once accepted, entries cannot be removed from it, and PSCs and protests on those entries are blocked until liquidation. Large importers have brokers and software for this. The long tail of small importers files by CSV from an ACE ES-003 export and gets one shot. This tool tells an IOR and their broker which entries to hold, which to file now, which are a net-bill risk, and in what order, before anyone presses upload.

It never asks for ACE credentials, bank details or an EIN. It does not file anything: your broker or IOR uploads the CAPE CSV to ACE themselves.

## What it does

1. **Parses an ES-003 export with ES-701 liquidation dates** (messy headers, dashes in entry numbers, stray notes).
2. **Deterministic CBP checks** (`src/lib/validate.ts`, `src/lib/cbp-rules.ts`): the file-level errors (empty/not CSV, over 1 MB, over 10,000 entries, filer code not matching, duplicate entry, not 11 characters, account mismatch), the entry-level errors (drawback, recon already filed, cancelled/rejected, final liquidation, trade control, court injunction, suspension, under review, not an IEEPA HTS, HTS relationship mismatch, and the rest of CBP's table), the 80-day liquidation window, the leading-zero apostrophe rule, framework-agreement carve-outs, underpaid-other-duty netting and IOR debt diversion. Each finding carries the **exact CBP error string** and a link to the CBP source.
3. **Money is deterministic only**, in integer cents. No model ever produces or changes a dollar figure.
4. **Lanes**: `FILE_NOW`, `WAIT` (fix first / PSC first), `NET_BILL_RISK` (broker decision), `BLOCKED` (do not include). Rule: any block gives BLOCKED; any wait gives WAIT; net below zero or underpaid duty gives NET_BILL_RISK; otherwise FILE_NOW.
5. **Filing order**: PSC first, Recon first, then liquidated entries by days left in the window, recon-flagged, drawback-planned, unliquidated, net-bill, hold, blocked. The rules behind the order are quoted from CBP in the UI.
6. **Nemotron**
   - **Lightning** (`nvidia/Nemotron-3_5-Lightning`, thinking off): normalizes every entry's messy columns and broker notes. Output is cross-checked against the deterministic parser on 9 fields per entry; the deterministic value wins and disagreements are shown in the receipt.
   - **Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`, reasoning on): explains and ranks the entries that need judgment and writes the portfolio note. A guard replaces any `$` amount that is not in the deterministic packet; citations are filtered to valid ids.
7. **Export**: CAPE CSV (one column of 11-character entry numbers, apostrophe for leading zeros, split at 9,999 entries per declaration), a broker handoff note (.md) and a deadline CSV. Downloads sit behind an acknowledgement that the declaration is irreversible.
8. **Rule-watch**: diffs CBP's live IEEPA refunds page against a stored snapshot of an archived capture (Internet Archive, 2026-07-11). With `TAVILY_API_KEY` the live side is fetched with Tavily Extract and compared with a Tavily Extract of the same archived capture (same extractor on both sides, page body only); without a key it fetches cbp.gov directly. If neither works it says so and shows the snapshot only. Nothing is simulated.
9. **Receipt**: models, call counts, tokens, estimated cost, latency, normalization agreement and the Token Factory completion ids for the run.

## Privacy

- "Check in this browser (no upload)" runs the whole deterministic check client side; the file never leaves the page.
- Live runs send the CSV to this server, which forwards entry data to Token Factory and keeps nothing (no database, no accounts, no logs of file content).
- Sample data is synthetic: `data/sample-es003.csv`, 67 made-up entries shaped like ES-003 + ES-701 with seeded traps (duplicates, a 10-character entry, wrong filer code, 80/81-day edge, leading zeros, framework-agreement entries, underpaid duty, recon-flagged, drawback, suspension, IOR with debt).

## CBP sources the checks mirror

- FAQ and error tables: https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds
- ACE Portal QRG "CAPE Declarations and Error Definitions", Pub. 5552-0526 (May 2026)
- CAPE Trade User Information Notice, Pub# 1009-1119 (updated July 10, 2026)
- CSMS # 69056483, Update to Entry-Level Validations for CAPE Declarations

URLs are in `src/lib/cbp-rules.ts`, where every CBP error string is copied verbatim. Rules change: use the rule-watch panel and your broker.

## Run it

```bash
npm install
cp .env.example .env.local      # add NEBIUS_API_KEY (and optionally TAVILY_API_KEY)
npm run dev                     # http://localhost:3100
npm test                        # 13 tests on the deterministic engine
npm run precompute              # re-record data/sample-run.json with a real Lightning + Ultra run
npm run smoke                   # probe the Token Factory endpoints
```

`/?demo=replay` auto-plays the recorded real run (no key needed). "Run live" and "Check with Lightning + Ultra" call Token Factory and need `NEBIUS_API_KEY`. A per-instance cap (`LIVE_RUNS_MAX`, default 40) bounds spend.

## Deploy

Next.js standalone output; a `Dockerfile` is included. Set `NEBIUS_API_KEY` (and optionally `TAVILY_API_KEY`) as platform secrets, never in the image or the repo. `data/` is traced into the build. Endpoint findings: `docs/token-factory-findings.md`.

## Layout

```
src/lib/        cbp-rules, parse, validate, money, dates, export, nebius client, pipeline, rulewatch, browser-board
src/app/api/    run (NDJSON stream), sample (recorded run), rulewatch
src/components/ Desk.tsx (the board)
scripts/        gen-sample, precompute, smoke, build-snapshot, build-tavily-snapshot
data/           sample CSV, recorded run, CBP snapshots
tests/          validate.test.ts
```

MIT licensed.
