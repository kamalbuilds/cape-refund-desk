# CAPE Refund Desk: DESIGN.md (premium light fintech, redesign6)

Reference set: Mercury (restraint, light weights, hairline cards, one action pill), Wise (the one number that answers the question, honest cost breakdown), Stripe (zinc neutrals, tabular numerals, calm tables), Ramp (work-queue first, status as a short plain word), Copilot Money and Monarch (quiet cards, big figure, nothing else competing), TurboTax (a plain-English answer before the detail). Source files: VoltAgent/awesome-design-md (mercury, wise, stripe). This file adapts Mercury's restraint to a LIGHT app. The logic, copy meaning and trust wording do not change.

## 0. Atmosphere

A private bank that happens to be software. Quiet, exact, slightly sparse. Hierarchy comes from size and space, not from weight, boxes or color. A first-time visitor must read, in this order: what this is, the one number, the one button. Everything else is on demand.

## 1. Hard rules (owner's standing rules, never break)

1. Neutrals are zinc only. Never gray, slate, stone or neutral.
2. One restrained accent for interaction and selection: zinc-900 ink. Color is otherwise semantic only: emerald-700 = money you keep, red-700 = money you would owe, amber = the irreversible warning. No other hue anywhere. The "broker decides" lane is neutral zinc, not blue.
3. IDs, entry numbers, dates, durations and every money figure use font-mono with tabular-nums.
4. Buttons: exactly one primary (solid zinc-900 pill), then secondary (white, zinc-300 border), then tertiary (text only). Never two primaries in a group, never three equal buttons.
5. The irreversible warning is a bordered, high-contrast amber alert (amber-50 fill, amber-300 border, amber-950 text, 1px, rounded-xl, AlertTriangle icon). Body copy in the alert is sans, never mono.
6. At most 3 type sizes on a viewport: Display 48/52 (hero number and the page headline only; 32/36 under 640px), Body 16/24 (all text, buttons, table cells), Small 13/20 (labels, meta, chips, table headers). Weights 400 and 500 only. Display is 500 with -0.02em tracking.
7. No fade-in or reveal animation, no eyebrows, no bento grids, no tinted icon tiles, no gradients, no glass, no blur, no purple, no shadows beyond 0 1px 2px rgb(0 0 0 / .04), no emoji, no em dashes. Lucide icons only, 16px, stroke 1.5.
8. Allowed motion: the chip flight, count-ups, drawer slide, and a 150ms color/border transition. Respect prefers-reduced-motion.

## 2. Tokens

| Token | Value |
|---|---|
| page | zinc-50 `#fafafa` |
| surface | `#ffffff` |
| hairline | zinc-200 `#e4e4e7` |
| ink | zinc-900 `#18181b` |
| body | zinc-600 `#52525b` (7.7:1 on white) |
| muted | zinc-500 `#71717a` (4.8:1 on white, Small only) |
| keep | emerald-700 `#047857` |
| owe | red-700 `#b91c1c` |
| warning | amber-50 `#fffbeb`, amber-300 `#fcd34d`, text amber-950 `#451a03` |
| radius | cards 16, controls 10, buttons 9999 (pill), chips 6 |
| space | 4pt base: 8, 16, 24, 32, 48, 80. Card padding 24 (32 on the hero card). Section gap 80 desktop, 48 mobile |
| container | 1120px max, 24px side padding (16 under 640) |
| fonts | Geist (text), Geist Mono (data) |

## 3. Layout

Page order, top to bottom: slim header (wordmark left, one quiet status line right, 64px, hairline under it), the amber alert (full container width, one block), hero, board, then details.

Hero: two columns at 1024 and up. Left: headline (Display), one 16px sentence, primary pill "Run the sample" beside secondary pill "Run it live", one Small line of sample-data disclosure. Right: one white card with the story shipment: Small label "You'd owe Customs", the number in Display red-700 mono, then a 3-row breakdown table (refundable tariff, other duties underpaid, net) with right-aligned mono figures and a $0 baseline bar. No decorative chips.

Board (after a run): the key answer first. One sentence headline ("33 of 69 shipments should wait. Here's why."), then ONE hero figure card: "Safe to claim" with the safe refund total in Display emerald-700 mono, shipment count and a single primary pill "Add safe shipments to the refund file". Then the four lanes as one even 2x2 (4 up at 1280+) set of equal white cards, each: dot + plain label, count (Display only if needed, else Body 500 mono), dollars in mono, one Small line. No chip grid inside cards; the 69-chip flight is the only place chips appear, and they settle into a single quiet row of dots, uniform size, in the lane color. Selected lane: 1px ink border, no ring.

Lane panel: a table with sticky Small headers in zinc-500, 48px rows, hairline row dividers, no vertical lines, right-aligned mono money, status as a plain word with a 6px dot (never a pill with fill). Row click opens the drawer.

Drawer (480px, white, flat scrim): order is fixed. 1) Shipment ID (mono) and plain status word. 2) The answer sentence ("Claiming this would cost you $2,625.00, not refund you."). 3) The net figure in Display with a breakdown table: Struck-down tariff you paid, Other duties underpaid, You'd owe Customs, with the net row last and heavier. The waterfall bars follow the table, thin (6px), under the numbers they illustrate. 4) Next step and the AI's reasoning, collapsed behind a "Why" disclosure (tertiary button) by default. 5) Footer with the one primary action, sticky.

Details (refund file, filing order, importers, compliance status, receipt): below the board, each as a flat section with a Body 500 title and hairline top rule, not boxed cards, max 2 columns, collapsible where long. Compliance Status keeps its zinc-50 card and "Live CBP Check" badge.

Footer: Small text, two columns, disclosures kept verbatim. No giant wordmark.

## 4. Components

- Primary: `h-10 px-5 rounded-full bg-zinc-900 text-white text-base font-medium hover:bg-zinc-800`. Secondary: same size, `bg-white border border-zinc-300`. Tertiary: `text-zinc-600 hover:text-zinc-900`, no box.
- Chip (IDs, HTS, money inline): `font-mono tabular-nums text-[13px] text-zinc-700 bg-zinc-100 rounded-md px-1.5 py-0.5`. No border.
- Card: `bg-white border border-zinc-200 rounded-2xl p-6`. No nested cards.
- Status word: dot 6px + Small 500 text in the semantic color (safe emerald-700, fix first amber-700 text on white, broker decides zinc-700, leave out red-700).
- Table: Small zinc-500 headers, Body cells, `py-3`, `border-b border-zinc-100`.

## 5. Copy

Plain English. Status labels: "Safe to claim", "Fix first", "Broker decides", "Leave out". Sentence case everywhere. Keep: "Can't be undone.", "Not legal or customs advice", "Sample data", the no-CBP-seal wording.

## 6. Acceptance checks

- Under 3 seconds a stranger can say what the number is and what the button does.
- Only 3 font sizes per viewport (run `scripts/_typeaudit.mjs`).
- WCAG AA text contrast; 44px touch targets on mobile.
- 1440, 768, 390: no horizontal scroll, no clipped text, no console errors.
- Screenshots reviewed against this file by an independent reviewer.
