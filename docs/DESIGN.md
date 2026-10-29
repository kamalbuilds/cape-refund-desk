# CAPE Refund Desk: design direction

Status: written before any UI code changed (2026-10-29). Skills followed: `ui-craft` (v2.5.0), `design-taste-frontend` (tasteskill v2, app-screen run, style dealt with `draw.mjs --app`), `anti-ai-slop-frontend`, with `ui-skills-baseline-ui`, `web-design-guidelines` and `motion-doctrine` for motion and a11y checks. The deal is saved in `.taste-skill/direction.json` (seed 1903983291).

## 1. What the screen is for

One job: **before an irreversible upload, show a broker which entries are safe to file, which need a fix, which need a human decision about a possible bill, and which ACE will reject, with the money for each.** Everything on the first screen serves that. The biggest block on the board answers it; nothing else competes.

Users: an importer of record with a CSV and a licensed customs broker, reading for ten minutes, under deadline. Judges and a demo video watch the same screen for 90 seconds. So the look has to be credible (a trade/finance tool, not a hackathon dashboard) and the demo moments have to be legible at a glance.

## 2. Direction: "Achromatic ledger", on a customs-manifest ground

Style adopted whole from the dealt sheet: the chrome holds no colour; money and counts are set in ink; colour appears only on data (lane status, a change signal). Reason it fits: a ledger a broker signs off on should look like a ledger. A second reason is that the product's danger is irreversibility, so the page must be calm and the one warning must be unmistakable.

Departures from the sheet, each with a reason:
- **No sidebar.** The product is a single screen with a flow (run, read, export), not a multi-page app. The sheet's "open plane" shell is kept in spirit: header sits on the ground, white cards on an off-white ground, 1px hairlines, no shadow at rest.
- **Ground `#f2f4f7`** (the sheet's "blue-grey for a ledger" option), cards white.
- **Four lane hues instead of one chart hue**, because the product's data *is* a four-way classification. They are applied only to data (manifest ticks, lane pills, the 3px rule under a selected lane tab, negative money). Chrome, buttons and the irreversible bar stay ink.
- **The irreversible bar is solid ink, not red**, so "Do not include" (red) never shares a colour with the global warning.
- **Geist Mono is used for entry numbers, IORs and completion ids only.** Money is Geist with `tabular-nums` and right alignment (weight 600 on money only).

### Signature element: the manifest strip
A single row of ticks, one per entry, like a barcode on a customs manifest. It is the product mark's shape, the progress indicator, and the board in miniature:
1. before the run, ghost ticks (grey);
2. while Lightning normalizes, ticks darken to ink in proportion to rows done;
3. when the deterministic board lands, the ticks sweep left to right into lane colours and sort into four contiguous groups, and the lane counts tick up;
4. as Ultra explains entries, a small ink underline appears under each explained tick.
Clicking a tick opens that entry. It is decorative-plus-navigation (mouse only; the table below is the accessible path, ticks are `aria-hidden`).

### Product mark
28px ink square with five white vertical bars of varied height (a manifest barcode). Same mark as the favicon.

## 3. Tokens

```css
--ground:#f2f4f7; --surface:#ffffff; --raised:#eceef2; --border:#e2e5ea; --rule:#eef0f3; --control:#d4d7dd;
--text:#0a0a0a; --muted:#5f6670; --accent:#141414;            /* ink primary, no brand colour */
--go:#2e7d32;   --go-bg:#dcfae5;   --go-ink:#04250e;          /* Cleared to file */
--hold:#b45309; --hold-bg:#fdecc8; --hold-ink:#6b3306;        /* Hold: fix first */
--decide:#1d5fbf; --decide-bg:#e3ecfa; --decide-ink:#123f82;  /* Broker decision (the one chart hue) */
--stop:#c4242a; --stop-bg:#ffedea;  --stop-ink:#831c1e;       /* Do not include; negative money */
--radius-card:8px; --radius-control:6px; --row:44px; --control-h:36px;
--gap:12px; --pad:24px;
```
True-neutral darks only (ink `#0a0a0a`, `#141414`); no navy, slate, gradient, glow, glass or violet. Text contrast: ink on white 19:1, muted `#5f6670` on `#f2f4f7` 5.3:1, pill inks are the dark of their own hue at >= 7:1.

## 4. Type (Geist + Geist Mono, via `next/font/google`)

| role | size / weight | notes |
|---|---|---|
| page title (landing) | 32/38, 600, tracking -0.02em | the largest type anywhere on the page |
| section | 16/24, 600 | card titles |
| kpi (lane counts, net, selected total) | 30/34, 500; money 600 | nothing at 48px or above |
| body | 14/22, 400 | sentence case, no tracked capitals |
| small / meta | 12/16, 400, muted | minimum 12px; no figure or label under 11px |
| mono (ids) | 13, Geist Mono 400 | entry numbers, IOR codes, completion ids |

`font-variant-numeric: tabular-nums` on every table, tab, KPI and anything that updates. Money is right-aligned. A bad net (a bill) is the negative colour with a real minus sign.

## 5. Grid, density, shape

- Page: centred column, max 1240px, 24px gutters (16px on phones). One gap value, 12px, horizontally and vertically; 24px between sections.
- Density: sparse on the landing, tight and ruled on the board (row pitch 44px, one-line rows).
- Cards white, 8px radius, 1px border, no shadow at rest. Controls 6px radius, 36px high (44px hit area on phones). One primary action per screen state: near-black filled button. Secondary: `#eceef2` fill. Tertiary: text link.
- Nothing nested in a card with its own border and radius; groups inside a card are separated by hairlines.

## 6. The board (the centrepiece)

1. **Header**: mark, name, a quiet "Nemotron 3 Ultra + 3.5 Lightning on Nebius Token Factory" line (text, not pills), data-label tag.
2. **Irreversible bar**: solid ink, white text, full width. Carries `IRREVERSIBLE` and `PREPARED_FOR` verbatim.
3. **Summary container** (one card split by 1px dividers into four equal lane cells that act as tabs): lane name, count (30px), money line (refund, and for broker decision "up to $X bills"). Selected lane gets a 3px rule in its own colour on top and an ink label. A heading line says "N of M entries need a fix or a decision before upload" (computed).
4. **Manifest strip** above the lane cells.
5. **Lane table** for the selected lane, full width: include checkbox, entry number, IOR, CBP error string or finding, window countdown, amount (right-aligned). 44px rows. Clicking a row opens the drawer.
6. **Ultra read** and **broker questions** in a two-column card under the table's tabs.
7. **Export dock**: the one primary action. Large net refund of the selection, entry count, possible bills, the acknowledgement, then the near-black download buttons.
8. **Filing order**, **IOR debts**, **Rule-watch**, **Token Factory receipt**: ruled cards in the same system.

### Drawer (the reasoning moment)
560px, slides from the right (transform only, 200ms ease-out), light scrim, Esc and the X close it. Order: entry number, lane pill and step; **net callout** (30px: net, with refundable and underpaid lines under it; a bill reads in the negative colour); the exact CBP error in quotes with its definition and fix and source link; **Ultra explanation** on a raised grey panel, with the number-guard note and the reasoning trace in a disclosure; the **countdown module** (CAPE window and protest window as 4px bars with days left, urgent when 7 or fewer); lines; dates.

## 7. Motion

Doctrine: motion explains state changes; compositor properties only (transform, opacity); nothing loops; everything respects `prefers-reduced-motion`.
- Manifest ticks: stagger sweep into lane colours on the board event (opacity/transform, 14ms stagger, <=900ms total).
- Lane counts: count up over 600ms (text only), only for runs that stream (recorded or live).
- Table rows of the selected lane: 160ms fade/translate-y 4px, 12ms stagger for the first 14 rows.
- Ultra underline per tick: 120ms scaleX.
- Drawer: 200ms translateX, scrim fades.
- Tab switch: no animation beyond the rule moving.
Reduced motion: no stagger, no count-up, drawer appears instantly.

## 8. Voice and trust wording (unchanged)
Disclaimer, "Prepared for licensed customs broker review", sample-data label ("synthetic: realistic made-up entries"), "never decide eligibility or touch a dollar figure", and "not affiliated with or endorsed by CBP" stay verbatim. No CBP seal or lookalike mark anywhere. No emoji, no em-dashes in new copy.

## 9. Teardown of the previous UI against each skill

### 9.1 anti-ai-slop-frontend / ui-craft (hard rules and tells)
| # | Previous UI | Rule it breaks | Fix |
|---|---|---|---|
| 1 | Radial gradient glow in the body background | no gradients/glow | flat `#f2f4f7` ground |
| 2 | Gold (#f0c36a) brand accent on every eyebrow, button, link and the mark; a coloured accent in the chrome | colour on data only; one accent with one job | chrome is ink; colour only on lane data |
| 3 | Dark navy-slate (#0e1013 / #161a1f / #1c2128 with a blue cast) | true-neutral darks, no navy/slate | light ledger, neutral ink |
| 4 | Monospace everywhere: eyebrows, buttons, counts, amounts, hints (hacker vibe) | mono only for IDs/figures that need it | Geist for UI and money, Geist Mono for ids only |
| 5 | Tracked, uppercase mono eyebrows on every card ("RULE-WATCH:", "EXPORT FOR YOUR BROKER") | no tracked caps; sentence case | sentence-case section titles |
| 6 | Four coloured top borders on KPI tiles + 44px coloured mono counts (big-metric template) | no figure at 48px+ is allowed, but 44px coloured big numbers on tinted tiles is the template; KPIs are type in one divided strip | one container, four cells split by hairlines, 30px ink counts |
| 7 | Cards nested in lanes nested in a page, each with border and radius; coloured left rail on included cards | no cards inside cards, no coloured side-borders | ruled table rows, no nested cards |
| 8 | Pills everywhere: "Ultra", "0d left", "IOR debt may offset", "leading zero", outlined and coloured | pale status pills, used sparingly | pale pills only for lane status and urgent windows; secondary facts as plain muted text |
| 9 | Glyph/emoji icons as text: play, lightning bolt, down arrow, file | no emoji | inline SVG icons or none |
| 10 | Fraunces serif headline + IBM Plex Sans + IBM Plex Mono (three families) | one grotesk plus mono for ids | Geist + Geist Mono |
| 11 | Red irreversible banner using the same red as "Do not include" and error text | colour must mean one thing | banner is ink; red means do-not-include or negative money only |
| 12 | Violet (#b79cff) for "Broker decision" | no violet/indigo | blue (#1d5fbf) |
| 13 | Text sizes of 10.5 and 11px, dim `#9aa3ad` on `#161a1f` hints | minimum 11-12px, 4.5:1 | 12px minimum, muted `#5f6670` (5.3:1) |
| 14 | Hover lift (`translateY(-1px)`) on cards, `transition: all`-style transitions | no layout-shifting hovers | hover only changes background |

### 9.2 design-taste-frontend (app-screens.md)
| Rule | Previous UI | Fix |
|---|---|---|
| The screen's biggest block answers its one question | four equal 880px scrolling columns of identical cards; the question (what can I file?) is spread over 67 cards | one divided summary + one full-width table of the selected lane; the export dock states the answer in money |
| One primary action per state | landing: seven buttons of similar weight (sample, live, upload, browser check, Lightning+Ultra, download, check CBP) | one near-black primary per state; the rest grey or text |
| KPI strip: type in one divided container | four boxed tiles, coloured border-tops | one container, 1px dividers, lane cells double as tabs |
| Flat surfaces, no shadow at rest | drawer box-shadow, coloured glows on mark | none |
| Right-aligned tabular figures | amounts left-aligned inline next to IOR | right-aligned column, tabular-nums |
| Title 18-32px, one data hue on the main element | serif 28px title; three accent hues | 32px landing title, app titles 18-24px; blue only for broker-decision data |
| Signature element | none (a gold "CAPE" badge) | the manifest strip and barcode mark |
| Honest computed data | already good: all lane counts and money come from the engine | keep; add a computed "N of M need a fix or decision" line |
| Phone: fold nav, 44px targets, two-line rows | four columns collapse to one 36-card-long list; 11.5px checkbox labels | 2x2 lane cells, two-line rows, 44px targets |
| Empty / loading / error states | thin progress bars in a panel; errors as red text | ghost strip while loading, inline errors with cause, notices keep the replay path |

### 9.3 Previous worker's teardown (kept as inputs)
One big primary action (done: #2 of 9.2); a large summary bar with lane counts and the dollar total (done: summary container and the export dock); fewer, larger cards and grouping safe ones (done: one lane table at a time, the 36 cleared entries as a single compact table, urgent windows first by filing order); net vs gross as a big callout (done: drawer net callout); readable body sans and disciplined palette (done: Geist, four lane hues on data only).

### 9.4 Other skills skimmed
- `ui-skills-baseline-ui`: no `h-screen`, no animated layout properties, no gradients, one accent. Applied.
- `web-design-guidelines`: visible focus rings, labelled controls, `aria-live` for progress, reduced motion. Applied (focus ring 2px ink + 2px offset, Esc to close drawer).
- `motion-doctrine`: section 7.

## 10. Process notes (what could not be done as written)
- `uicraft read` requires 10 captured references in `design-research/REFS.md` captured through a signed-in browser profile ("bhn deepsurge") that is not available to this agent; the design-taste `draw.mjs --app` run (which ships measured values from real product screens) was used as the reference base instead. This is a deviation from ui-craft's protocol and is reported as such.

## 12. Final deltas and reviewer round log

- Hero headline: "Know what to hold before you upload." Small text floor is 13px. How-list is unnumbered. Mobile grids use `minmax(0,1fr)`.
- Round 1 reviewer fixes: header attribution shortened to one block, Ultra progress reads "queued, starts when rows are clean" until it has a total, export dock is sticky on desktop (static on mobile).
- Round 2 fixes: drawer countdown labels no longer wrap mid-date on mobile, drawer close button stays fixed on mobile.
- Reviewers were run through `codex exec` (read-only sandbox, screenshots attached, agent prompt files inlined). Scores stayed 6 to 7 out of 10, mostly on mobile density, receipt density and landing copy volume. Those are deferred, see the report.

## 13. Plain-English pass

Judges are not customs experts, so all UI copy was rewritten for a reader who has never heard of CBP, CAPE, IEEPA, IOR, PSC, liquidation or Recon. The engine, lane enums and CBP error strings are unchanged. `src/lib/plain.ts` translates findings, filing steps and the drawer's one-sentence verdict at display time. Customs' exact error text stays as small secondary text in the drawer and as a tooltip on each row. Lanes are shown as Safe to claim, Fix first, Your broker decides and Leave out. The broker handoff note keeps the technical wording because its reader is a customs broker. The Ultra prompt asks for plain English for a small business owner; the recorded run text was not regenerated.
