# CAPE Refund Desk: design direction (v3, "Warm Ink")

Replaces the "achromatic ledger" direction (gray admin table), which read as blunt and unfinished. This pass is visual only. The plain-English copy, the trust lines, every function and every test stay.

Skills used at build time: `design-taste-frontend`, `ui-craft` (incl. `design-from-the-start.md`, `resources-2026-10.md`), `hallmark`, `motion-doctrine`, `kinetic-typography`, `anti-ai-slop-frontend`, `premium-frontend-libraries`.

## 1. Verbs (who, how often, the loop)

An importer or their customs broker opens this once per filing run, under a deadline. The loop: **see what you'd get back, fix the risky ones, send the safe part to the broker.** The page is the place where that happens, not a report about it: the answer sentence first, the money large, the risky lane beside the safe one, one pinned primary action ("Send the safe part to my broker").

## 2. Visual thesis

A warm-ink ledger with serif money numbers, one orchestrated moment (the 69 shipments sort themselves into four lanes), and a refund that flips into a bill.

## 3. References and the steal list (`ref -> thing -> where it lands`)

Opened and read: the six sites from the reel plus Mercury and Ramp (live product pages and design write-ups). grokweb and gemini returned nothing usable; Google AI search returned an empty page.

| Reference | Thing stolen | Where it lands |
|---|---|---|
| motionin.design, Filament | stat tabs that glow in their own colour | the four lane cards: tone-tinted gradient, corner glow on hover/select |
| motionin.design, Benchmark | giant numbers, gradient-clipped | lane counts (56 to 92px serif), footer wordmark fade |
| motionin.design, Revolver / Cardwall | cards that lift and catch light on hover; growing shadow | lane card hover, selected ring + coloured shadow, buttons |
| motionin.design, Cipher | pieces scatter and re-coalesce | the sort: 69 chips arrive in a grid, then fly into their lane cards |
| motionin.design | grain on an overlay blend, reduced-motion fallback per section | `body::before` static SVG noise (5%); reduced-motion collapses every animation |
| landdding.com (Lightspark) | floating tiles with colour glow, hairline stat grid, huge faded footer wordmark | hero twist card glow, bento cards, footer `.wordmark` |
| footer.design | footer as a brand sign-off | disclaimer + sources on top, oversized "CAPE Refund Desk" below |
| 60fps.design (Finance) | counter ticks; a result that resolves, not appears | `CountMoney` / `CountInt` count-ups (rAF, ease-out quart); lane totals; drawer net number |
| Mercury | serif display at hero scale, warm surfaces, calm money type, tabular numerals | Fraunces + tabular figures; colour only for meaning |
| Ramp | bento product proof, one accent, queue thinking | landing bento (plain code / fast AI / reasoning AI), lane cards as queues |
| recent.design, modulify.ai | not read in depth (modulify is a site builder, not a gallery) | nothing taken |
| dprvda/not-vibe-coded, `design-from-the-start.md` | verbs, answer first, number needs unit, ban gray table, waterfall, pinned action | answer sentence under the board headline, table only after a lane click, drawer waterfall, pinned bar |

## 4. Tokens

- Surfaces: ground `#0d0c0a`, surface `#16140f`, raised `#1d1b15`/`#27241c`; text bone `#f3eee2`, muted `#aaa496`, faint `#878171`; hairline `rgba(243,238,226,.1)`. A bone "paper" `#efe8d6` is reserved for the AI analyst cards.
- Lane colours (data only): safe `#9be28f`, fix first `#f4b550`, broker decides `#8db4ff`, leave out `#ff7b68`. Bill red `#ff5a47` is the only colour that means "you pay".
- Type: **Fraunces** (display, `--f-display`, SOFT and opsz axes, roman) for the statement, numbers and card titles; **Geist** for text; **Geist Mono** for entry numbers and micro-labels only. Hero 44 to 92px, lane count 56 to 92px, body 15px/24, micro-labels 11 to 12px with .1em tracking. Money uses `tabular-nums`.
- Radius 20 cards, 12 controls, pills for buttons. Spacing 14 gap, 28 pad.
- Motion: 120/220/420ms UI, 0.8 to 1.1s hero count-ups, ease `cubic-bezier(.16,1,.3,1)`. Transform and opacity only (plus colour on one text node). Chip stagger 14ms per chip and 70ms per lane. Reduced motion: no keyframes, counters show the final value, chips just appear.

## 5. The moments

1. **Hero twist card.** A real sample shipment (A7K-7344990-0): the refund counts up to $10,500.00 (0.8s), the other-duties row slides in, the number rolls to -$2,625.00 and the card glow turns red. The bars animate in sequence. Loops every 9s.
2. **Run the sample (money shot).** 69 chips stream into an intake grid while the fast AI works. When the board lands they fly into the four lane cards, the counts and dollar totals count up, and the headline plus the answer sentence settle. Chips that the reasoning AI has explained get a ring. Click a chip to open its drawer.
3. **Board.** Four bento lane cards (7/5 then 5/7 columns) with a big number, dollars, one plain sentence and the chips. No table until a lane is clicked, then it slides in below and scrolls into view.
4. **Drawer.** Big net number, a three-bar waterfall (refundable tariff, other duties underpaid, net), then the AI analyst as a bone paper card with an "AI analyst" tag. Dates use animated countdown bars.
5. **Footer.** Disclaimer, sources, giant faded wordmark.

## 6. Layers (what is hidden until asked)

At rest: answer, four lane cards, pinned action. On hover: card glow and chip scale. On click: the lane's shipment table, then the drawer. On demand: the AI reasoning trace, the filing-order rules, the receipt.

## 7. Deviations from the research notes

- Palette is dark and warm with an amber hero accent, not paper-white with ink-green: the brief for this pass asked for the crafted, expressive look of the reel galleries, and dark is allowed. Green stays meaning-only ("safe").
- Three families (display serif, sans, mono for ids). The mono is limited to entry numbers and micro-labels.
- No `motion/react` or framer-motion: CSS transitions on transform/opacity plus rAF counters, no new dependency.
- The first screen does not auto-run the sample (the upload field must stay visible); the hero twist card is the zero-click demo of the answer. The answer sentence appears once the check has run.
- Tests, copy and trust lines are unchanged.
