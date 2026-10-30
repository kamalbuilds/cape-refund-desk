# DESIGN.md: CAPE Refund Desk, dark Mercury

Source of truth for the visual system. Adapted from Mercury's published DESIGN.md (`mercury.md`, saved with the redesign refs) and from mercury.com's marketing and app screens (captured 2026-10-30, `~/Desktop/redesign7/ref/`). This file replaces the light "redesign6" spec. No logic changed, only the theme layer.

## 0. Atmosphere

A night-mode banking app for one irreversible decision. Ink-violet surfaces, soft off-white text, one indigo action, and money colours that are muted so a red number reads as a warning and not as an alarm. Elevation is tonal: a card is a slightly lighter fill, not a shadow. Light type weights do the work that heavy bold would do on white.

## 1. Hard rules

1. No pure black and no pure white anywhere. Page is `#171721`, body text is `#ededf3`.
2. Body copy meets WCAG AA 4.5:1 on every surface it sits on. Measured by `scripts/_contrast7.mjs`.
3. One solid indigo (`#5266eb`) per button group. Everything else in the group is glass or text.
4. Green, amber and red appear on product data only (money, lane dots, status words, the warning alert). Chrome (nav, progress, focus, selection) is indigo or periwinkle.
5. IDs and money are mono with tabular-nums.
6. Weights stay at 500 or below. Headlines run 440, UI 480, body 400.
7. No emoji, no em dashes, Lucide icons only.
8. Motion is limited to the chip flight, count-ups, the drawer slide and 150ms colour transitions.
9. Status words stay plain: "Safe to claim", "Fix first", "Your broker decides", "Leave out".

## 2. Tokens

All tokens are CSS variables in `src/app/globals.css :root`. Components never hardcode a colour.

### Surfaces and text

| Token | Value | Mercury source | Use |
|---|---|---|---|
| `--ground` | `#171721` | `night` | page, header, footer |
| `--surface` | `#1e1e2a` | `night-raised` | cards, panels, drawer, tables |
| `--raised` | `#252535` | tonal step above raised | hover rows, inputs, code blocks |
| `--raised2` | `#2e2e42` | tonal step | selected row, tracks, chips |
| `--border` | `#2e2e40` | hairline at about 14% fog | card edge, dividers |
| `--rule` | `#262636` | hairline | row separators |
| `--control` | `#43435c` | control edge | inputs, dashed upload |
| `--control-hi` | `#5c5c78` | control edge hover | checkbox, bar ends |
| `--text` | `#ededf3` | `on-dark` | headlines, numbers, body |
| `--soft` | `#d3d3de` | between on-dark and fog | secondary body |
| `--muted` | `#b3b3c2` | near `fog #c3c3cc` | helper copy |
| `--faint` | `#9696a8` | lifted from `slate #70707d` | captions, labels |

Mercury's `slate #70707d` is 3.6:1 on night and fails AA, so `--faint` is lifted to `#9696a8` (5.6:1 on surface).

### Action

| Token | Value | Mercury source |
|---|---|---|
| `--accent` / `--primary` | `#5266eb` | `primary` |
| `--accent-hover` | `#4256d4` | darker, keeps label contrast |
| `--accent-ink` | `#fcfcff` | `on-primary` (4.6:1 on indigo) |
| `--periwinkle` | `#9cb4e8` | `periwinkle`: focus ring, chrome accent |
| `--accent-line` | `#8294f2` | selected card and row edge |
| `--glass` | `rgba(175,178,206,.16)` | `button-glass-dark` (.20) |
| `--glass-line` | `rgba(175,178,206,.36)` | glass border at 36% |

### Semantic money colours (desaturated for night)

| Meaning | Dot / bar | Text | Wash | Edge |
|---|---|---|---|---|
| Keep (Safe to claim) | `#62b58d` | `#7fcaa5` | `rgba(98,181,141,.10)` | `rgba(98,181,141,.40)` |
| Warning (Fix first) | `#d6a95c` | `#e3bf80` | `rgba(214,169,92,.09)` | `rgba(214,169,92,.50)` |
| Decide (Your broker decides) | `#9cb4e8` | `#b6c8ee` | `rgba(156,180,232,.10)` | none |
| Owe (Leave out, a bill) | `#d9737a` | `#ec9ca1` | `rgba(217,115,122,.10)` | `rgba(217,115,122,.42)` |

### Warning alert

A bordered panel, not a slab: wash `rgba(214,169,92,.08)`, 1px edge `rgba(214,169,92,.50)`, text `#f1deb8`, icon `#e3bf80`. Contrast about 11:1.

### Type

| Role | Face | Size / line | Weight |
|---|---|---|---|
| Display (hero, board headline) | Hanken Grotesk (variable, light cut) | 48 / 52 | 440 |
| Section and number heads | Hanken Grotesk | 30 / 34 | 440 |
| Body and UI | Hanken Grotesk | 14 to 16 / 20 to 24 | 400 / 480 |
| Caption and legal | Hanken Grotesk | 12 / 18 | 400 |
| IDs, money, receipts | Geist Mono, tabular-nums | 13 to 30 | 400 / 440 |

Mercury uses Arcadia, a proprietary face with weights 360 to 500. Hanken Grotesk is the closest open variable grotesk: same quiet, slightly condensed neo-grotesque, runs light without turning thin. Loaded with `next/font/google`, no static weights, so 440 and 480 work.

### Shape and space

| Token | Value | Mercury source |
|---|---|---|
| Card radius | 12px | `md` / dark card |
| Control radius | 8px | `sm` |
| Button radius | full pill | `xl` 32 pill |
| Button height | 40px (32px small) | `primary` |
| Card padding | 24px | spacing 24 |
| Section gap | 80px | `section` |

## 3. Layout

One column, max 1120px, header and footer on night. Landing: alert, hero (headline, lead, primary + glass), the sample ticket card. Board: headline, safe-to-claim card, four lane cards, lane table, panels, receipt, sources, footer. Drawer: 480px on desktop, full width at 390.

## 4. Components

- **Buttons.** Primary: indigo pill, label `#fcfcff`. Secondary: glass fill with 36% edge. Tertiary: text only, wash on hover. Never two primaries in one group.
- **Lane card.** `--surface` fill, 1px `--border`, 12px radius. Selected: `--accent-line` edge and 1px ring. Dot carries the semantic colour, the label stays off-white.
- **Table.** Hairline rows, `--raised` hover, `--raised2` selected, mono IDs on a `--wash-2` chip.
- **Drawer.** `--surface` over a `rgba(10,10,18,.66)` scrim, indigo primary pinned in the footer with glass Close.
- **Forms.** `--raised` fill, 1px `--control`, 8px radius. Checkbox is a custom 18px box that fills indigo with a check.
- **Waterfall.** Track `--raised2`, bars `--go`, `--control-hi`, `--stop`.

## 5. Copy

Plain English, no em dashes. Money and IDs in mono. Status words are the four lane names.

## 6. Acceptance checks

1. `grep -rE 'bg-white|#fff\b|#ffffff|zinc-|#fafafa|#f4f4f5' src` returns nothing.
2. `node scripts/_contrast7.mjs`: zero enabled text below 4.5:1.
3. Screenshots at 1440, 768 and 390 for landing, board, a lane, the drawer and the full page, zero console errors (`scripts/_shots7.mjs`).
4. Chip flight still runs and the chips fade after the lanes fill.
5. `npm test` (55), `tsc --noEmit`, `SKIP_LIVE=1 node scripts/e2e.mjs` all green.
