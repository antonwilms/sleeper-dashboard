# Handoff: Dynasty portfolio dashboard redesign

## Overview

A redesign of the Sleeper dynasty fantasy dashboard (`antonwilms/sleeper-dashboard`, branch `main`), moving it from a three-level tab hierarchy into a portfolio-management tool.

The package contains three designs:

| ID | Name | Status |
| --- | --- | --- |
| `1b` | Redesign — portfolio-first IA (Portfolio, Market, Player detail pop-up) | Agreed baseline, ready to build |
| `2a` | Decision desk — home screen as a ranked stack of calls | Direction under consideration |
| `2b` | League map — assets plotted against all 12 rosters | Direction under consideration |

`1a` is a recreation of the **current** UI from repo source, kept only as a before/after reference. Do not build from it.

**Recommended build order:** implement `1b` first — it is the structural change (flattened IA, single-table paradigm, pop-up detail). `2a` and `2b` are additive surfaces that sit on top of that structure; they do not require rework of `1b`. `2a` becomes a new default landing surface ("Today") and `2b` becomes a new surface alongside Market. A decision on those two is still open; treat them as designed-and-specced, not committed.

## About the design files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behaviour. They are not production code to copy.

The HTML uses a bespoke lightweight template runtime (`support.js`, `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ }}` holes). **Ignore that runtime entirely.** The task is to recreate these designs in the existing codebase: React + Vite + Tailwind, using the repo's established patterns (`src/components/shell/*` for chrome, `src/components/ui/*` for primitives, `src/theme.js` for tokens).

Read the HTML for layout, hex values, copy, and interaction logic. `<sc-for list="{{ rows }}">` is a `.map()`. `<sc-if value="{{ x }}">` is a conditional render. The `<script type="text/x-dc">` block at the bottom of the file holds all data and derived state — the `renderVals()` return object is the props/state the view consumes, and the arrays above the class (`P`, `DECISIONS`, `MAP`, `MGRS`) are mock data standing in for real API responses.

## Fidelity

**High-fidelity.** Colours, typography, spacing, radii and copy are final. Recreate pixel-accurately using Tailwind against the token table below. All copy in the mock is intentional and should ship as written unless the underlying data cannot support it.

Two exceptions:
- Player names, values and stats are illustrative mock data. Wire to real sources.
- Anything reading `612 players`, `48,300`, `2nd of 12` etc. is representative, not literal.

## Design tokens

Add these to `src/theme.js`. Names are suggestions; hexes are exact.

### Surfaces
| Token | Hex | Use |
| --- | --- | --- |
| `canvas` | `#0b0c0e` | App background, behind all content |
| `chrome` | `#0f1114` | Command bar, nav rail, right rail, inner wells |
| `card` | `#131519` | Every card and panel |
| `card-quiet` | `#101215` | Collapsed decision card (2a) |
| `row-head` | `#16191e` | Table header row |
| `row-self` | `#181b21` | "My Team" row resting state (2b matrix) |
| `row-active` | `#1a2230` | Selected row (2b matrix) |
| `chip` | `#22262d` | Position tags, neutral pills, segmented-control active |

### Borders
| Token | Hex | Use |
| --- | --- | --- |
| `border` | `#23262c` | Default — cards, chrome, inputs, pills |
| `border-row` | `#1c1f25` | Table row dividers, meter tracks |
| `border-raised` | `#2e333b` | Modal edge, expanded card, dropdown, unchecked box |
| `gridline` | `#191c21` | Chart gridlines |
| `axis` | `#2e333b` | Quadrant divider lines (2b) |

### Text
| Token | Hex | Use |
| --- | --- | --- |
| `text` | `#f2f3f5` | Primary |
| `text-strong` | `#e6e8eb` | Table cell values, compare headers |
| `text-2` | `#d4d6db` | Secondary body |
| `text-3` | `#b8bec7` | Tertiary / card body |
| `text-4` | `#9aa0aa` | Inactive nav, labels |
| `text-5` | `#8b919b` | Long-form muted body |
| `muted` | `#6b7079` | Meta, captions, mono column labels |
| `muted-2` | `#4b5058` | Rail section headings, axis ticks, chevrons |

### Signal colours — colour-blind safe, no red/green
| Token | Hex | Meaning |
| --- | --- | --- |
| `up` | `#4f8bff` | Positive / appreciating / undervalued / primary action |
| `up-text` | `#9dbcff` | Blue text on dark |
| `up-bg` | `#12203a` | Blue chip background |
| `up-bg-strong` | `#1a3560` | Blue matrix cell, filled owned dot |
| `up-bg-soft` | `#16283f` | Blue matrix cell, +1 |
| `up-border` | `#2f4a7a` | Blue chip border |
| `down` | `#f2a13b` | Negative / depreciating / overvalued / risk |
| `down-text` | `#f5c483` | Amber text on dark |
| `down-body` | `#cbb99f` | Amber long-form body ("against" block) |
| `down-bg` | `#2e2415` | Amber chip background |
| `down-bg-strong` | `#402d13` | Amber matrix cell, verb tag |
| `down-bg-soft` | `#2c2216` | Amber matrix cell, −1 |
| `down-border` | `#6b4a1d` | Amber chip border |
| `down-border-soft` | `#34291a` | "Against" block border |
| `neutral` | `#7c8ea8` | Peak / aligned / no direction |
| `slate` | `#2f3945` | Inactive sparkline bars |
| `slate-2` | `#3a414d` | Neutral horizon pill border |
| `proj` | `#1d3a6b` | Projection bar (distinct from actuals) |

**Rule:** direction is never carried by colour alone. Every up/down value pairs its colour with a glyph (`▲ ▼ ↑ ↓ → −`) or a word (`under model`, `Needs help`).

### Typography
- **UI:** `'Public Sans', system-ui, sans-serif` — weights 400/500/600/700.
- **Numerals, labels, keys:** `'IBM Plex Mono', monospace` — weights 400/500/600. Every number a user compares is mono. Every uppercase micro-label is mono.
- `Inter` appears only in `1a` (the current-UI recreation). Do not carry it forward.

| Role | Size / weight / tracking |
| --- | --- |
| Page title | 22px / 700 / `-0.02em` |
| Panel title (selected asset, fit-with) | 16–17px / 700 / `-0.01em` |
| Decision card name | 15px / 700 / `-0.01em` |
| Brand | 14px / 700 / `-0.01em` |
| Card heading | 13px / 600 |
| Body | 13px / 400 / `line-height: 1.5–1.6` |
| Secondary body | 12px / 400 / `line-height: 1.6–1.65` |
| Meta, captions | 11px / 400 |
| Mono micro-label | 10px / 500 / `letter-spacing: 0.08em` (0.1em in rails) / uppercase |
| Big mono stat | 21–26px / 600 / `-0.02em` |

Long body copy carries `text-wrap: pretty`.

### Radii
`4px` tags & mono chips · `5px` matrix cells · `6px` segmented-control items · `7px` nav items, pills, inputs, chart bars (top only: `5px 5px 2px 2px`) · `8px` buttons, list rows, segmented-control shell · `9px` inner cards · `10px` cards · `11px` decision cards · `14px` modal · `9999px` round pills and dots.

### Shadows
| Use | Value |
| --- | --- |
| Expanded decision card | `0 8px 28px rgba(0,0,0,0.35)` |
| Detail modal | `0 30px 90px rgba(0,0,0,0.65)` |
| Dropdown | `0 16px 40px rgba(0,0,0,0.5)` |
| Selected scatter dot | `0 0 0 5px rgba(79,139,255,0.22)` |
| Modal scrim | `rgba(6,7,9,0.74)` |

### Layout constants
- Command bar height **52px**, `padding: 0 20px`, bottom border.
- Nav rail width **184px**, `padding: 14px 10px`, `gap: 2px`, right border.
- Right rail width **300px**.
- Content padding **24px 28px**.
- Card padding **14–20px** (`16px 18px` typical, `18px 20px` for chart cards).
- Grid gaps: `14px` tiles, `18px` card rows, `22–24px` column splits.
- Meter/bar heights: `4px` (in-card), `5px` (sliders, risk pips), `6px` (row value bars, posture).

## Chrome — shared by all views

### Command bar (`52px`)
Left: 18×18 `up` rounded square logo, league name 14/700, `▾` in `muted-2`.
Centre: search field, `max-width: 380–420px`, `height: 30px`, `border: 1px solid border`, `bg: card`, radius 7px, placeholder "Search players, teams, picks" in `muted`, and a `⌘K` mono keycap (11px, 1px border, radius 4px) right-aligned inside.
Right: freshness indicator — 6px `up` dot + "Data current · Week 18" at 12px `text-4`; then a 24px round avatar.

`1b` also shows a "Dark" theme pill; drop it if the app has a theme control elsewhere.

### Nav rail (`184px`)
Mono 10px `muted-2` section headings with `letter-spacing: 0.1em`, `padding: 6px 10px` (top group) / `14px 10px 6px` (subsequent groups). Items are 13px, `padding: 7px 10px`, radius 7px.
- Resting: `text-4`, transparent background.
- Active: `bg #1c2431`, `color up-text`, weight 600.
- Counts sit right-aligned in mono 11px, `down` when they represent something needing attention.

Groups differ per direction:
- `1b`: MANAGE (Portfolio, Market) · ACT (Trade desk `3`, Draft board) · LEAGUE (Standings, Schedule, Rosters)
- `2a`: Today `5` (ungrouped, first) · HOLDINGS (Portfolio, Market) · ACT · LEAGUE
- `2b`: MANAGE (Portfolio, **League map**, Market table) · ACT · LEAGUE

---

# 1b — Portfolio-first IA

The structural change. Replaces `Board / Roster / Players / Trade` × `Dynasty / Weekly` × `Value / Outlook / NFL stats` with two surfaces and a pop-up.

## Screen: Portfolio

**Purpose:** answer "what do I own, what is it worth, what needs me" in one screen.

**Layout** (top to bottom, `flex-direction: column`, `gap: 22px`):

1. **Header row** — `align-items: flex-end; justify-content: space-between`. Left: "Portfolio" 22/700 plus "14 assets · 3 rookie picks · contending window open" 13px `muted`. Right: segmented control (30 days / Season / All time) — shell `bg card`, `1px border`, radius 8px, `padding: 3px`; items `padding: 5px 12px`, radius 6px; active `bg chip`, `text`, 600; inactive `text-4`.

2. **Metric tiles** — `grid-template-columns: repeat(4, 1fr); gap: 14px`. Card, `padding: 14px 16px`. Each: mono 11px uppercase `muted` label; then `display: flex; align-items: baseline; gap: 8px` with a mono 24/600 `-0.02em` value and a 12/600 delta in `up`/`down`; then a 12px `muted` note.
   - Roster value · `48,300` · `▲ 3.2%` · "2nd of 12 · +1,490 in 30 days"
   - Weighted age · `25.4` · `▼ 0.3` (in `up` — younger is good) · "League median 26.9"
   - Concentration · `61%` · `top 4` (in `down`) · "Four assets hold most of your value"
   - Proj. points · `2,140` · `▲ 4.6%` · "Next season, starters only"

3. **Two-column row** — `grid-template-columns: 1.35fr 1fr; gap: 18px`.

   **Value by age band** (left): card, `padding: 16px 18px`. Header: "Value by age band" 13/600 + "where your capital sits on the age curve" 12px `muted`. Bars: `display: flex; align-items: flex-end; gap: 14px; height: 190px`. Each band is a column (`flex: 1`) of mono 11px value → bar (`width: 100%`, radius `5px 5px 2px 2px`) → 11px `muted` label. Bands: 21–23 `17,800` h132 `up` · 24–25 `12,400` h92 `up` · 26–28 `6,900` h51 `neutral` · 29–30 `8,600` h64 `down` · 31+ `2,600` h19 `down`. Legend beneath: three 8px squares + "Appreciating (≤25) / Peak (26–28) / Depreciating (29+)".

   **Needs a decision** (right): card, `padding: 16px 18px`, `gap: 12px`. Each alert: `bg chrome`, `1px border`, radius 8px, `padding: 11px 12px`. Row one: mono 10px tag (radius 4px, `padding: 2px 6px`) + name 13/600. Then 12px `text-4` body at `line-height: 1.5`.
   - `SELL HIGH` (amber) Saquon Barkley — "Age 29 with a career-best season behind him. Market is 9% above your model — the gap closes fast after 30."
   - `BUY LOW` (blue) Malik Nabers — "Model ranks him WR4 next season; market prices him WR9. Owner is rebuilding and shopping."
   - `RISK` (neutral `chip`/`text-3`) Position concentration — "RB holds 34% of your value with two assets over 28. One injury reprices the roster."

4. **Holdings table** — card with `overflow: hidden`. Header strip `padding: 14px 18px` with "Holdings" 13/600 and two ghost controls ("All positions", "Sort: value ↓") at 12px, `1px border`, radius 6px. Table: `width: 100%`, `border-collapse: collapse`, 13px. Header row `bg row-head`, cells mono 10px `muted` weight 500, `letter-spacing: 0.08em`, `padding: 9px 18px` at the edges / `9px 12px` inside. Rows `border-top: 1px solid border-row`, `cursor: pointer`, whole row opens the detail pop-up.

   | Column | Content |
   | --- | --- |
   | ASSET | 26px-wide mono position tag (`bg chip`, radius 4px) + name 600 over 11px `muted` meta (`age · team · Nyr`) |
   | VALUE | 190px cell: 6px meter (track `border-row`, fill `up` or `down` when the 30-day trend is negative, `width` = value ÷ league max) + mono 12px number right-aligned in a 46px box |
   | 30D | mono 12px, right-aligned, `up`/`down`/`muted`, e.g. `+4.1%` |
   | 5-YR PPG | five 7px-wide bars, `gap: 3px`, `align-items: flex-end`, `height: 20px`; latest season `up`, prior seasons `slate`, missing seasons 3px `border-row` |
   | PROJ Δ | mono 12px right-aligned, `↑ +0.7` / `↓ -3.7` |
   | HORIZON | outlined pill, radius 9999px, `padding: 2px 8px`, 11px — Appreciating (`up-border`/`up-text`), Peak (`slate-2`/`text-3`), Depreciating (`down-border`/`down-text`) |
   | CALL | 12/600 — Hold `text-3`, Buy `up`, Sell / Sell high / Cut bait `down` |

## Screen: Market

Same chrome, `gap: 16px`. Header: "Market" + "612 players · every asset in the league, owned or not"; segmented control Value / Outlook / Production switches the **column set of one table** rather than navigating.

**Filter bar** — `display: flex; gap: 8px; flex-wrap: wrap`. Position segmented control (All/QB/RB/WR/TE), then active filter pills (radius 9999px, `padding: 5px 11px`, 12px; active = `up-bg`/`up-text`/`up-border`, inactive = `1px border`/`text-4`), then "+ Add filter" (dashed `border-raised`, `muted`; becomes solid `up-bg` when the panel is open), then right-aligned "Saved: Buy-low WRs".

**Filter panel** (toggled): card, `padding: 18px 20px`, `grid-template-columns: repeat(4, 1fr); gap: 22px 26px`. Each group is a mono 10px `muted` label above a control. Range sliders: 5px track `border-row`, `up` fill, 13px round `#e6e8eb` handles. Checkboxes: 13px squares, radius 4px, `up` filled / `1px border-raised` empty. Groups: Age, Market value, Market signal, Ownership, Dynasty label, Risk (3-up segmented), Min projected games (mono 18px + 5px meter). Last grid cell holds "Reset" (ghost) and "Apply · 47 players" (`bg up`, `color canvas`, 600) bottom-right.

**Table columns:** PLAYER · DYNASTY SCORE ↓ (mono 15/600 number + 6px meter + label text) · VS MARKET (mono 11px pill, `▲ +12% under` / `≈ aligned` / `▼ -9% over`) · CAREER PPG (sparkline bars) · NOW · NEXT (value + delta beneath) · RISK (three 16×5px pips + word) · OWNER (`up-text` when yours). Footer: "8 of 612 · sorted by dynasty score" + prev/next pager.

Sorted column header is `text` (not `muted`) with a `↓`.

## Screen: Player detail (pop-up)

Opens over the current surface from **any** player row anywhere in the app. Never a separate route.

**Shell:** fixed overlay, `inset: 0`, scrim `rgba(6,7,9,0.74)`, `padding: 26px`. Panel `max-width: 1320px`, `bg chrome`, `1px border-raised`, radius 14px, modal shadow, `display: flex; column`, `overflow: hidden`.

**Tab strip** (`padding: 10px 16px 0`, `bg canvas`, bottom border): one tab per open player — mono position tag + name + `×`. Active tab: `bg card`, `1px border`, `border-bottom` matching `card`, `margin-bottom: -1px`, radius `8px 8px 0 0`. Then "+ Add player to compare" (dashed, becomes `up-bg` when open) with a 250px dropdown of suggestions (name, meta, mono score). Far right: close `×`.

**Compare matrix** — renders only with ≥2 tabs. `padding: 12px 22px`, bottom border. Metric label column left, one column per player right-aligned in mono. Cell colour marks the winner: `up` better, `down` worse, `text-strong` when the metric has no direction. Metrics: Dynasty score, Market value, Age, PPG now, PPG next, Games proj., Consistency (`±sd`), Risk.

**Body** — `display: flex`, main column + 300px right rail, `overflow: auto`.

Main (`padding: 24px 28px`, `gap: 20px`):
- Identity row: 52px `chip` rounded square with mono position, name 24/700 `-0.02em`, meta 13px `muted` ("25 · CIN · season 5 · owned by you"), then "Compare" (ghost) and "Shop this asset" (`bg up`).
- Four tiles (same pattern as Portfolio, `padding: 13px 15px`, mono 21px): Dynasty score / Market value / Next season / Floor risk.
- **Career PPG · projection band** card: header + "career avg 18.9 · next season 22.1 ±3.4"; bars `height: 200px`, `gap: 10px`; historical seasons `slate`, latest `up`, projection `proj` and labelled `'26 proj`.
- Two-up row: **What drives the score** (five weighted components — 104px label, 6px meter, mono value, mono weight in `muted-2`, then an 11px `muted` explanation indented to `114px`) and **Why next season** (adjustment chips + "Closest career comps" rows: name, 5px match meter, mono `%`, and the outcome text right-aligned).

Right rail (`bg chrome`, left border, `padding: 22px 20px`, `gap: 18px`, mono 10px `muted-2` section heads, 1px `border` dividers):
- **POSITION IN PORTFOLIO** — mono 26px share + explanation. Reads "—" with a different note when the player is not yours.
- **SIGNALS** — 5px dot + 12/600 title + 11px body.
- **RANK THIS SEASON** — five peer rows; the current player's row gets `bg up-bg` and `up-text`.

---

# 2a — Decision desk

**Thesis:** the app's job is to tell you what to do and show its work. Home becomes a ranked stack of decisions; the dashboard demotes to a sidebar.

**Layout:** `grid-template-columns: 1fr 300px; gap: 24px; align-items: start`.

## Header
"Five calls on the table" 22/700, then a 13px `text-5` standing summary at `line-height: 1.6`, `max-width: 640px`:
> You are a contender with the second-most valuable roster and an ageing backfield. The window rewards trading age for the players who win you the next three years, and it rewards doing it before the deadline.

Regenerate this from posture + the top call each time the data refreshes.

## Decision card

Radius 11px. Collapsed: `bg card-quiet`, `1px border`. Expanded: `bg card`, `1px border-raised`, `0 8px 28px rgba(0,0,0,0.35)`.

**Header** (`padding: 14px 16px`, `gap: 12px`, `cursor: pointer`, toggles):
- Verb tag — mono 10px, `letter-spacing: 0.08em`, radius 4px, `padding: 3px 7px`. `SELL`/`RISK` = `down-bg-strong` on `down-text`; `BUY`/`CLAIM` = `up-bg-strong` on `up-text`; `HOLD` = `chip` on `text-3`.
- Name 15/700 + meta 12px `muted` on one baseline; headline 13px `text-3` beneath.
- Right block: expiry 11px `muted` above a confidence readout — mono number + 64×5px meter, fill `up` ≥70, `neutral` ≥55, else `down`.
- Chevron `▸`/`▾` in `muted-2`, 12px wide.

**Expanded body** (`padding: 2px 16px 16px`, `gap: 16px`):
1. **Evidence** — `repeat(3, 1fr); gap: 12px`. Each: `bg chrome`, `1px border`, radius 9px, `padding: 11px 13px`. Mono 10px uppercase label and mono 14/600 value on one row (value coloured by direction), 4px meter beneath, then 11px `text-5` note at `line-height: 1.5`. The note is the point — it says *why the number matters*, not what it is.
2. **Against block** — `bg #141210`, `1px solid down-border-soft`, radius 9px, `padding: 11px 13px`. Mono 10px `AGAINST` in `down-text` beside 12px `down-body` at `line-height: 1.6`. Every card has one; a card with no counter-case says so ("Nothing. Holding is right here…").
3. **Partners / cost / offers** — mono 10px `muted` section label, then rows: `1px border`, radius 8px, `padding: 9px 12px`, `bg chrome` — 12/600 name in a 150px box, 12px `text-5` detail, mono 11px fit metric right-aligned (`up` when good, `muted` otherwise). Label changes per verb: "TWO BUYERS WHO NEED A BACK", "WHAT IT COSTS", "WHERE THAT VALUE COULD GO", "CLAIM ORDER", "THE THREE OFFERS".
4. **Actions** — primary `bg up` / `color canvas` / 600, radius 8px, `padding: 8px 14px` (verb-specific: "Draft the offer", "Place the claim", "Decline all three", "See rebalancing options"); ghost "Open {shortName}"; then right-aligned "Not doing this" in 12px `muted`, which removes the card and increments the dismissed count.

Only one card is expanded at a time (clicking an open card's header collapses it). Default open: the highest-ranked call.

**Divider line** below the stack: two 1px rules with centred 12px `muted` text — "5 calls open · 0 dismissed · 9 other assets quiet".

**The five cards** (verb, subject, headline — full evidence, against-copy and partner rows are in the `DECISIONS` array in the HTML and should ship verbatim):
1. `SELL` Saquon Barkley — "Peak sale window is open, and it closes in about three weeks." conf 78, "Deadline in 19 days"
2. `BUY` Malik Nabers — "Model ranks him WR4 next season. The market prices him WR9." conf 71, "Owner is shopping now"
3. `RISK` Backfield concentration — "Two backs over 28 hold a third of everything you own." conf 66, "No deadline"
4. `CLAIM` Trey Benson — "Startable the moment the lead back misses a week. Nobody has claimed him." conf 55, "Waivers run Wednesday 3am"
5. `HOLD` Ja'Marr Chase — "Three offers came in this week. All of them under-pay by at least 1,200." conf 92, "Offers expire Sunday"

Note card 3 has no player subject — decisions can be structural. And card 5 exists so inbound offers get an explicit answer; "hold" is a decision, not the absence of one.

## Right rail (`300px`, `gap: 14px`)

1. **POSTURE** card — mono 10px head, "Contend now" 16/700, then a 6px `linear-gradient(90deg, #f2a13b, #3a414d, #4f8bff)` track with a 14px `#f2f3f5` marker (`2px solid canvas` ring) at the posture position, `Retool` / `Contend` end labels in 11px `muted`, then a 12px `text-5` explanation.
2. **VITALS** card — four rows, each `border-top: 1px solid border-row`, `padding: 9px 0`: 12px `text-5` label, mono 14/600 value, 11/600 delta in a 44px right-aligned box. Same four metrics as `1b`'s tiles, compressed. Footer link "Full breakdown in Portfolio".
3. **QUIET — NOTHING TO DO** card — outlined 11px pills of every asset the model and market agree on, plus a 11px `muted` explanation of why they are here. This is the counterweight to the decision stack: it makes silence explicit instead of leaving you wondering what was skipped.

---

# 2b — League map

**Thesis:** the missing frame is the other eleven rosters. Trades come from seeing the fit.

`flex-direction: column; gap: 18px`.

## Header
"League map" + "612 assets across 12 rosters · click any asset to see who would want it". Segmented control: **Age × value** / Model × market / Points × cost — three plot modes. Only Age × value is designed; the other two reuse the same shell with different scales.

## Scatter plot

Row: `grid-template-columns: 1fr 300px; gap: 18px`.

Card `padding: 18px 20px 14px`. Header: "Where value sits on the age curve" 13/600 and an inline legend (three 9px dots, 11px `muted`): filled `up` = Yours · `1.5px solid neutral` outline = Other rosters · `1.5px solid down` outline = Priced above model.

**Plot area:** 430px tall, `border-left` and `border-bottom` in `border`. A 46px gutter to the left holds y-axis ticks (mono 10px `muted-2`, absolutely positioned, `translateY(-50%)`).

- Scales: x = age, domain `20.2 → 34.4`; y = value, domain `0 → 10,300` inverted. Rookie picks plot at their expected rookie age (21) — deliberate: picks *are* the youngest assets.
- Gridlines at 10,000 / 7,500 / 5,000 / 2,500 / 0 in `gridline`; y ticks are formatted with thousands separators. X ticks at 21, 24, 27, 30, 33.
- **Quadrant dividers:** horizontal at value 5,000 (`top: 51%`), vertical at age 26.5 (`left: 43%`), both 1px `axis`.
- **Quadrant labels** in the four corners, mono 10px `muted`, `letter-spacing: 0.08em`, inset 9–10px: `APPRECIATING CORE` (top-left) · `SELL WINDOW` (top-right) · `LOTTERY TICKETS` (bottom-left) · `DEAD WEIGHT` (bottom-right). These are the interpretive key — keep them legible (≥4:1), they were too dark at first pass.
- **Dots:** absolutely positioned, `translate(-50%, -50%)`. Diameter 10px (others) / 12px (yours) / 15px (selected). Fill: `up-bg-strong` if yours, `#5a4522` if yours *and* overpriced, transparent otherwise. Ring is always `1.5px` and carries the market signal — `up` under model, `down` over model, `neutral` aligned — except the selected dot, whose ring is `#f2f3f5` with a `0 0 0 5px rgba(79,139,255,0.22)` halo.
- **Labels:** only high-value assets and the selection are labelled (11px, `text-5`; selected is `text` 600), placed to the right of the dot — except past x > 68% where the container flips to `row-reverse` so labels stay inside the plot. z-index: selected 6, labelled 4, rest 2.
- Caption under the x-axis: "Age · picks plotted at their expected rookie age".

**Selected-asset panel** (right, 300px): mono `SELECTED` head, name 17/700, meta line, then three stat rows (12px label, mono 13/600 value, 4px meter): Market value, Model vs market (`under model` / `over model` / `aligned` — direction only, no invented precision), Position on age curve (`rising` / `peak` / `falling`). Divider. **WHO WOULD WANT IT** — derived from the supply matrix: every manager with a deficit at that position, sorted by need, tagged `URGENT` (≤ −2, blue) or `NEED` (−1, neutral); falls back to "No roster is short here". Then a one-line call, branched on ownership × signal (four distinct strings — see `selCall` in the HTML). Then "Build an offer" (`bg up`, full width, centred).

## Supply and need matrix

Card `padding: 18px 20px`, `grid-template-columns: 1fr 300px; gap: 22px`.

Left: "Supply and need across the league" + "startable assets above replacement, by position". Grid `172px repeat(5, 1fr)`, `gap: 6px`, column heads QB / RB / WR / TE / PICKS in mono 10px `muted`. Twelve rows, `padding: 5px 8px`, radius 7px, `cursor: pointer`, `gap: 3px` between rows.
- Your row is marked with a trailing `·` and `up-text` 600 on `row-self`; the selected row is `row-active`.
- Cells: mono 11px, centred, radius 5px, `padding: 4px 0`. `+2` → `up-bg-strong` · `+1` → `up-bg-soft` · `0` renders as `·` on `chip` in `muted` · `−1` → `down-bg-soft` · `−2` → `down-bg-strong`. Positive values in `up-text`, negative in `down-text`.
- Legend: three 14×8px swatches — "Surplus to trade from / Balanced / Needs help".

Right (left border, `padding-left: 22px`): **FIT WITH** — manager name 16/700, "3 surplus positions · 2 needs" meta, then a 12px `text-3` assessment at `line-height: 1.65` (written per manager, including the dead ends — "Bowers is the one asset you should never sell, which makes this a dead end"). Divider. **SHAPE OF A DEAL** — two stacked blocks (`1px border`, radius 8px, `bg chrome`, `padding: 10px 12px`): `YOU SEND` in mono 10px `down-text`, `YOU GET` in mono 10px `up-text`, each over 12px `text-strong` content. Below: "Value gap" label, 4px meter, mono gap figure in `up-text`.

---

## Interactions & behaviour

| Where | Trigger | Result |
| --- | --- | --- |
| Any player row, any surface | click row | opens the detail pop-up as a tab |
| Detail tab strip | "+ Add player to compare" | opens a 250px suggestion dropdown; picking appends a tab |
| Detail tab strip | click tab / click `×` | switches active / closes that tab (closing the last one closes the pop-up) |
| Detail pop-up | ≥2 tabs open | compare matrix appears above the body, winners coloured per metric |
| Market | "+ Add filter" | expands the filter panel; Apply and Reset both collapse it |
| 2a card header | click | expands that card, collapses any other |
| 2a card | "Not doing this" | removes the card, updates the "N calls open · N dismissed" line |
| 2b scatter | click dot | selects the asset; panel, wanters list and call all recompute |
| 2b matrix | click row | selects the manager; fit text and deal shape recompute |

No transitions are specified in the mock. Use the codebase's existing durations; if none, `120ms ease-out` on background/border, `180ms ease-out` on card expansion. Do not animate the scatter dots on selection beyond the halo.

Nothing in these designs is hover-dependent for meaning. Add hover affordances (row background lift to `#181b21`, pointer cursor) but keep every value readable at rest.

## State

```
view            'portfolio' | 'market' | 'map'      which surface
columnSet       'value' | 'outlook' | 'production'  Market column set
positionFilter  'all' | 'QB' | 'RB' | 'WR' | 'TE'
filters         { ageRange, valueRange, signals[], ownership[], labels[], risk[], minGames }
filtersOpen     boolean
tabs            string[]        open player ids in the detail pop-up
activeTab       string | null   null closes the pop-up
searchOpen      boolean         compare-search dropdown
expandedCall    string | null   2a — one open decision card
dismissedCalls  string[]        2a
selectedAsset   string          2b — scatter selection
selectedManager string          2b — matrix selection
```

Derived, not stored: compare matrix (from `tabs`), wanters list (from `selectedAsset` position × matrix deficits), quiet-asset list (assets with no open call), posture, all meter widths.

**Data the designs assume the API can provide** — worth checking before build:
- per-asset market value **and** a model value, so "vs model" is a real number rather than a direction
- 30-day value change per asset
- projected games and a per-game SD
- weighted score components with weights (age-adjusted, trajectory, current level, opportunity, reliability)
- per-manager positional strength above replacement, for the matrix
- inbound trade offers, for the `HOLD` card in 2a

The last two do not exist in the current app. `2b`'s matrix and `2a`'s offers card both depend on them.

## Assets

None. No images, no icon fonts, no SVG illustration. Every glyph is a Unicode character already in the copy (`▲ ▼ ↑ ↓ → · × ⌘ ▾ ▸ ⚡ ⚠`) and every chart is CSS boxes. Fonts are Google-hosted Public Sans and IBM Plex Mono; self-host them in the app.

## Files in this bundle

| File | What it is |
| --- | --- |
| `Sleeper Dashboard.dc.html` | All four designs. Sections top to bottom: turn 2 (`2a`, `2b`), then turn 1 (`1a` current, `1b` redesign). Ids `1a`/`1b`/`2a`/`2b` are on the wrapper divs. |
| `support.js` | The prototype's template runtime. **Not for reuse** — present only so the HTML opens in a browser. |
| `github.md` | Repo pointer and the screen → source-file map for the current UI. |

Open the HTML directly in a browser to click through it.

## Repo mapping

The current-UI recreation (`1a`) was built from these files; they are what `1b` replaces:

| Surface | Repo files |
| --- | --- |
| Players → Value | `src/components/PlayersTab.jsx`, `src/components/players/PlayersDataTable.jsx`, `src/components/players/PlayersSurface.jsx` |
| Players → Outlook | `src/components/players/OutlookTab.jsx`, `src/components/ui/ExpandableTableRow.jsx` |
| Players → NFL stats | `src/components/players/NflStatsTab.jsx` |
| Player profile panel | `src/components/PlayersTab.jsx` (`PlayerProfile`), `src/components/SpiderChart.jsx`, `src/components/AdvancedStatsPanel.jsx` |
| App chrome | `src/components/shell/AppShell.jsx`, `TopBar.jsx`, `NavRail.jsx`, `navItems.js`, `src/index.css`, `src/theme.js` |

Notes for the port:
- The three-level nav (`navItems.js` + primary tabs + secondary pills) collapses to a flat rail. `NavRail.jsx` keeps its role; the tab and pill layers go away.
- `PlayerProfile` moves from an inline panel to the pop-up. It should be mountable from any row in any surface, so it needs to live above the surface components, not inside `PlayersTab`.
- `SpiderChart.jsx` is not used in the redesign — the radar is replaced by the weighted component bars, which show the weights the radar hid.
- `PlayersDataTable.jsx` becomes one table with swappable column sets rather than three tables.
- The current palette's red/green (`#22c55e`, `#ef4444`, `#86efac`, `#fecaca`, and the `LABEL_COLORS` greens) is replaced wholesale by the blue/amber pair. Search `src/index.css` and `theme.js` for those before starting.
