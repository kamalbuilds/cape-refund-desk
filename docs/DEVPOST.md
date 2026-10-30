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

**Nemotron Lightning (`nvidia/Nemotron-3_5-Lightning`) normalizes.** One call per entry, thinking off (`chat_template_kwargs: {"enable_thinking": false}`), JSON mode. It turns messy columns and free-text broker notes into fields: entry number, dates, amounts, IOR, HTS, flags. Its output is compared field by field to the deterministic parser, and the parser wins any disagreement. In the recorded run that is 618 of 621 fields in agreement, and the 3 disagreements (all entry numbers with a digit added or dropped) are listed in the receipt.

**Nemotron Ultra (`nvidia/Nemotron-3-Ultra-550b-a55b`) reasons.** Thinking on. It receives the engine's verdict packet for the entries that need judgment (broker-decision, hold and a few blocked) and writes a short explanation, a broker next step and a "why this order", with citations restricted to valid ids. It also writes the portfolio note: the priorities and the questions to ask the importer before upload. The reasoning trace comes back in `reasoning_content` and the drawer shows it.

**Nebius Token Factory** is the inference endpoint for both: the OpenAI-compatible API at `api.tokenfactory.nebius.com/v1`, with the us-central1 host as failover, pools of 10 Lightning and 8 Ultra calls, and retries on 5xx, 408 and 429 only. We probed it first (`scripts/smoke.mjs`, `docs/token-factory-findings.md`). Every run produces a receipt with the model names, call counts, tokens, estimated cost, latency and the completion ids.

**A number guard sits between Ultra and the screen** (`src/lib/numberguard.ts`). Every dollar figure in a model sentence is checked against the engine's cents for that entry and for the label next to it (net, refundable, gross, underpaid, carve-out, bill). Day counts are checked, including direction ("since" versus "left"), and portfolio counts are corrected to the engine's. A figure that does not match is replaced with the engine value or stripped, and the drawer says how many were. Recorded runs are re-guarded when they are served.

**Tavily Extract confirms rule-watch.** The server fetches cbp.gov directly and diffs it, paragraph by paragraph, against the stored July capture. Tavily Extract (`TAVILY_API_KEY`) reads the same live page through an independent path, and the panel reports how many of the changes it also sees: 11 of 11 at the last check. The list is trimmed to the changes that touch a check the tool runs. At the last check that is 4 (warehouse entry types 21/22 rejected, the Phase 1/2 recon-flagged wording, the 80-day liquidation wording, the protest basis under 19 U.S.C. 1514), plus 7 informational. As a third read, `scripts/treg-crosscheck.mjs` pulls both pages through a different extractor offline and also confirmed 11 of 11, with a negative control word that must not match. If the live fetch fails the panel shows the last recorded real check and labels it as recorded.

**Privacy by construction.** "Check in this browser (no upload)" runs the whole deterministic check client-side. Live runs forward the CSV through a stateless route and keep nothing: no database, no accounts.

**Stack.** Next.js 16 (App Router, standalone output), React 19, TypeScript, vitest, Playwright for the browser walkthrough, Vercel for the hosted submission. A Dockerfile and `deploy.sh` for a Nebius Serverless AI endpoint are prepared and not deployed.

### Design

The primary job of the screen is "which entries do I hold before I press upload". So the first thing under the header is the irreversibility warning, then four lane totals (count and dollars each), then the lanes themselves, not a chat box. Status is a labelled chip, never colour alone. Green is only "cleared to file", amber is hold or broker decision, red is do not include. Amounts, entry numbers and CBP error strings are set in a monospace face with tabular numerals. Each card answers "so what": days left in the window, the exact CBP string, the filing step. The drawer puts the model's explanation next to the deterministic money table on purpose, so a reader can see which sentence came from where. The page works at 1440 and at 390 with no horizontal scroll.

### Challenges we ran into

**The model's headline was wrong and a check had to catch it.** In our first recorded run (an earlier Token Factory recording, kept at `tests/fixtures/sample-run.2026-10-29.json`), Ultra's portfolio headline said "File 7 entries expiring today". The engine says 1. The dollar guard could not see it because there is no dollar sign in that sentence. We added a count check that rewrites "N entries expiring today" to the engine's number, and a test that pins that sentence. The current recording (2026-10-30) did not repeat that sentence, so the count guard changed nothing in it. It has a softer fault the guard does not catch: its headline says "File 7 shipments now", which counts the top candidates Ultra was shown, not the 39 shipments in the file-now group. We left the raw model output as it came back and say so here.

**A guard that flags the right things.** Our first dollar regex swallowed the trailing comma in "$2,400," and failed to match the engine's figure. Our first label check treated the bare word "refund" as a label and flagged "netting $6,080 refund" as a mislabel. We removed bare "refund" from the labels, counted "netting" and "netted" as net, and made "refundable $X" on a framework-group entry fail when $X is the gross. Tests run all 22 recorded Ultra explanations through the guard unchanged (the number guard stripped nothing from this recording), then run tampered copies of them and require a flag.

**A seeded trap the model never saw.** The 81-day entry, the Framework EU entry and the underpaid-301 entry have no Ultra explanation in the 2026-10-30 recording, because Ultra only explains the entries that need judgment (and caps the file-now group). Rather than claim the guard was tested on them, the tests assert the engine's facts for those entries and feed fabricated model text against them. The net-bill entry has real recorded Ultra text, and that one passes as recorded.

**Credit ran out mid-hackathon.** Token Factory started answering HTTP 402 `credit_balance_exhausted`. The first version of the app showed an empty board. Now a 402, 401 or 403 stops the run after the first wave of calls (a test caps it at 12 API calls), shows what happened in plain words, and offers the recorded real run with its completion ids. We checked it in a browser against a local server that returns 402, and again on the hosted URL.

**cbp.gov is not reachable from everywhere.** The rule-watch needed a second path (Tavily Extract) for hosts that cbp.gov blocks, and the diff had to run the same HTML-to-text path on both sides or every line differs. The July capture comes from the Wayback Machine, and the cross-check script builds that URL from the capture's own timestamp.

**Reasoning tokens are billed.** Thinking is on by default and the trace counts as completion tokens. We turned it off for Lightning and kept it on for Ultra. In the recorded run, 20,124 of Ultra's 23,174 completion tokens are reasoning.

### Accomplishments that we're proud of

- The product never lets a model's number reach the screen unchecked, and there is a test that proves it on real recorded output, including a case where the model was wrong.
- Rule-watch is real: the live page is fetched on the hosted site, diffed against a dated capture, and each change is quoted with an independent extractor agreeing. It is not a mock-up.
- The CAPE CSV is validated against CBP's published file format in code and in a browser test, and cited in the README.
- A run costs about ten cents. The recorded run (2026-10-30) was $0.0046 for Lightning and $0.1154 for Ultra at list prices, 92 calls in 29.5 seconds, none failed.

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
- Run the AI-alone arm of the scored test now that the account has credit (it is still marked pending).

### Built with

Next.js, React, TypeScript, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3.5 Lightning, Nebius Token Factory, Tavily Extract, Vitest, Playwright, Vercel, Docker

---

## Demo video script (2:45 total, narrated in the author's own voice)

Rendered by `scripts/video/` (README there). B03 is a live run of the hosted site against Nebius Token Factory, time-mapped onto the narration, and the second half of B06 is a live ten-shipment run. Every other beat replays the recorded real run of 2026-10-30. Each cut-in card quotes a committed file.

| # | Time | Shot | On screen | Voiceover |
|---|---|---|---|---|
| 1 | 0:00 to 0:25 | Landing page, then the example card | The card 'You'd owe Customs -$2,625.00' (refundable tariff $10,500, other duties underpaid -$13,125), then the 'Can't be undone' banner | "Maya, a tiny importer, is owed tariff refunds. But one shipment in her file would leave her owing Customs twenty-six hundred twenty-five. Cape Refund Desk checks that file before the upload nobody can undo. Her customs broker uploads it to Customs' portal, CAPE, and once it's accepted, nothing comes back out." |
| 2 | 0:25 to 0:34 | Header, then How the check works | Plain code, Nemotron Lightning and Nemotron Ultra rows; 'Nemotron AI models on Nebius Token Factory' | "Plain code does every dollar. Nemotron models, on Nebius Token Factory, tidy the messy data and explain." |
| 3 | 0:34 to 0:59 | Click 'Run it live' (real calls, sped up) | A live timer, the Lightning and Ultra progress bars, then the four groups, Lane counts (39 / 13 / 2 / 15), and this run's receipt (92 calls, none failed) | "Maya runs her sixty-nine shipments live. The fast model, Lightning, tidies every row. The thinking model, Ultra, reads the hard ones. Four groups. Thirty-nine ready to file, thirteen to fix first, two for her broker, fifteen Customs would reject. Ninety-two calls, none failed, in under a minute." |
| 4 | 0:59 to 1:11 | Recorded run: open a 'Leave out' shipment | Customs' exact error 'Entry Summary is in Final Liquidation Status' and 'Liquidated 130 days ago' | "Open one Customs would reject, and you get its exact error. Customs finalized it a hundred thirty days ago, and claims close after eighty." |
| 5 | 1:11 to 1:34 | Open the broker-decision shipment A7K-7344990-0 | Tariff paid $10,500, other duties underpaid -$13,125, net -$2,625; Ultra's explanation and its reasoning trace | "Now the shipment from the start. She paid ten and a half thousand dollars in tariff on it. But she underpaid over thirteen thousand in other duties, so claiming it may cost her twenty-six hundred twenty-five. Ultra explains why her broker decides first, and shows its reasoning." |
| 6 | 1:34 to 1:54 | Number-guard card, then a live ten-shipment run | 'File 7 entries expiring today' against the engine's 1; three rows flagged 'AI caught a note that disagrees'; the mini receipt (3 of 3 caught, 4 made-up tags removed) | "AI slips. One model wrote that seven entries expire today. The code counted one, and a check corrected it. In a ten-shipment test with three deliberately wrong notes, it caught all three, and code threw out four tags the AI invented." |
| 7 | 1:54 to 2:09 | Export panel | '39 shipments selected', the acknowledgement box, the CAPE CSV with its Entry Number rows, the note that the -$2,625 shipment is not in the file | "She confirms it can't be undone, and exports the thirty-nine ready shipments in Customs' own format. The two that could cost her stay out. Her broker uploads it. We never ask for a login." |
| 8 | 2:09 to 2:23 | Rule-watch, click 'Check Customs' page now' | Live cbp.gov page versus the July copy, '4 changes affect this tool's checks', the 'Tavily agrees' badge | "Customs changes its rules, so the desk compares its live refund page with our July copy. Four changes touch these checks, and Tavily, a second reader, confirms them." |
| 9 | 2:23 to 2:35 | Receipt, then Scored test | '~$0.120 at list price, wall 29.5 s' and 'Rules engine 100.0% (69 of 69)' | "Every run leaves a receipt, about twelve cents. Against answers we labelled by hand, the rules engine scores sixty-nine of sixty-nine." |
| 10 | 2:35 to 2:45 | End card | Title, URL and repository | "Cape Refund Desk checks the file before the upload nobody can undo. It's live, open source, and built for broker review." |

Recording checklist:

- [ ] Public YouTube link under 3 minutes, pasted into the Devpost form
- [ ] Captions burned in (they are in the file) and an .srt next to the video
- [ ] No API key, token or dashboard visible at any point

---

## Evidence: where each number comes from

| Claim | Where |
|---|---|
| 69 entries; lanes 39 / 13 / 2 / 15 | `data/sample-run.json` (`portfolio.lanes`) re-derived by the engine at serve time (`src/lib/sample-relane.ts`); visible on the board; pinned in `tests/numbers-audit.test.ts` |
| 69 Lightning calls, 0 failed; 23 Ultra calls, 0 failed; 92 calls, median 2.2 s, p95 5.3 s | `data/sample-run.json` `receipt`, shown in the receipt panel; per-call latency in `docs/receipts/tokenfactory-full.json` |
| Cost $0.0046 Lightning, $0.1154 Ultra (about $0.12 per run) | same, list prices in `docs/token-factory-findings.md` |
| 618 of 621 fields agree; 3 disagreements | `data/sample-run.json` `normalization` |
| 20,124 reasoning tokens of 23,174 | `receipt.ultra` |
| Full recorded run took 29.5 s (wall clock) | `receipt.wallMs`, `docs/receipts/tokenfactory-full.json` |
| Seeded-conflict check on `data/sample-mini.csv` (3 planted note conflicts): 3 of 3 caught, 4 fabricated tags removed, 17.6 s, 0 failed calls | `docs/receipts/tokenfactory-mini.json` (`auditor.seededConflicts`). The first attempt, `tokenfactory-mini-run1-memo-cut-off.json`, lost the portfolio memo when Ultra's reasoning used the whole token budget; Ultra calls now retry once at double the budget, and the receipt of that failed attempt is kept |
| Net-bill entry: $10,500 refundable, $13,125 underpaid, -$2,625 net | drawer for A7K-7344990-0 and the hero card; `tests/numbers-audit.test.ts` |
| Underpaid-301 entry: $8,000, $5,600, $2,400 (still nets a refund, so Safe to claim with a note) | drawer for A7K-5130944-4; `tests/numberguard.test.ts` |
| "7 entries expiring today" vs 1 | the earlier recording, `tests/fixtures/sample-run.2026-10-29.json`; pinned in `tests/numberguard.test.ts`. Not repeated in the current recording |
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
