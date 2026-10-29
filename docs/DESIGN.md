# CAPE Refund Desk: design system (light fintech, pass 4)

Direction (from the owner): a light, senior fintech and customs look in the family of Stripe and Mercury. It replaces the earlier dark "Warm Ink" pass. Copy, board, drawer, waterfall, count-ups and the lane animation are kept and restyled. No logic changed.

## 1. Principles

- One clear primary action per screen. Action hierarchy is strict: primary, secondary, tertiary, never equal weight.
- Colour goes on data, not decoration. Neutrals come only from the zinc scale. Lane colours are semantic: emerald safe, amber fix first, blue broker decides, red leave out, shown as subtle tints on white cards.
- Data you might copy (entry numbers, importer ids, HTS codes, dollar figures in tables and inline) is set in mono inside a chip, so it reads as data.
- Plain English first. The trust wording (disclaimer, synthetic-sample label, "no CBP seal / not affiliated") is unchanged.
- No nested cards, no gradients as decoration, no glass, no side-tab accent borders, no overshoot easing.

## 2. Stack

Tailwind v4 (`@tailwindcss/postcss`, `@import "tailwindcss"`) with Next 16. Spec elements are literal utility classes in JSX. The chip-fly board engine, drawer and animations still use a small legacy stylesheet, kept in `@layer components` so utilities always win, and re-themed to zinc through CSS variables. Icons: `lucide-react`. Fonts: Geist (text) and Geist Mono (data), via `next/font`.

## 3. Spec mapping

| Spec item | Where |
|---|---|
| Irreversible alert | `Desk.tsx` top: amber-50/50 alert, `AlertTriangle`, bold lead "Can't be undone." |
| Headline and subheadline | hero `h2` and board `h2.headline`: `text-3xl font-semibold tracking-tight text-zinc-900`; subhead `text-base text-zinc-600 max-w-2xl leading-relaxed mt-2` |
| Data chips | `components/ui.tsx` `Id` uses the exact chip classes. Used in shipment rows, filing order, importer table, drawer parts and lines, ledger |
| Hero numbers | mono + tabular-nums (twist card, lane counts, drawer net, KPI) |
| Buttons | `BTN_PRIMARY`, `BTN_SECONDARY`, `BTN_TERTIARY` in `ui.tsx`. Primary = main run ("Run the sample", "Check in this browser (no upload)", CAPE file download, "Add to the refund file", "Send the safe part to my broker"). Secondary = live / AI / broker note. Tertiary = download ("Download the sample CSV" and the deadlines CSV, both with the lucide Download icon) |
| Rule watch | "Compliance Status" card: zinc-50, zinc-200, rounded-xl, p-5, mt-8, with the "Live CBP Check" badge |
| Global cleanup | cards are white with a zinc-200 border and `shadow-sm`; spacing on an 8pt grid (gap 16, pad 24, mt-8) |

## 4. Tokens

- Surfaces: page `#fafafa` (zinc-50), cards `#fff`, hairlines zinc-200 `#e4e4e7`, text zinc-900 `#18181b`, body copy zinc-600 `#52525b`.
- Lane ink on a 5% white tint: safe `#047857`, fix first `#b45309`, broker `#1d4ed8`, leave out `#b91c1c`. Fills (dots, chips, bars) use the 500-level tone.
- Radius 12 on cards, 8 on controls. One shadow: `0 1px 2px 0 rgb(0 0 0 / .05)`.
- Motion: ease `cubic-bezier(.16,1,.3,1)` (no overshoot), transform and opacity only, count-ups 0.8 to 1.1s, reduced motion respected.

## 5. Contrast (WCAG, text on its surface)

All body text is at least 4.5:1. Measured: alert amber-900 on amber-50/50 8.7; badge emerald-700 on emerald-50 5.2; chip zinc-600 on zinc-100 7.0; chip red on zinc-100 5.9; primary white on zinc-900 17.7; subtext zinc-300 on zinc-900 12.0; zinc-600 on white 7.7; zinc-600 on page 7.4; table header `#71717a` on page 4.6; lane inks on their tints 4.8 to 6.3; zinc-700 sub copy on tints 9.8 to 10.0; pills 4.8 to 6.2. The raw tone colours (2.1 to 3.5) are used only as dots, bars and chip fills, never as text.

## 6. The moments

1. Hero twist card: a real sample shipment, refund counts up, other duties come off, the number rolls to a bill.
2. Run the sample: 69 chips stream in, then fly into four lane cards; counts and dollars count up.
3. Board: four tinted lane cards. Clicking one opens its table (sortable by filing order, amount, time left; empty state included).
4. Drawer: net number, waterfall with a dollar label on every bar, a total row and a $0 axis marker, then the AI analyst and dates.
5. Compliance Status: reads the live Customs page on request and quotes every change.

## 7. Deviations and notes

- The hero headline is 30px, per the spec, so the landing is calmer than the old 92px display.
- The board is still driven by a small class-based stylesheet (layered under Tailwind) because the chip flight reads real element geometry; only the spec'd elements are pure utilities.
- The Compliance Status card is zinc-50 as specified, which is the one card that is not white.
- The "Live CBP Check" badge is static markup as specified. The check itself runs when the user presses the button.
