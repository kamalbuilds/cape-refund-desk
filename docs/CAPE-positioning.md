# CAPE Refund Desk: positioning

**One line:** CAPE Refund Desk checks a small importer's IEEPA refund file before it goes into CBP's CAPE system, so nothing irreversible goes in wrong.

## Name

CAPE is CBP's own refund system in ACE. CAPE Refund Desk is an independent pre-flight checker for files headed into that system. It is not made by, affiliated with or endorsed by CBP.

## Competitors

Checked 2026-10-30 against each source listed. Rivals are described from their own pages.

**Line:** Tariffi takes a percentage, Flexport offers paid filing and Saxum sells a manual pre-flight review from $499. CAPE Refund Desk is a free, self-serve pre-flight: it tells you per shipment what to leave out and why, with CBP's own wording, before an upload nobody can undo. It is one of several pre-flight options, not the only one.

- **RefundRadar** (github.com/amekinya/refundradar; Apache-2.0, 0 stars, last push 2026-10-28; live at refundradar-f9ul.onrender.com). Another entry in this hackathon, also on Nemotron, Token Factory and Tavily. It routes entries and flags deadlines, reads Form 7501 photos with Nemotron 3.5 Super VL, checks refund offers against CBP's fraud warning, and compares the cost to recover across self-filing, brokers and contingency firms. Its README reports a 49-entry routing eval: rules engine 100%, Nemotron 3 Ultra alone 86%. It says it does not file with CBP. Its README does not state pricing, so "free" and "takes no cut" are unverified. Difference: RefundRadar is a wide self-check before you hire help. We go deep on the one file going into CAPE, entry by entry, with CBP's exact error strings and a CAPE CSV export.
- **un-tariff** (un-tariff.com/pricing). Unverified: the site returned "402 Payment required, DEPLOYMENT_DISABLED" on 2026-10-30, so we make no claims about its features or pricing.
- **Tariffi** (tariffi.io). ES-003 upload, ACH enrolment and CAPE data prep; a partner CBP-licensed broker files. No upfront fee; contingency tiers of 10%, 15% and 18%. (The tier-by-entry-age split was not stated on the page we read.) Difference: we don't file or take a share; we check the file and hand judgment to your own broker.
- **Flexport** (tariffs.flexport.com/refunds). A free refund calculator from an ES-003 upload or a 7-column ACE custom report; paid full-service filing by its brokerage, and an offer to buy your refund claim. Difference: Flexport estimates the amount and sells the filing. We check eligibility and errors per entry before anyone files.
- **Saxum CAPE Refund Preflight** (saxumsystems.com/products/cape-refund-preflight.html; page says "Reviewed 12 August 2026"; read 2026-10-30). The closest in concept, and it already sells under the name "pre-flight". What its page says: "Manual specialist service", "From $499 per claim population", "Final scope and price depend on record volume, source quality and unresolved exceptions", "Service status: manual pilot", and that it "does not have a complete executable product engine". It reconciles the claimed population to source records, surfaces errors and documents every transformation. Listed deliverables: population completeness check, duplicate and identifier exception register, format and field validation report, source-to-output traceability table, "Corrected draft where deterministic", broker/counsel review checklist. It also describes a "Deadline calendar" that surfaces customer-supplied filing and review dates "without inventing protest, liquidation or eligibility deadlines", and says it cannot file the claim or determine legal eligibility. It has people in the loop (a qualified adviser), an audit trail and a signed handoff packet; we have none of those. Where we differ, on facts you can check: ours is free and self-serve (you load a file and get the board without a scoping call or a quote); each shipment gets a plain reason with CBP's exact error text and a link to the CBP source; the deadline tracker computes the CAPE (80 days after liquidation) and Form 19 protest (180 days) windows per shipment and exports an .ics; the offer check reads a recovery firm's offer against CBP's published fraud warnings; and we export CBP's CAPE upload template (Entry Number header, batched at 9,999 entries). The Saxum page does not mention a scam-offer check or per-shipment CBP citations, but we have not seen what its reports contain, so we make no claim about them.
- **GitHub long tail.** A GitHub search for "IEEPA refund" returned 14 repos, all with 0 stars, mostly calculators, landing pages and briefings. We did not audit each one, so we don't claim none has an entry-level rules engine. One to watch: vhb13/dutyback ("AI agents that sort small importers' IEEPA tariff refunds by route").

## Why it is built this way

The CAPE upload cannot be edited or taken back. So the tool sits in front of it as a check, shows its reasons, and leaves judgment calls (net bills, protests, recon, drawback overlap) to a licensed broker.


Links: demo https://cape-refund-desk.vercel.app | repo https://github.com/kamalbuilds/cape-refund-desk | Track: Best Apps and Agents

## 1. Problem

US importers are owed money back for tariffs that were struck down. They claim it by uploading one file to US Customs (CBP's CAPE refund system in ACE). The upload cannot be undone. Customs cannot edit it or take shipments out, and a wrong shipment can turn a refund into a bill. Example in the sample: an entry shows $8,000 of refundable duty, but a $5,600 underpayment on other duties can be recalculated, so the real net is $2,400. A small importer gets one try and a table of cryptic errors.

## 2. Solution and how it works

A pre-flight check that runs before the upload button.

1. Parse the shipment export (messy headers, dashes, stray notes).
2. Plain TypeScript checks each shipment against Customs' published rules and error table, and sorts it into Safe to claim, Fix first, Your broker decides or Leave out. All money is integer cents. Code decides every group and every dollar.
3. Nemotron 3.5 Lightning on Nebius Token Factory normalizes each row and tags broker notes. Its output is cross-checked against the parser on 9 fields per entry. The parser wins any disagreement.
4. Nemotron 3 Ultra on Token Factory explains and ranks the entries that need judgment, and writes the portfolio note.
5. A number guard re-checks every dollar figure and day count in Ultra's text against the engine. Wrong figures are replaced or stripped.

## 3. Features (all in the repo)

- Four-lane board with a one-sentence reason per shipment and the exact CBP error string.
- Filing order by CBP sequencing rules, with days left in the 80-day window.
- Exports behind an "irreversible" acknowledgement: CAPE CSV, broker packet (.md and PDF), deadline CSV and .ics.
- Rule-watch: diffs Customs' live refunds page against a 2026-07-11 capture. Tavily Extract confirmed 11 of 11 changes at the last recording.
- Re-score of CBP's CSMS 69127837 change, with a dollar diff per shipment.
- Run receipt: models, calls, tokens, cost, latency, completion ids.
- Honest failure mode: on HTTP 402/401/403 the run stops and offers the recorded real run. 55 tests.

## 4. Users and buyer

Users: owners of small importers who file once, and the customs brokers who upload for them.

Story: a small importer sends a 69-line export to the broker. The desk shows 36 safe, 13 to fix, 5 for the broker, 15 to leave out. The $8,000 entry goes to the broker with the reason written out.

Buyer wedge: the customs broker or trade-compliance firm that handles many small importers and carries the risk if a bad file goes in. Pricing per file reviewed or per seat is our hypothesis, not tested. [needs source] for refund volume or market size. Nobody outside the team has used it yet.

## 5. Why it scores

- Technological Implementation: two Nemotron models on Token Factory, each with a job. Code is the authority and guards sit between model and screen.
- Design: upload, board, drawer, exports, failure state, all at 1440 and 390 px.
- Potential Impact: a specific, one-shot, irreversible filing, shown solved on 69 shipments.
- Quality of Idea: the AI is only trusted where code can check it. The hard part is free-text notes, which a formula cannot read.

---

## README section (paste)

```markdown
## Why CAPE Refund Desk

US importers are owed tariff refunds, but the one upload to US Customs cannot be undone. This tool checks the file first and sorts every shipment into **Safe to claim**, **Fix first**, **Your broker decides** or **Leave out**.

- Code decides every group and every dollar (integer cents).
- **Nemotron 3.5 Lightning** (Nebius Token Factory) cleans messy rows. The parser wins any disagreement.
- **Nemotron 3 Ultra** (Nebius Token Factory) explains the tricky cases. A number guard checks every figure it writes.

Buyer: customs brokers and compliance firms that file for small importers. Sample data is synthetic. Not legal or customs advice.
```

## Devpost description (paste)

**Inspiration.** Importers are owed refunds for struck-down tariffs, but the one upload to Customs cannot be edited or undone. A shipment where other duties were underpaid can look like a refund and turn into a bill. We built the check before the upload.

**What it does.** Load a shipment export or the 69-shipment synthetic sample. Every shipment lands in one of four groups: Safe to claim, Fix first, Your broker decides, Leave out. Each has a plain reason, the exact Customs error text and a filing step. Exports sit behind an irreversible acknowledgement. Rule-watch quotes changes on Customs' live page.

**How we built it.** A TypeScript rules engine does eligibility and all money in integer cents. Nemotron 3.5 Lightning on Nebius Token Factory normalizes rows (609 of 612 fields agreed with the parser). Nemotron 3 Ultra explains and ranks the hard entries. A number guard checks every figure in Ultra's text.

**Challenges.** Ultra's headline said "File 7 entries expiring today". The engine said 1. We added a count check and a test on that sentence. Token Factory credit ran out mid-hackathon (HTTP 402), so the app now stops, says so and offers the recorded real run.

**Accomplishments.** No model number reaches the screen unchecked, and a test proves it on real output. The recorded run cost $0.0035 for Lightning and $0.0949 for Ultra at list prices.

**What we learned.** Lightning fits every row. Ultra is worth its latency only on the few entries that need an argument.

**What's next.** Put a licensed broker in front of it. Read ES-003 exports directly. Deploy to Nebius Serverless AI. Re-record after credit returns.

**Built with.** Next.js, React, TypeScript, NVIDIA Nemotron 3 Ultra, NVIDIA Nemotron 3.5 Lightning, Nebius Token Factory, Tavily Extract, Vitest, Playwright, Vercel, Docker
