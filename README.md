# CAPE Refund Desk

**A free, independent pre-flight check for your IEEPA refund file, run BEFORE you upload it to CAPE, the refund system U.S. Customs and Border Protection (CBP) runs inside ACE.**

This is for small US importers owed refunds on the struck-down IEEPA tariffs. The CAPE upload can't be undone, so one wrong shipment can be rejected or turn a refund into a bill. This tool checks the file first, sorts every shipment into **Safe to claim**, **Fix first**, **Your broker decides** and **Leave out**, and says why in plain English. "CAPE" in the name means CBP's system that your file goes into; this tool is not made by, affiliated with or endorsed by CBP.

**Other pre-flight options exist.** For example, Saxum Systems sells "CAPE Refund Preflight", a manual specialist review listed "From $499 per claim population" ([their page](https://saxumsystems.com/products/cape-refund-preflight.html)). This tool is the free, self-serve option: per-shipment reasons quoting CBP, a deadline tracker, a recovery-offer check and an export in CBP's CAPE template. How we compared, with sources: `docs/CAPE-positioning.md`.

How the AI fits in:

- **Plain code does all the money math** and decides every group. The AI never makes up a number.
- **A fast AI (Nemotron Lightning)** cleans up messy data.
- **A reasoning AI (Nemotron Ultra)** explains each tricky case.

It never asks for logins or bank details, and it files nothing. Your customs broker does the real upload.

> Sample data: made-up shipments, not real trade data. **Not legal or customs advice.** Have your licensed customs broker review the list before it is uploaded. Not affiliated with or endorsed by U.S. Customs and Border Protection (CBP).

| | |
|---|---|
| **Models** | **NVIDIA Nemotron**: `Nemotron-3-Ultra-550b-a55b` reasons, explains and ranks; `Nemotron-3_5-Lightning` normalizes messy rows fast |
| **Inference** | **Nebius Token Factory** (OpenAI-compatible API) |
| **Hosting** | Vercel (submission URL: https://cape-refund-desk.vercel.app). A Nebius Serverless AI container (`./deploy.sh`) is prepared but not deployed |
| **Rule-watch** | Customs' live refunds page vs a July capture, confirmed by Tavily Extract |
| **Money** | Deterministic integer cents only. Models never produce a dollar figure |

Built for the Nebius Global AI Hackathon, Best Apps and Agents track.

### The jargon, once

The program is called **CAPE**. The struck-down tariffs are **IEEPA** tariffs. The customs authority is **CBP**. An **entry** is one shipment's customs filing, **IOR** is the importer of record (the importer), **liquidation** is Customs finalizing a shipment, **PSC** is a post-summary correction, a **protest** is an appeal, and **ACE** is the Customs portal. The app says "shipment", "importer", "finalized by Customs", "correction" and "appeal" instead, and keeps the exact Customs terms only as small print.

## How it works (technical)


1. **Parses an ES-003 export with ES-701 liquidation dates** (messy headers, dashes in entry numbers, stray notes).
2. **Deterministic CBP checks** (`src/lib/validate.ts`, `src/lib/cbp-rules.ts`): the file-level errors (empty/not CSV, over 1 MB, over 10,000 entries, filer code not matching, duplicate entry, not 11 characters, account mismatch), the entry-level errors (drawback, recon already filed, cancelled/rejected, final liquidation, trade control, court injunction, suspension, under review, not an IEEPA HTS, HTS relationship mismatch, and the rest of CBP's table), the 80-day liquidation window, the leading-zero apostrophe rule, framework-agreement carve-outs, underpaid-other-duty netting and IOR debt diversion. Each finding carries the **exact CBP error string** and a link to the CBP source.
3. **Money is deterministic only**, in integer cents. No model ever produces or changes a dollar figure.
4. **Lanes** (shown as Safe to claim, Fix first, Your broker decides, Leave out): `FILE_NOW`, `WAIT` (fix first / PSC first), `NET_BILL_RISK` (broker decision), `BLOCKED` (do not include). Rule: any block gives BLOCKED; any wait gives WAIT; net below zero or underpaid duty gives NET_BILL_RISK; otherwise FILE_NOW.
5. **Filing order**: PSC first, Recon first, then liquidated entries by days left in the window, recon-flagged, drawback-planned, unliquidated, net-bill, hold, blocked. The rules behind the order are quoted from CBP in the UI.
6. **Nemotron**
   - **Lightning** (`nvidia/Nemotron-3_5-Lightning`, thinking off): normalizes every entry's messy columns and broker notes. Output is cross-checked against the deterministic parser on 9 fields per entry; the deterministic value wins and disagreements are shown in the receipt.
   - **Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`, reasoning on): explains and ranks the entries that need judgment and writes the portfolio note. A number guard (`src/lib/numberguard.ts`, tested in `tests/numberguard.test.ts`) checks every dollar figure against the engine's cents for that entry and for its stated label (net, refundable, gross, underpaid, carve-out, bill), checks day counts and their direction, and corrects portfolio counts such as "7 entries expiring today" to the engine's number. Anything that does not match is replaced with the engine figure or stripped, and the drawer says how many were. Recorded runs are re-guarded when served. Citations are filtered to valid ids.
   - **If Token Factory is out of credit or the key is rejected** (HTTP 402/401/403) the run stops after the first wave of calls, shows a plain notice, and offers the recorded real run. It never shows a board that looks complete but has no model output.
7. **Export**: CAPE CSV (one column of 11-character entry numbers, apostrophe for leading zeros, split at 9,999 entries per declaration), a broker handoff note (.md), a broker packet (.md and PDF), a deadline CSV and a deadline calendar (.ics). Downloads sit behind an acknowledgement that the declaration is irreversible.
8. **Rule-watch**: fetches CBP's IEEPA refunds page directly and diffs it, paragraph by paragraph, against a stored capture of the same page from 2026-07-11. Tavily Extract (`TAVILY_API_KEY`) reads the live page independently and the panel reports how many changes it confirms. The list is trimmed to the changes that touch a check this tool runs (4 at the last recording: warehouse entries 21/22 rejected, recon-flagged Phase 1/2 wording, the 80-day liquidation wording, the protest basis); other wording changes are listed as informational. `scripts/treg-crosscheck.mjs` re-reads both the live page and the July capture through treg web extract and marks each quoted change that a third extractor also sees (11 of 11 at the last recording, with a negative control). If the direct fetch fails, Tavily alone is compared against a Tavily capture; if both fail, the last recorded real check is shown and labelled as recorded. Each change is quoted, with a note on whether it touches the engine. Nothing is simulated.
9. **Receipt**: models, call counts, tokens, estimated cost, latency, normalization agreement and the Token Factory completion ids for the run.

## How it meets the four judging criteria

**Technical quality.** Lightning classifies, Ultra writes the rationale and the portfolio memo, and code decides every group and every dollar. Three guards sit between the models and the board: the number guard (every figure the AI writes is re-checked against the engine's cents), the cross-check of Lightning's normalization against the deterministic parser, and a **code veto of the AI's note tags** (`src/lib/signals.ts`). Lightning reads each broker note and tags it (for example "drawback claim"). A tag survives only if the note's own words support it. A tag that contradicts the structured flags is shown as an AI catch, not trusted blindly, and a vetoed tag is listed in the receipt. Replaying the recorded run, the veto drops 26 of 39 recorded tags (all 9 recorded conflicts were false positives), which is why the Lightning prompt was tightened. The run receipt shows models, tokens, cost and latency per stage (`StageReceipt`); recorded values are labelled "recorded". A 1-token credit probe (`/api/run` GET, cached 60 s) hides the live buttons and says why when Token Factory is out of credit. A ~10-entry **mini live run** (`data/sample-mini.csv`) finishes in well under 20 s when credit is available.

**Design.** No dead ends: upload a CSV or load the sample, then board, drawer, and exports (CAPE CSV, broker packet as .md and PDF, deadlines as .csv and .ics). Every download that leaves the page sits behind the "can't be undone" acknowledgement. A wrong file gets a plain error, not an empty board. Excluded shipments say "Not claimable" instead of showing a refund figure. `scripts/e2e.mjs` clicks through all of it at 1440 and 390 px.

**Impact.** The page leads with who it is for (small importers who file once, by hand) and the sample's safe-to-file dollars, computed from the engine. Claims cite the CBP sources (`Sources` panel; `scripts/check-sources.mjs` re-fetches them). The rule-watch panel adds a **re-score**: CBP's real CSMS 69127837 change (warehouse entry types 21/22 rejected) re-runs the engine and shows which shipments move lane, with a dollar diff; a what-if scenario is labelled Simulation. For the Recon-flagged entry, the desk shows both valid paths under "Your broker decides". The suspension rule is flagged as unclear: CBP's FAQ allows suspended entries, the error table rejects "Has Suspension Record", so the tool holds the entry and says so.

**Idea.** A short in-app note (`WhyLlm`) explains why this is not a spreadsheet job: the hard part is free-text broker notes and messy columns, which a formula can't read; the AI reads them, and code refuses anything it can't prove.

### Upload format: a derived schema

The upload columns (`entry_number`, `ieepa_duty`, `entered_value`, `hts_number`, liquidation date, notes and so on) are a **derived schema** modelled on the ES-003 and ES-701 ACE reports. We could not verify the exact column headers of a real ES-003 export from public CBP documents, so the app labels the format as derived and the sample CSV shows the layout it reads. The real CAPE upload (what the tool exports) is a single "Entry Number" column. Check the layout with your broker before relying on an export from your own system.

### Status of live runs

Token Factory credit was exhausted (HTTP 402) when this was written, so the **mini live run and the seeded "AI caught" entries have only been exercised with simulated AI output in tests**, not with a live model. The recorded full run is real.

## Privacy

- "Check in this browser (no upload)" runs the whole deterministic check client side; the file never leaves the page.
- Live runs send the CSV to this server, which forwards entry data to Token Factory and keeps nothing (no database, no accounts, no logs of file content).
- Sample data is synthetic: `data/sample-es003.csv`, 69 made-up entries shaped like ES-003 + ES-701 with seeded traps (duplicates, a 10-character entry, wrong filer code, 80/81-day edge, leading zeros, framework-agreement entries, underpaid duty, recon-flagged, drawback, suspension, IOR with debt, a bonded-warehouse entry type 21 that CBP now rejects, and the warehouse withdrawal type 31 that it accepts).

## What it catches, and what it does not

**Catches 23 of 28 published CAPE rejection causes.** The 28 are counted from CBP's own two tables, "File Validation Errors" and "Entry Validation Errors", on [the IEEPA Duty Refunds page](https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds) (the file table is also in the [ACE quick reference guide](https://www.cbp.gov/sites/default/files/2026-05/ace_portal_-_cape_declarations_and_error_definitions_508c_0.pdf)). "Entry Summary Not Found or Archived in ACE" is in both tables and is counted once. 19 are checked from the ACE report columns, 4 cannot happen with the file this tool writes, and 5 cannot be checked from a report at all. The same line is shown in the app, under the sources. The counts are asserted in `tests/customs.test.ts`.

| CBP's error text | Table | What this tool does | How |
|---|---|---|---|
| CSV content is empty or missing the header | File Validation | ruled out by how the upload file is built | The exported file always starts with the "Entry Number" header row. |
| Not a CSV file | File Validation | ruled out by how the upload file is built | Exports are written as .csv files. |
| The file size exceeds 1mb. Please split the data into smaller files before reuploading | File Validation | ruled out by how the upload file is built | File size is measured and the list is split before it can pass 1 MB. |
| The file is deemed unsafe. Please correct the file data before reuploading | File Validation | **not checkable from this file** | ACE scans the upload itself and says nothing about what trips it. |
| The file exceeds the maximum 10,000 allowed entry numbers per file | File Validation | ruled out by how the upload file is built | Lists are split at 9,999 entries per file (the FAQ limit; the error table says 10,000, so the lower number is used). |
| Filer Code not matching | File Validation | checked from your ACE report | Compares the first 3 characters with the filer codes you give. |
| Duplicate Entry | File Validation | checked from your ACE report | Strips dashes, then flags repeats. |
| Not 11 characters long | File Validation | checked from your ACE report | Counts characters after dashes are removed. |
| Account Mismatch | File Validation | **not checkable from this file** | needs the importer behind your ACE account. The filer-code check is the closest thing. |
| Entry Summary Not Found or Archived in ACE | Both tables | checked from your ACE report | Flags entries whose summary status is Not Found. |
| Entry on Drawback | Entry Validation | checked from your ACE report | Drawback-claim column. |
| Recon Already Filed for Entry Summary | Entry Validation | checked from your ACE report | Recon flag with a Type 09 on file. |
| Entry Summary is Cancelled/Rejected | Entry Validation | checked from your ACE report | Summary status other than Accepted. |
| Entry Summary is in Final Liquidation Status | Entry Validation | checked from your ACE report | Liquidation date more than 80 days before the as-of date. |
| Entry Summary is in Trade Control | Entry Validation | checked from your ACE report | Control status other than CBP. |
| Entry Summary is Subject to Court Injunction | Entry Validation | checked from your ACE report | Injunction flag. |
| Entry Summary Pending Liquidation or Not Liquidated and Has Suspension Record | Entry Validation | checked from your ACE report | Pending or not-liquidated status together with a suspension record. |
| Entry Summary Under Review | Entry Validation | checked from your ACE report | Adjusted-status flag. |
| Entry Type Not Allowed | Entry Validation | checked from your ACE report | Entry types 08, 09, 23, 47, plus warehouse 21 and 22 (CSMS 69127837). |
| Value Not Allowed on HTS | Entry Validation | checked from your ACE report | Goods value above $0.00 on a chapter 99 line. |
| No IEEPA HTS on Entry | Entry Validation | checked from your ACE report | No line with IEEPA duty. |
| Protest on Entry | Entry Validation | checked from your ACE report | Open or Suspended protest, or Denied with the AFR box checked. |
| Statement Processing Not Complete | Entry Validation | checked from your ACE report | Statement-pending flag. |
| Invalid HTS | Entry Validation | checked from your ACE report | Line action date outside the HTS begin/end dates. |
| HTS Relationship Mismatch | Entry Validation | checked from your ACE report | Add/replace/derived HTS without its pair. |
| Unable to Calculate Duty-'X' Duty Comp Code | Entry Validation | **not checkable from this file** | needs ACE's duty computation codes per line. |
| Unexpected Error-try Again | Entry Validation | **not checkable from this file** | it is a system error, not a property of the entry. |
| SPI or Additional HTS Required | Entry Validation | **not checkable from this file** | the report has no special-program-indicator column. |

Things people often assume CBP checks that are **not** in either error table, so they are not counted and not claimed: direct-deposit (ACH) setup, anti-dumping/countervailing duty flags, and a protest-form lane.

**Refund phase and remedy lock-outs.** Each shipment carries a plain-words Phase 1, 2 or 3 chip. Phases 1 and 2 are CBP's wording from the refunds page. Phase 3 (finally liquidated entries, only for importers who sued at the Court of International Trade and hold a reliquidation order) is *not* on that page; it comes from CBP's sworn declaration to the court (Lord, 15 Sep 2026, para. 8) and a law-firm alert, and the app labels it that way. Today the engine still blocks entries liquidated more than 80 days ago, as CBP's page says; the chip tells a plaintiff importer that a separate court-ordered route exists. Lock-out warnings follow CBP's FAQ answer that PSCs and protests cannot be filed on entries after they are on a CAPE declaration, and its drawback guidance.

## CBP sources the checks mirror

- FAQ and error tables: https://www.cbp.gov/trade/programs-administration/trade-remedies/ieepa-duty-refunds
- ACE Portal QRG "CAPE Declarations and Error Definitions", Pub. 5552-0526 (May 2026)
- CAPE Trade User Information Notice, Pub# 1009-1119 (updated July 10, 2026)
- CSMS # 69056483, Update to Entry-Level Validations for CAPE Declarations
- CSMS # 69127837, CAPE for IEEPA Refunds - Warehouse Entries (07/02/2026): entry types 21/22 are rejected since 2026-07-07

URLs are in `src/lib/cbp-rules.ts`, where every CBP error string is copied verbatim. Rules change: use the rule-watch panel and your broker.

## Run it

```bash
npm install
cp .env.example .env.local      # add NEBIUS_API_KEY (and optionally TAVILY_API_KEY)
npm run dev                     # http://localhost:3100
npm test                        # 55 tests: engine, number guard, exports, .ics, re-scoring, code veto, live probe
SKIP_LIVE=1 node scripts/e2e.mjs [BASE_URL]   # browser end-to-end at 1440 and 390 px
node scripts/check-sources.mjs  # re-fetch the cited CBP pages
npm run precompute              # re-record data/sample-run.json with a real Lightning + Ultra run
npm run smoke                   # probe the Token Factory endpoints
```

`/?demo=replay` auto-plays the recorded real run (no key needed). "Run live" and "Check with Lightning + Ultra" call Token Factory and need `NEBIUS_API_KEY`. A per-instance cap (`LIVE_RUNS_MAX`, default 40) bounds spend.

## Deploy

Next.js standalone output in a Docker image (linux/amd64, port 8080, non-root, no secrets inside). The container path targets **Nebius Serverless AI** next to Token Factory (prepared, not deployed; the submission runs on Vercel): `./deploy.sh` pushes to Nebius Container Registry and creates a public CPU endpoint (`cpu-d3`, `4vcpu-16gb`). `NEBIUS_API_KEY` and `TAVILY_API_KEY` are passed to the endpoint at create time (or via MysteryBox secrets), never baked in. Exact steps for Nebius Serverless, Vercel, Railway, Fly, Render and Hugging Face Spaces are in [`docs/DEPLOY.md`](docs/DEPLOY.md). Endpoint findings: `docs/token-factory-findings.md`.

## Layout

```
src/lib/        cbp-rules, parse, validate, money, dates, export, nebius client, pipeline, rulewatch, browser-board
src/app/api/    run (NDJSON stream), sample (recorded run), rulewatch, health
src/components/ Desk.tsx (the board)
scripts/        gen-sample, precompute, smoke, build-snapshot, build-tavily-snapshot
data/           sample CSV, recorded run, CBP snapshots
tests/          validate.test.ts
```

MIT licensed.
