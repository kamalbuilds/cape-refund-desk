# Devpost draft: CAPE Refund Desk

Status: draft, not submitted. Track: Best Apps and Agents, Nebius Global AI Hackathon.
Hosted URL: https://cape-refund-desk.vercel.app
Repo: https://github.com/kamalbuilds/cape-refund-desk (MIT)
Demo video: PASTE_VIDEO_URL (script below)

Every number below traces to a file or command listed in "Evidence" at the end.

---

## Project name

CAPE Refund Desk

## Elevator pitch (200 characters max)

US importers are owed tariff refunds, but the one upload can't be undone. This checks the file first: code does the money math, a fast AI cleans data, a reasoning AI explains. 69 sample shipments.

## About the project

### Inspiration

US importers are owed money back for tariffs that were struck down. To get it, they upload one file to US Customs (the portal is called CAPE), and it can't be undone. Customs can't edit the file after it is accepted, shipments can't be removed from it, and corrections and appeals on those shipments are blocked until Customs finalizes them. Big importers have brokers and software for that. A small importer gets one try and a table of cryptic errors such as "Entry Summary is in Final Liquidation Status" and "Entry Type Not Allowed".

One of the traps is easy to reproduce from Customs' own material. A shipment where other duties were underpaid can look like a refund, but when Customs recalculates it, the refund can turn into a bill. Once it is in the file, nobody can take it out.

We built the check that runs before the upload button.

### What it does

You give it a Customs shipment export (or press "Run the sample"). It sorts every shipment into four groups and gives a headline in plain words, for example "30 of 69 shipments shouldn't go in the refund file yet. Here's why."

| Group | Meaning |
|---|---|
| Safe to claim | Customs' checks found nothing wrong. Ready to include |
| Fix first | A correction, an open appeal or an error has to be sorted out first |
| Your broker decides | Claiming could cost you more than it refunds, and it can't be undone |
| Leave out | Customs would reject it (finalized too long ago, duplicate, wrong filer, disallowed import type) |

Click a shipment and the first thing you see is one sentence, such as "Claiming this one would cost you $2,625, not refund you." Then the math (tariff paid, refundable part, other duties that may be billed back, net), then the AI's explanation, then Customs' exact error text in small print, the dates and the products. Exports sit behind a box you tick to confirm the upload can't be undone:

- the refund file in the format Customs publishes (one `Entry Number` column, 11 characters, no dashes, an apostrophe before a leading zero, at most 9,999 shipments and 1 MB per file)
- a note for your broker (.md)
- a deadline list (.csv)

A rule-watch panel reads Customs' live refunds page, compares it with a copy from 2026-07-11, and quotes each change with what it means for these checks.

#### Honest limits

- It does not file anything and never asks for ACE credentials, bank details or an EIN. The broker or importer of record uploads to ACE.
- It is not legal or customs advice. Every screen says "Not legal or customs advice. Have your licensed customs broker review the list before it is uploaded."
- The sample is synthetic: 69 made-up entries shaped like ES-003 + ES-701 with seeded traps. Nobody outside the team has used this, so there are no user claims here.
- The checks mirror CBP's published FAQ, QRG, Trade User Information Notice and CSMS messages (listed in the README). CBP changes these. That is why rule-watch exists, and why the broker has the last word.
- Interest (19 U.S.C. 1505) is added by CBP and is not estimated.
- The hosted "Run live" button calls Token Factory and needs credit on the account. When it has none, the app says so and offers the recorded real run instead of an empty board (see Challenges).

### How we built it

**The engine is code.** A deterministic TypeScript rules engine checks each entry against CBP's published rules and error table, orders the filing steps by CBP's sequencing rules, and computes every amount in integer cents. The models never decide eligibility and never produce a dollar figure.

**Nemotron Lightning (`nvidia/Nemotron-3_5-Lightning`) normalizes.** One call per entry, thinking off (`chat_template_kwargs: {"enable_thinking": false}`), JSON mode. It turns messy columns and free-text broker notes into fields: entry number, dates, amounts, IOR, HTS, flags. Its output is compared field by field to the deterministic parser, and the parser wins any disagreement. In the recorded run that is 609 of 612 fields in agreement, and the 3 disagreements (two entry numbers missing their last digit, one drawback flag) are listed in the receipt.

**Nemotron Ultra (`nvidia/Nemotron-3-Ultra-550b-a55b`) reasons.** Thinking on. It receives the engine's verdict packet for the entries that need judgment (broker-decision, hold and a few blocked) and writes a short explanation, a broker next step and a "why this order", with citations restricted to valid ids. It also writes the portfolio note: the priorities and the questions to ask the importer before upload. The reasoning trace comes back in `reasoning_content` and the drawer shows it.

**Nebius Token Factory** is the inference endpoint for both: the OpenAI-compatible API at `api.tokenfactory.nebius.com/v1`, with the us-central1 host as failover, pools of 10 Lightning and 8 Ultra calls, and retries on 5xx, 408 and 429 only. We probed it first (`scripts/smoke.mjs`, `docs/token-factory-findings.md`). Every run produces a receipt with the model names, call counts, tokens, estimated cost, latency and the completion ids.

**A number guard sits between Ultra and the screen** (`src/lib/numberguard.ts`). Every dollar figure in a model sentence is checked against the engine's cents for that entry and for the label next to it (net, refundable, gross, underpaid, carve-out, bill). Day counts are checked, including direction ("since" versus "left"), and portfolio counts are corrected to the engine's. A figure that does not match is replaced with the engine value or stripped, and the drawer says how many were. Recorded runs are re-guarded when they are served.

**Tavily Extract confirms rule-watch.** The server fetches cbp.gov directly and diffs it, paragraph by paragraph, against the stored July capture. Tavily Extract (`TAVILY_API_KEY`) reads the same live page through an independent path, and the panel reports how many of the changes it also sees: 11 of 11 at the last check. The list is trimmed to the changes that touch a check the tool runs. At the last check that is 4 (warehouse entry types 21/22 rejected, the Phase 1/2 recon-flagged wording, the 80-day liquidation wording, the protest basis under 19 U.S.C. 1514), plus 7 informational. As a third read, `scripts/treg-crosscheck.mjs` pulls both pages through a different extractor offline and also confirmed 11 of 11, with a negative control word that must not match. If the live fetch fails the panel shows the last recorded real check and labels it as recorded.

**Privacy by construction.** "Check in this browser (no upload)" runs the whole deterministic check client-side. Live runs forward the CSV through a stateless route and keep nothing: no database, no accounts.

**Stack.** Next.js 16 (App Router, standalone output), React 19, TypeScript, vitest, Playwright for the browser walkthrough, Vercel for the hosted submission. A Dockerfile and `deploy.sh` for a Nebius Serverless AI endpoint are prepared and not deployed.

### Design

The primary job of the screen is "which entries do I hold before I press upload". So the first thing under the header is the irreversibility warning, then four lane totals (count and dollars each), then the lanes themselves, not a chat box. Status is a labelled chip, never colour alone. Green is only "cleared to file", amber is hold or broker decision, red is do not include. Amounts, entry numbers and CBP error strings are set in a monospace face with tabular numerals. Each card answers "so what": days left in the window, the exact CBP string, the filing step. The drawer puts the model's explanation next to the deterministic money table on purpose, so a reader can see which sentence came from where. The page works at 1440 and at 390 with no horizontal scroll.

### Challenges we ran into

**The model's headline was wrong and a check had to catch it.** In our own recorded run, Ultra's portfolio headline says "File 7 entries expiring today". The engine says 1. The dollar guard could not see it because there is no dollar sign in that sentence. We added a count check that rewrites "N entries expiring today" to the engine's number, and a test that pins this exact recorded sentence. The raw recording is kept as it came back.

**A guard that flags the right things.** Our first dollar regex swallowed the trailing comma in "$2,400," and failed to match the engine's figure. Our first label check treated the bare word "refund" as a label and flagged "netting $6,080 refund" as a mislabel. We removed bare "refund" from the labels, counted "netting" and "netted" as net, and made "refundable $X" on a framework-group entry fail when $X is the gross. Tests run all 22 recorded Ultra explanations through the guard unchanged, then run tampered copies of them and require a flag.

**A seeded trap the model never saw.** The 81-day entry and the Framework EU entry have no Ultra explanation in the recording, because Ultra only explains the entries that need judgment. Rather than claim the guard was tested on them, the tests assert the engine's facts for those entries and feed fabricated model text against them. The underpaid-301 entry has real recorded Ultra text, and that one passes as recorded.

**Credit ran out mid-hackathon.** Token Factory started answering HTTP 402 `credit_balance_exhausted`. The first version of the app showed an empty board. Now a 402, 401 or 403 stops the run after the first wave of calls (a test caps it at 12 API calls), shows what happened in plain words, and offers the recorded real run with its completion ids. We checked it in a browser against a local server that returns 402, and again on the hosted URL.

**cbp.gov is not reachable from everywhere.** The rule-watch needed a second path (Tavily Extract) for hosts that cbp.gov blocks, and the diff had to run the same HTML-to-text path on both sides or every line differs. The July capture comes from the Wayback Machine, and the cross-check script builds that URL from the capture's own timestamp.

**Reasoning tokens are billed.** Thinking is on by default and the trace counts as completion tokens. We turned it off for Lightning and kept it on for Ultra. In the recorded run, 15,139 of Ultra's 17,613 completion tokens are reasoning.

### Accomplishments that we're proud of

- The product never lets a model's number reach the screen unchecked, and there is a test that proves it on real recorded output, including a case where the model was wrong.
- Rule-watch is real: the live page is fetched on the hosted site, diffed against a dated capture, and each change is quoted with an independent extractor agreeing. It is not a mock-up.
- The CAPE CSV is validated against CBP's published file format in code and in a browser test, and cited in the README.
- A run costs about ten cents. The recorded run was $0.0035 for Lightning and $0.0949 for Ultra at list prices.

### Other tools

We are not the only pre-flight. Saxum Systems sells a manual "CAPE Refund Preflight" review, "From $499 per claim population" (saxumsystems.com/products/cape-refund-preflight.html), with a qualified adviser in the loop. Tariffi and Flexport file refunds for a fee or a share. Ours is free and self-serve, gives a per-shipment reason with CBP's own wording, tracks the 80-day and 180-day windows, checks a recovery firm's offer against CBP's fraud warnings, and exports CBP's CAPE template. Sources and caveats: `docs/CAPE-positioning.md`.

### What we learned

- Splitting the job works better than asking one model to do it. Lightning is quick enough to run on every row. Ultra is worth its latency only on the few entries that need an argument.
- "The model never produces a number" is a claim you have to test, because the model will write a plausible number anyway.
- The honest failure screen matters as much as the happy path. A judge will meet the failure state first if credit runs out.

### What's next for CAPE Refund Desk

- Put a broker in front of it. Nobody outside the team has used it yet, and the rules engine needs a licensed broker's review before it is anything more than a pre-flight check.
- Read ACE's own ES-003 export from a report scheduler instead of an upload.
- Deploy the container to Nebius Serverless AI, next to Token Factory.
- Re-record the sample run after the account has credit again.

### Built with

Next.js, React, TypeScript, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3.5 Lightning, Nebius Token Factory, Tavily Extract, Vitest, Playwright, Vercel, Docker

---

## Demo video script (2:45 total, built around the replay)

Use the hosted URL, not localhost. Record at 1440x900. Do not click "Run live" on camera unless the Token Factory account has credit again (see the optional shot).
Voiceover is first person plural, plain, no hype. Times are cumulative.

| # | Time | Shot | On screen | Voiceover |
|---|---|---|---|---|
| 1 | 0:00 to 0:15 | Landing, top of page | Header, the red "Irreversible." banner, the broker-review line | "CBP's CAPE portal refunds IEEPA tariffs from a CSV. Once the declaration is accepted you cannot amend it or remove an entry. Small importers get one attempt. This is the check that runs before they press upload." |
| 2 | 0:15 to 0:30 | Pan to the intro panel | "The models never decide eligibility or touch a dollar figure." and the "synthetic sample" line | "Deterministic code checks each entry against CBP's published rules and computes the money in cents. Nemotron Lightning normalizes the messy columns. Nemotron Ultra explains and ranks. The sample is synthetic. We never ask for ACE credentials or bank details." |
| 3 | 0:30 to 0:45 | Click "Run the sample (recorded real run)" | Progress counter, then the four lane totals | "This replays a real run we recorded on Nebius Token Factory: 69 entries, 69 Lightning calls and 23 Ultra calls. The receipt at the bottom has the completion ids." |
| 4 | 0:45 to 1:15 | Hold on the four lane totals, scroll the board slowly | Lane counts (39 / 13 / 2 / 15) and dollars per lane | "Thirty-nine cleared to file, thirteen to hold, two that need a broker decision, fifteen that ACE would reject. Each card shows the exact CBP error string, days left in the window and the filing step. The urgent one is at the top: zero days left." |
| 5 | 1:15 to 1:55 | Click the broker-decision card A7K-7344990-0 | Drawer: Ultra explanation, then the money table ($10,500 refundable, $13,125 underpaid, -$2,625 net), then the lines and the broker note | "This is the trap. The line shows ten and a half thousand dollars of refundable IEEPA duty, but thirteen thousand of other duties that Customs may bill back wipe it out, so the real net is a $2,625 bill, and the importer has open debt CBP may offset. Ultra explains why this one needs a broker before it goes in. Notice what Ultra did not write: every dollar figure here comes from the engine." |
| 6 | 1:55 to 2:15 | Expand "Ultra's reasoning trace", then close the drawer | The reasoning trace, the guard note under the explanation | "The reasoning trace is the real one. A guard checks every figure and day count in the model's text against the engine. In our own recording Ultra wrote 'file 7 entries expiring today'. The engine says one. The guard corrects it, and there is a test for that sentence." |
| 7 | 2:15 to 2:30 | Scroll to the Export panel, tick the acknowledgement, click the CAPE CSV download | The acknowledgement text, the downloaded filename, the CSV in the OS preview (one `Entry Number` column, apostrophes on leading zeros) | "Export sits behind an acknowledgement that the declaration is irreversible. The CSV follows CBP's published format. Your broker uploads it. We do not." |
| 8 | 2:30 to 2:42 | Scroll to Rule-watch, click "Check CBP now" | "4 changes touch checks this tool runs; 7 more are informational", the warehouse 21/22 change with July and October quotes, the "Tavily agrees" badge | "Rule-watch reads CBP's live page, compares it to a July capture and quotes four changes that touch our checks, such as warehouse entries now being rejected. Tavily Extract reads the page independently and agrees." |
| 9 | 2:42 to 2:45 | Back to the top | Title and URL | "CAPE Refund Desk. A free pre-flight check before an irreversible upload." |

Optional shot, only if the account has credit again, replace the second half of shot 3: click "Run live on Token Factory" and let the Lightning and Ultra progress run for about 15 seconds, then cut to the board. The last full live run took 157 seconds, so do not wait through it on camera.

Recording checklist:

- [ ] Hosted URL loads and shows the board within a few seconds of clicking Run the sample
- [ ] Browser zoom 100 percent, window 1440x900, no bookmarks bar, no personal tabs
- [ ] Captions on, English
- [ ] Final length at or under 2:45, public link, pasted into the Devpost form
- [ ] No API key, token or dashboard visible at any point

---

## Evidence: where each number comes from

| Claim | Where |
|---|---|
| 69 entries; lanes 39 / 13 / 2 / 15 | `data/sample-run.json` (`portfolio.lanes`) re-derived by the engine at serve time (`src/lib/sample-relane.ts`); visible on the board; pinned in `tests/numbers-audit.test.ts` |
| 69 Lightning calls, 1 failed; 23 Ultra calls | `data/sample-run.json` `receipt`, shown in the receipt panel |
| Cost $0.0035 Lightning, $0.0949 Ultra | same, list prices in `docs/token-factory-findings.md` |
| 609 of 612 fields agree; 3 disagreements | `data/sample-run.json` `normalization` |
| 15,139 reasoning tokens of 17,613 | `receipt.ultra` |
| Full recorded run took 157 s | `receipt.wallMs` |
| Net-bill entry: $10,500 refundable, $13,125 underpaid, -$2,625 net | drawer for A7K-7344990-0 and the hero card; `tests/numbers-audit.test.ts` |
| Underpaid-301 entry: $8,000, $5,600, $2,400 (still nets a refund, so Safe to claim with a note) | drawer for A7K-5130944-4; `tests/numberguard.test.ts` |
| "7 entries expiring today" vs 1 | `portfolioNote.headline` in the recording; pinned in `tests/numberguard.test.ts` |
| 4 key changes, 7 informational, 11 of 11 confirmed | `GET /api/rulewatch` on the hosted URL; `data/rulewatch-recorded.json`; `node scripts/treg-crosscheck.mjs` |
| 402 notice | click "Run live on Token Factory" on the hosted URL while the account has no credit; `tests/credit.test.ts` |
| CSV format | `src/lib/export.ts` and `src/lib/validate.ts` cite CBP's QRG; `scripts/e2e.mjs` validates the download |

Reproduce:

```bash
git clone https://github.com/kamalbuilds/cape-refund-desk && cd cape-refund-desk
npm install
npm test                  # engine, number guard and credit-failure tests
npm run build && npm run start   # then open http://localhost:3100/?demo=replay
SKIP_LIVE=1 node scripts/e2e.mjs http://localhost:3100   # browser walkthrough (needs Chrome)
```
