# Devpost submission: CAPE Refund Desk

Hackathon: Nebius Global AI Hackathon (nebiusglobalaihackathon.devpost.com)
Submitted by: kamalbuilds
Track: Best Apps and Agents Track (name checked on the hackathon page, 2026-10-30)

Paste each field below into the matching Devpost box. The Evidence list at the very end is for us and is not pasted.

---

## Project name

CAPE Refund Desk

## Elevator pitch (200 characters max)

US importers get one irreversible upload to claim tariff refunds. We check every shipment first: what's safe, what to fix, and which "refund" CBP turns into a bill.

## Try it out links

- https://cape-refund-desk.vercel.app
- https://cape-refund-desk.vercel.app/?demo=replay (plays a recorded Token Factory run, no key needed)
- https://github.com/kamalbuilds/cape-refund-desk (MIT)

## Video demo link

Paste the public YouTube URL here (under 3 minutes). The narration script is in docs/DEVPOST.md.

---

## About the project

### Inspiration

The IEEPA tariffs were struck down, and US Customs (CBP) now pays the money back through a portal called CAPE. The importer, or their broker, uploads one CSV of entry numbers. Once CBP accepts it, nobody can edit it or pull a shipment back out, and corrections and protests on those shipments lock until CBP is done with them. CBP's own FAQ has a question titled "Can my CAPE Declaration result in a bill?" The answer is yes.

Getting that file right is already a paid service. Saxum Systems sells a manual "CAPE Refund Preflight" review from $499 per claim population, and Tariffi takes a 10 to 18% contingency to prepare the data and have a partner broker file. An importer who wants to check the file themselves gets CBP's error table, full of lines like "Entry Summary is in Final Liquidation Status".

Five terms make the rest of this page readable:

- **ACE**: CBP's online portal for importers and brokers. CAPE lives inside it.
- **ES-003**: the entry-summary report you export from ACE, one row per shipment line.
- **Liquidated**: CBP has made its final duty calculation on a shipment. CAPE only takes shipments liquidated 80 days ago or less.
- **PSC**: a post-summary correction, the filing that fixes an entry before liquidation.
- **CSMS**: CBP's bulletins announcing rule changes.

We built a 69-shipment test file seeded with traps from CBP's two error tables: an entry liquidated 81 days ago, a 10-character entry number, a wrong filer code, a leading zero, a bonded-warehouse entry type 21, a duplicate, other duties underpaid. One of them made the problem concrete: $10,500 of refundable tariff, $13,125 of other duties underpaid on the same entry. It looks like a refund. Put it in the file and CBP can net it into a $2,625 bill, with no way to take it back out. CAPE Refund Desk is the check that runs before the upload button.

### What it does

The importer exports ES-003 from ACE, or the 7-column custom report Flexport asks for, and drops it in (or presses "Run the sample"). Every shipment lands in one of four groups, under a plain headline: "30 of 69 shipments shouldn't go in the refund file yet. Here's why."

- **Safe to claim**: passes CBP's published checks and nets to a refund.
- **Fix first**: a correction, open protest or status issue has to clear before it can go.
- **Your broker decides**: other duties CBP may recalculate wipe out the refund, so claiming could cost more than it pays.
- **Leave out**: CBP would reject it (liquidated more than 80 days ago, duplicate, wrong filer, disallowed entry type).

Click a shipment and the first line is one sentence, such as "Claiming this one would cost you $2,625, not refund you." Under it: the money table in integer cents, Nemotron Ultra's explanation with its reasoning trace, CBP's exact error string, the days left in the window and the refund phase. The export is CBP's own CAPE template (one Entry Number column, 11 characters, an apostrophe before a leading zero, split at 9,999 entries and 1 MB), behind a box you tick to confirm the upload can't be undone. A broker note, a deadline CSV and a calendar file come with it.

After the board, the page answers what an importer weighs next:

- **Cost to recover.** On the test file's 39 safe shipments ($467,490.84), filing yourself keeps all of it; CBP's FAQ says "CBP does not charge any fees for processing tariff refunds." Tariffi's lowest published tier (10%) would take $46,749.08, and a broker at the top of the 10 to 25% range quoted by third parties would take $116,872.71. Every price shows its source, the date we read it and whether the vendor's own page confirmed it.
- **Recovery-offer check.** Paste a refund firm's email or contract. Plain code in your browser flags requests for your ACE password, a refund routed to the firm's account, upfront fees, fee floors and lock-in terms, each next to the CBP fraud notice it maps to. Nothing is uploaded and no model sees it.
- **Rule-watch.** The server reads CBP's live refunds page, diffs it paragraph by paragraph against a July 2026 capture, and quotes each change that touches a check we run. When CBP started rejecting warehouse entry types 21 and 22 (CSMS 69127837), the panel re-scores the board and shows which shipments move.

Tariffi and Flexport file for you and take a cut or a fee, Saxum reviews the file by hand, and RefundRadar, another entry in this hackathon, surveys deadlines and costs and reads Form 7501 photos. We decide, shipment by shipment, what stays out of the one file, and catch the refund that becomes a $2,625 bill.

**Why code decides and the model explains.** We sorted the same 69 shipments three ways, all on Nebius Token Factory on 2026-10-30, and scored each against hand labels:

| Who sorts the shipments | Right group (of 69) | Exact days left (of 13 liquidated) | Cost for all 69 |
|---|---|---|---|
| Our rules engine | 69 | 13 | $0 |
| Nemotron Ultra alone | 69 | 13 | $0.47 |
| Nemotron Lightning alone | 49 | 4 | under $0.01 |

Lightning alone got 20 shipments wrong, and 18 of those misses put a shipment into "Safe to claim" that CBP would reject or that needed a fix first. It marked the shipment liquidated 81 days ago, one day past CBP's window, as "Safe to claim, 80 days left." Uploaded, those 18 can't be pulled back.

Ultra matched the engine on every group, at $0.0068 and a median of 6.0 seconds per shipment, where the engine is free and instant. And Ultra's counts drift. Its portfolio note on 2026-10-29 said "File 7 entries expiring today" when the engine counted 1. On 2026-10-30 it said "File 7 shipments now" when the safe group held 39. So the engine sorts every shipment and computes every dollar, Lightning tidies the messy rows, and Ultra writes the explanations, with code checking the figures it writes. The full live run on the test file is 92 calls, 29.5 seconds and about $0.12, with no failed calls.

The labels live in `data/sample-truth.json`. They were written from the raw CSV columns and CBP's published rules without calling or reading the engine's code, each with a one-line reason. Where CBP's text allows a second group, the label says so; strict scoring ignores that and lenient scoring accepts it.

### How we built it

**A deterministic rules engine in TypeScript** checks every entry against CBP's published FAQ, error tables, Trade User Information Notice and CSMS messages, orders the filing steps by CBP's sequencing rules, and does all money in integer cents. It covers 23 of the 28 rejection causes in CBP's two published error tables: 19 checked from the ACE report columns and 4 made impossible by how we write the export file. Every CBP error string in the app is copied verbatim into `src/lib/cbp-rules.ts`.

**Two input formats.** The parser reads ES-003 with ES-701 liquidation dates, and Flexport's 7-column custom ACE report, where each row is one tariff ordinal. Ordinals roll up into their line: the primary HTS carries goods value and general duty, and chapter 99 headings map to IEEPA (9903.01, 9903.02), Section 301, Section 232 and Section 201 duty.

**Nemotron 3.5 Lightning** (`nvidia/Nemotron-3_5-Lightning`), thinking off, JSON mode, makes one call per shipment. It turns messy columns and broker notes into fields and tags. We compare its output field by field against our parser, and the parser wins any disagreement: 618 of 621 fields agreed on the recorded run, and the three that didn't (entry numbers with a digit dropped or added) are listed in `data/sample-run.json` under `normalization.disagreements`. A code veto drops any note tag the note's own words don't support. On a ten-shipment run with three planted note conflicts, it caught all three and removed four tags Lightning had made up.

**Nemotron 3 Ultra** (`nvidia/Nemotron-3-Ultra-550b-a55b`), thinking on, gets the engine's verdict packet for the shipments that need judgment and writes the explanation, the broker's next step and a portfolio note. Its reasoning trace comes back in `reasoning_content`, and the drawer shows it.

**A number guard** sits between Ultra and the screen. Every dollar figure in a model sentence is checked against the engine's cents for that entry and for the label beside it (net, refundable, gross, underpaid, carve-out, bill). Day counts are checked with their direction ("since" versus "left"). In the portfolio note, counts of shipments expiring today, shipments to file now, corrections first and reconciliations first are rewritten to the engine's lanes, which is why the live board reads "File 39 shipments now". A figure that doesn't match is replaced or stripped, and the drawer says how many were.

**Rule-watch** fetches cbp.gov directly and has Tavily Extract read the same page through an independent path; at the last check Tavily confirmed 11 of 11 changes, and a third extractor in `scripts/treg-crosscheck.mjs` agreed on all 11 with a negative control.

**Design.** The screen's job is "which shipments do I hold before upload", so the irreversibility warning comes first, then four lane totals with counts and dollars, then the lanes. There's no chat box. Status is a labelled chip and never colour alone; amounts, entry numbers and CBP strings are monospaced with tabular figures. The drawer puts the model's words beside the engine's money table so a reader can see which sentence came from where. It works at 1440 and 390 px, and "Check in this browser" runs the whole deterministic check client-side so the file never leaves the page. Live runs keep nothing: no database, no accounts.

Next.js 16, React 19, TypeScript, Tailwind, Vitest (249 tests across 18 files) and a Playwright-driven browser walkthrough at both widths. Hosted on Vercel.

### Challenges we ran into

**Ultra's headline counts were wrong twice, and the dollar guard couldn't see either.** The first recording said "File 7 entries expiring today"; the engine counted 1. The second said "File 7 shipments now"; the safe group held 39. Neither sentence has a dollar sign, so the dollar check passed both. The count guard now maps each phrasing to an engine lane, and tests pin both sentences from the recordings.

**Reasoning ate the answer.** On one mini run, Ultra spent its whole token budget thinking about the portfolio note and returned empty content. Ultra calls now retry once at double the budget, and the receipt of the empty run stays in the repo.

**Credit ran out mid-hackathon.** Token Factory began answering HTTP 402 `credit_balance_exhausted`, and our first version showed an empty board. Now a 402, 401 or 403 stops the run after the first wave of calls, explains what happened in plain words and offers the recorded run with its completion ids. A 1-token probe hides the live buttons before anyone clicks into the failure.

**CBP's page reads differently depending on who fetches it.** The diff had to run the same HTML-to-text path on both the live page and the Wayback capture, or every line differed. cbp.gov also isn't reachable from every host, so Tavily Extract gives the panel a second, independent read of the same page.

### Accomplishments that we're proud of

- The hero shipment's $10,500, $13,125 and $2,625 on the landing card are read from the engine, and a test fails if anyone types them into the component by hand.
- Every CBP error string in the app is CBP's own wording, character for character, so the reason on the board matches the rejection ACE would give.
- A Flexport custom ACE report loads with no column mapping, and the engine sorts it like an ES-003 export.
- The recovery-offer check finds a refund routed to a firm's own bank account without sending a word of the contract anywhere.
- When Ultra gets a count wrong, the live board shows the engine's count: today it reads "File 39 shipments now" where the recording said 7.

### What we learned

Split the work by the cost of being wrong. Lightning is fast and cheap enough to run on every row and fine for tidying data; it isn't fine for deciding what goes into an irreversible file. Ultra reasons well enough to match the engine on this file, which makes it the right writer for the explanation a broker reads, as long as code checks the figures it writes.

"The model never produces a number" is a claim you have to test, because the model writes plausible counts anyway, and they slip past a check that only looks for dollar signs. Reasoning tokens are billed too: on the recorded run, 20,124 of Ultra's 23,174 completion tokens were reasoning, which is why thinking stays off for Lightning.

### What's next for CAPE Refund Desk

- A second file of 20 shipments, labelled by a licensed customs broker working from CBP's rules alone, scored the same three ways.
- Review sessions with licensed customs brokers on real client files, starting with boutique brokerages that file for many small importers.
- A broker workspace: one board per client importer, with the broker packet exported per client.
- Ultra-written explanations in the recovery-offer check, recorded and guarded the same way as the board.
- The prepared container running on Nebius Serverless AI, next to Token Factory.

---

## Built with

Next.js, React, TypeScript, Tailwind CSS, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3.5 Lightning, Nebius Token Factory, Tavily Extract, Vitest, Playwright, Vercel, Docker

## How we used Nebius (platform and models)

Nebius Token Factory is the only inference provider in production, through its OpenAI-compatible API at `api.tokenfactory.nebius.com/v1`, with the us-central1 host as failover. We run two NVIDIA models there:

- `nvidia/Nemotron-3_5-Lightning`, thinking off (`chat_template_kwargs: {"enable_thinking": false}`), JSON mode, one call per shipment to normalize messy ACE columns and broker notes.
- `nvidia/Nemotron-3-Ultra-550b-a55b`, thinking on, for the explanations, the broker's next step and the portfolio note, with the trace read from `reasoning_content`.

The recorded live run on 69 shipments made 92 calls (69 Lightning, 23 Ultra) in 29.5 seconds with no failures, about $0.12 at list price. We also ran both models alone as classifiers on all 69 shipments (138 calls, no failures) to measure what each one can be trusted with. Every run writes a receipt with the model ids the API returned, tokens, latency and completion ids, committed under `docs/receipts/`.

## Feedback on the tools

- The OpenAI-compatible endpoint was a drop-in: same client, same JSON mode, and both `json_object` and `json_schema` returned valid JSON on both models in our probe.
- `chat_template_kwargs: {"enable_thinking": false}` is the most useful switch we found. It took Lightning to zero reasoning tokens and made it fast enough to run on every row. It deserves a line on the model card.
- Reasoning tokens are billed as completion tokens and share `max_tokens` with the answer. On one Ultra call the trace used the whole budget and the content came back empty. A separate reasoning budget, or a distinct finish reason for "ran out while thinking", would save people a debugging session.
- `reasoning_effort` low and high were accepted but changed nothing we could see in token counts on our probe.
- When credit ran out we got HTTP 402 `credit_balance_exhausted`, which is clear. A balance endpoint would let apps hide live features ahead of time; today we spend a 1-token call to find out.
- The us-central1 host worked as a failover with no code change beyond the base URL.

---

## Evidence (for us, not pasted)

- `src/lib/cbp-rules.ts`, `src/lib/offercheck.ts` (CBP_CITES "can-be-bill"): CAPE irreversibility, CBP FAQ "Can my CAPE Declaration result in a bill?", verbatim CBP error strings.
- `docs/CAPE-positioning.md`: Saxum "From $499 per claim population" and "Manual specialist service"; Tariffi 10/15/18% contingency, partner broker files; Flexport calculator and paid filing, 7-column custom report; RefundRadar same event, Form 7501 photos, deadlines and cost compare. un-tariff omitted: no first-party page read.
- `README.md` Privacy section, `scripts/gen-sample.mjs`: 69 synthetic shipments with seeded traps (duplicates, 10-character entry, wrong filer code, 80/81-day edge, leading zeros, underpaid duty, warehouse type 21).
- `src/lib/sample-stats.ts` (HERO_TWIST), `tests/numbers-audit.test.ts`: A7K-7344990-0 at $10,500 refundable, $13,125 underpaid, -$2,625 net; hero card reads engine figures, no hard-coded copy; lanes 39 / 13 / 2 / 15; "30 of 69" headline.
- `docs/research/flexport-7col.md`, `src/lib/parse.ts` (fromFlexport), `tests/flexport-import.test.ts`: Flexport 7 required columns, ordinal rollup, chapter 99 mapping; mutation (IEEPA mapping broken) turns 2 tests red.
- `docs/receipts/model-arms-2026-10-30.json`: engine 69/69 and 13/13 at $0; Ultra 69/69 and 13/13 at $0.466295 ($0.0068 per shipment = 0.466295 / 69); Lightning 49/69 and 4/13 at $0.008714; 138 calls, 0 failed; 18 of 20 Lightning misses into FILE_NOW; A7K21937388 at 81 days scored FILE_NOW with 80 days left; Ultra per-call median 6,032 ms.
- `data/sample-truth.json` (method field): labelled from raw CSV columns and CBP rules, did not call, read or copy validate.ts; one-line reason each; alsoDefensible strict vs lenient.
- `tests/fixtures/sample-run.2026-10-29.json`: Ultra headline "File 7 entries expiring today"; engine count 1 (`tests/numberguard.test.ts`).
- `data/sample-run.json` (portfolioNote.headline): "File 7 shipments now..."; engine FILE_NOW 39. `src/lib/numberguard.ts` guardCounts, `tests/numberguard.test.ts` pins "File 39 shipments now"; mutation (fileNow fix removed) turns 2 tests red. Live check 2026-10-30 15:33 UTC: `curl -s https://cape-refund-desk.vercel.app/api/sample` headline "File 39 shipments now; 4 need a correction first, 1 needs reconciliation first; don't upload those 5 blindly. ...", 0 em dashes in the response.
- `data/sample-run.json` (normalization): 618 of 621 agree, 3 entry_number disagreements listed.
- `docs/receipts/tokenfactory-full.json`: 92 calls (69 + 23), 0 failed, wall 29.5 s, estCostUsd 0.12, Ultra 20,124 reasoning of 23,174 completion tokens, model ids returned by the API.
- `docs/receipts/tokenfactory-mini.json`: 3 of 3 seeded conflicts caught, 4 fabricated tags removed by the code veto.
- `docs/receipts/tokenfactory-mini-run1-memo-cut-off.json`, `src/lib/nebius.ts:182`: empty memo after reasoning used the budget; retry at double budget.
- `src/lib/cost-to-recover.ts`, `tests/cost-to-recover.test.ts`: CBP "no fees" quote; safe total 46,749,084 cents; Tariffi 10% fee 4,674,908 cents; broker 25% fee 11,687,271 cents.
- `src/lib/offercheck.ts`, `tests/offercheck-rules.test.ts`: red-flag rules (credentials, payee-firm, upfront, minimum-fee, lock-in), client-side, no model.
- `data/rulewatch-recorded.json`, `scripts/treg-crosscheck.mjs`, `src/lib/rescore.ts`: July 2026 capture, 11 of 11 confirmed by Tavily and treg; CSMS 69127837 re-score.
- `tests/customs.test.ts`, README "What it catches: 23 of 28 CBP rejection causes": 19 checked, 4 ruled out by the export.
- `src/lib/export.ts`, `src/lib/cape-template.ts`, `scripts/e2e.mjs`: CAPE template rules (Entry Number header, 11 characters, apostrophe, 9,999 entries, 1 MB).
- `tests/credit.test.ts`, `src/lib/health.ts:33`: 402/401/403 handling, 1-token probe.
- `docs/token-factory-findings.md`, `docs/smoke-raw.json`: endpoints, JSON modes, enable_thinking switch, reasoning_effort no visible change, us-central1 failover.
- `npx vitest run` on commit 8abbe11 (2026-10-30): 18 files, 249 tests passed.
- `package.json`: Next 16, React 19, Tailwind 4, Vitest, playwright-core.
- Track name: nebiusglobalaihackathon.devpost.com, fetched 2026-10-30 ("Best Apps and Agents Track").
