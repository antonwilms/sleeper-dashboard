# Value-tab: market-edge dot · augmented Career cell · nav-rail collapse

**Session 1 (opus) plan — for sonnet implementation. Three minimal, view-only enhancements
to Players → Dynasty → Value (the Explorer, `PlayersTab`).** All three are display-only and
must not move `projectedPPG` or the dynasty score (see CLAUDE.md *Capture-only* /
*Advstats are display-only* invariants — the same "never feeds projection/scoring" pattern as
Ceiling/Floor in `seasonRanks.js`). No projection/scoring module is touched.

---

## 0. Live-source confirmations & doc-drift flags

Read these before implementing; they pin down shapes the prompt referenced.

- **`divergenceSignal` shape (confirmed).** `computeMarketDivergence` (`src/utils/dynastyScore.js:410–449`)
  adds `{ divergence, divergencePct, divergenceSignal, dynRank, ktcRank, positionDepth }` to every
  row that has **both** `dynastyScore.score` and `ktcValue`. Rows missing either are returned
  **unchanged** → those rows have **no `divergenceSignal` key at all** (`undefined`, not `null`).
  Values: `'undervalued'` (`divergencePct > 25` → model ranks the player higher than KTC → **buy**),
  `'overvalued'` (`divergencePct < -25` → market ranks higher → **sell**), or `null` (within ±25 →
  **aligned**). It is produced in pipeline step 5 (`playerRowsFinal`) and reaches `PlayersTab` rows;
  the Explorer filter already reads `row.divergenceSignal` (`PlayersTab.jsx:1914–1915`), so it is
  confirmed present on rows. **Reuse it directly — do not recompute.**
- **careerStats per-season shape (confirmed).** `careerStats[season][playerId] = { fantasyPoints,
  gamesPlayed, … }`; season keys are numeric-string years. Same fields `seasonRanks.js` and the
  App.jsx row loop already read.
- **2012 floor (confirmed).** Ingestion starts at 2012 (`src/api/sleeperStats.js:240`
  `for (let s = 2012; s < currentSeason; s++)`). **careerStats alone cannot detect a pre-2012 debut**
  — the earliest key is always ≥ 2012. Only Sleeper `years_exp` reveals it (see Feature 2).
- **Market tokens (confirmed) + one minor cosmetic note.** `src/index.css:35–39`:
  `--color-market-up: var(--c-green-600)`, `--color-market-down: var(--c-red-600)`,
  `--color-market-neutral: var(--color-text-faint)`. The green/red primitives have `.dark`
  overrides (`index.css:261,269`) and `--color-text-faint` has one too, so the dot resolves in both
  themes — **no new token needed.** ⚠️ **Cosmetic note, not drift:** the existing peek renders
  *overvalued* in **orange** (`c-orange-*`, `PlayersTab.jsx:1210`, `:992`) while this dot uses the
  **market-down (red)** token as the prompt mandates. Slightly different hue from the peek; this is a
  deliberate token-discipline choice — flag, don't "fix" by inventing a token.
- **⚠️ Career-PPG definition divergence (important).** The prompt defines career PPG as
  **total points ÷ total games** (volume-weighted). The existing Profile "career avg"
  (`usePlayerProfile.js:58–61`) is the **mean of per-season PPGs** (average-of-averages). These differ
  for players with uneven games/season. We implement the prompt's total/total definition for the new
  Explorer figure and label it plainly; we do **not** touch the Profile metric. Noted so the
  reviewer/implementer doesn't "reconcile" them.
- **No 12th headed column.** The Explorer has 11 headed columns + 2 unlabeled utility columns
  (chevron, compare) = 13 `<col>` entries, `colSpan={13}` (`PlayersTab.jsx:2003–2017, 2058, 2207`).
  Neither the dot nor the career figure adds a column — the dot lives inside the **Player** cell, the
  figure inside the **Career** cell. `colgroup`/`colSpan`/`thead` are unchanged except an optional
  Career `<col>` width bump (Feature 2).

---

## Feature 1 — Market-edge dot (direction-only cue, in the Player cell)

**Intent.** A small colored dot encoding **direction only** (buy / sell / aligned), reusing
`row.divergenceSignal`. Magnitude stays in the peek (`PlayersTab.jsx:969–1003, 1201–1214`). The dot
goes in the **Player** name cell — far from the KTC cell's ~30-day Δ — so momentum and edge stay
visually distinct (prompt requirement). This is the "small colored dot in a narrow indicator slot"
form (the slot is the leading edge of the Player cell), **not** the full-row-border fallback.

**Signal → token → meaning (the only mapping; no parallel logic):**

| `row.divergenceSignal` | dot color token | meaning | tooltip |
|---|---|---|---|
| `'undervalued'` | `--color-market-up` | model above market → **buy-low** | "Model values above market (buy-low)" |
| `'overvalued'` | `--color-market-down` | model below market → **sell-high** | "Model values below market (sell-high)" |
| `null` | `--color-market-neutral` | model & market aligned | "Model & market aligned" |
| `undefined` (no KTC or no dyn score) | *(render nothing)* | not enough data | — |

The neutral case **does** render a (faint, since `market-neutral` = `text-faint`) dot so "aligned"
reads differently from "no data" — the 4-state encoding the prompt asked for.

### Edits — `src/components/PlayersTab.jsx`

1. **New presentational sub-component `MarketEdgeDot`** — add beside the other inline cell
   components (next to `CareerSparkline`/`CeilingFloorCell`, ~`:15–86`). Pure, state-free,
   un-exported (mirrors the untested-internal-cell precedent of `CeilingFloorCell`).

   ```jsx
   // Direction-only market-edge cue. Reuses row.divergenceSignal (computeMarketDivergence);
   // computes nothing. undefined signal (missing KTC/dyn score) → renders null.
   function MarketEdgeDot({ signal }) {
     if (signal === undefined) return null
     const meta = signal === 'undervalued'
       ? { color: 'var(--color-market-up)',      label: 'Model values above market (buy-low)' }
       : signal === 'overvalued'
       ? { color: 'var(--color-market-down)',    label: 'Model values below market (sell-high)' }
       : { color: 'var(--color-market-neutral)', label: 'Model & market aligned' }
     return (
       <Tooltip content={meta.label} position="top">
         <span aria-label={meta.label}
           className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
           style={{ backgroundColor: meta.color }} />
       </Tooltip>
     )
   }
   ```

2. **Render it at the start of the Player cell** — the Player `<td>` is `PlayersTab.jsx:2128–2140`.
   Wrap the name line so the dot sits inline before the name (keeps `truncate`):

   *Before (`:2129–2130`):*
   ```jsx
   <td className="py-2 px-3 min-w-0">
     <div className="font-medium truncate">{row.full_name}</div>
   ```
   *After:*
   ```jsx
   <td className="py-2 px-3 min-w-0">
     <div className="flex items-center gap-1.5 min-w-0">
       <MarketEdgeDot signal={row.divergenceSignal} />
       <span className="font-medium truncate">{row.full_name}</span>
     </div>
   ```
   The meta sub-line (`:2131–2139`) is unchanged.

No colgroup/header/colSpan change. `Tooltip` is already imported in `PlayersTab.jsx`.

---

## Feature 2 — Augmented Career cell (career PPG + since-2012 honesty)

**Intent.** One consolidated track-record figure **beside** the existing 5-bar sparkline, inside the
existing **Career** cell (`PlayersTab.jsx:2156–2157`). Primary = **career PPG** (total pts ÷ total
games, since 2012). Secondary (total pts, total GP, seasons) lives in a **tooltip** (consistent with
`CeilingFloorCell`'s tooltip detail and the Profile "Career: pts" tooltip at `:1162–1163`; chosen
over a sub-line to keep the narrow Career column compact). A trailing muted **`*`** flags
careers truncated by the 2012 floor.

**Truncation detection (exact).** A career is truncated iff the player debuted before 2012. Detect
with Sleeper `years_exp` (already on the row as `row.years_exp`, `App.jsx:374`):
`firstSeason = currentSeason − years_exp`; **truncated** = `years_exp != null && firstSeason < 2012`.
- `years_exp` exactly at the 2012 boundary (`firstSeason === 2012`) → **not** truncated (full career captured).
- `years_exp == null` → cannot determine → **not** flagged with `*`, but the tooltip's "since 2012"
  wording still keeps the figure honest for everyone.
- rookies (`years_exp === 0`, no career rows) → `careerPPG` null → cell shows the sparkline only.
- ⚠️ `years_exp` is Sleeper-sourced and can be off by ±1 for some veterans — acceptable for a
  display affordance; documented as a known limitation, not a correctness blocker.

### 2a. New pure util — `src/utils/careerSummary.js` (NEW FILE)

Filename avoids ad-blocker-triggering tokens per CLAUDE.md (no `track`/`ad`/`analytics`).
Pure, view-only, leaf module (imports nothing) — the `seasonRanks.js` model.

```js
// Pure, view-only career aggregate over careerStats (since the 2012 ingestion floor).
// Never feeds projection/scoring. ppg is volume-weighted: totalPts / totalGP — deliberately
// different from usePlayerProfile's mean-of-season-PPG "career avg".
//
// @param careerStats {object|null}  { [season]: { [playerId]: { fantasyPoints, gamesPlayed } } }
// @param playerId    {string}
// @param opts {{ currentSeason:number, yearsExp:number|null, floorSeason?:number }}
// @returns {{ totalPts:number, totalGP:number, seasonsPlayed:number,
//             ppg:number|null, firstSeason:number|null, truncated:boolean }}
export function computeCareerSummary(careerStats, playerId, { currentSeason, yearsExp, floorSeason = 2012 } = {}) {
  let totalPts = 0, totalGP = 0, seasonsPlayed = 0
  for (const seasonData of Object.values(careerStats ?? {})) {
    const d = seasonData?.[playerId]
    if (d?.gamesPlayed > 0) { totalPts += d.fantasyPoints; totalGP += d.gamesPlayed; seasonsPlayed += 1 }
  }
  const ppg = totalGP > 0 ? totalPts / totalGP : null
  const firstSeason = (yearsExp != null && currentSeason != null) ? currentSeason - yearsExp : null
  const truncated = firstSeason != null && firstSeason < floorSeason
  return { totalPts, totalGP, seasonsPlayed, ppg, firstSeason, truncated }
}
```

### 2b. Wire into the row loop — `src/App.jsx`

The base `playerRows` loop is `App.jsx:314–386` (`mostRecentSeason` defined `:277`). Currently
`careerTotalPts` is summed inline (`:328–333`). Replace that inline block with a `computeCareerSummary`
call and add the new fields — this consolidates rather than forks the totals (keeps `careerTotalPts`
byte-identical, adds GP/seasons/ppg/truncation).

- **Import** (top of `App.jsx`, with the other util imports):
  `import { computeCareerSummary } from './utils/careerSummary'`
- *Before (`:328–333`):*
  ```js
  let careerTotalPts = 0
  for (const seasonData of Object.values(careerStats)) {
    const d = seasonData[playerId]
    if (d?.gamesPlayed > 0) careerTotalPts += d.fantasyPoints
  }
  careerTotalPts = Math.round(careerTotalPts * 10) / 10
  ```
- *After:*
  ```js
  const careerSummary = computeCareerSummary(careerStats, playerId, {
    currentSeason: mostRecentSeason, yearsExp: info.years_exp,
  })
  const careerTotalPts = Math.round(careerSummary.totalPts * 10) / 10  // unchanged rounding
  ```
- **Add to the pushed row object** (`:368–385`, alongside `careerTotalPts`/`careerSparkline`):
  ```js
  careerPPG:       careerSummary.ppg,            // number|null (total pts / total GP, since 2012)
  careerTotalGP:   careerSummary.totalGP,        // number
  careerSeasons:   careerSummary.seasonsPlayed,  // number
  careerTruncated: careerSummary.truncated,      // boolean
  careerFirstSeason: careerSummary.firstSeason,  // number|null
  ```
  (`careerTotalPts` and `careerSparkline` stay as-is.)

These are pure functions of `careerStats` + `years_exp`; they sit in step 1 of the pipeline and feed
nothing downstream of the Explorer cell (no projection/score path reads them).

### 2c. New cell component + render — `src/components/PlayersTab.jsx`

1. **New `CareerCell`** beside `CareerSparkline` (~`:41`). Pure, un-exported.

   ```jsx
   // Sparkline + consolidated career track-record figure (ppg primary; totals/seasons in tooltip;
   // '*' marks careers truncated by the 2012 ingestion floor). Display-only.
   function CareerCell({ row }) {
     const { careerPPG, careerTotalPts, careerTotalGP, careerSeasons, careerTruncated, careerFirstSeason } = row
     const detail = careerPPG == null ? null : (
       <>{careerTotalPts.toLocaleString()} pts · {careerTotalGP} G · {careerSeasons} szn (since 2012)
       {careerTruncated && careerFirstSeason != null
         ? ` — debuted ~${careerFirstSeason}; pre-2012 not counted` : ''}</>
     )
     return (
       <div className="flex items-center gap-2">
         <CareerSparkline values={row.careerSparkline} />
         {careerPPG != null ? (
           <Tooltip content={detail} position="top">
             <span className="text-xs tabular-nums text-[var(--color-text-secondary)] cursor-help whitespace-nowrap">
               {careerPPG.toFixed(1)}
               {careerTruncated && <span className="text-[var(--color-text-faint)]">*</span>}
             </span>
           </Tooltip>
         ) : (
           <span className="text-[var(--color-text-faintest)] text-xs">—</span>
         )}
       </div>
     )
   }
   ```

2. **Swap the Career `<td>` body** (`:2156–2157`):
   *Before:* `<td className="py-2 px-3"><CareerSparkline values={row.careerSparkline} /></td>`
   *After:*  `<td className="py-2 px-3"><CareerCell row={row} /></td>`

3. **Widen the Career `<col>`** (`:2011`) from `100px` → `124px` to fit sparkline + number
   (still no new column; `colgroup` count unchanged).

Header/tooltip for the Career column (`:2031–2035`) may optionally gain "· career PPG since 2012"
in its tooltip text — see Docs updates (it's a doc/affordance tweak, not required for function).

---

## Feature 3 — Nav-rail collapse/expand toggle (persisted)

**Intent.** A collapse/expand toggle on the **desktop left rail** (`NavRail`), persisted to
`localStorage`, mirroring the existing chrome-toggle pattern (theme/tooltips: state in `App.jsx`,
forwarded through `AppShell` as `value` + `onToggle` props — keeps `AppShell` "pure chrome, owns no
state"). No drag-to-resize. Mobile `BottomTabBar` is unaffected. Default = **expanded** (so existing
`AppShell.test.jsx` IA assertions keep passing).

`navItems.js` has **no icons** (only `key`/`label`/`path`), so the collapsed rail shows each item's
**first-letter initial** centered, with the full label in a `Tooltip` + `aria-label` for
accessibility.

### 3a. State in `App.jsx` (owner) — mirror `tooltipsEnabled`

- **Add LS constant** (with `:49–52`): `const LS_NAV_COLLAPSED = 'nav-collapsed'`
- **Add state** (next to `tooltipsEnabled`, `:100–105`):
  ```js
  const [navCollapsed, setNavCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_NAV_COLLAPSED)) ?? false } catch { return false }
  })
  ```
- **Add toggle** (next to `handleToggleTooltips`, `:107–113`):
  ```js
  function handleToggleNav() {
    setNavCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(LS_NAV_COLLAPSED, JSON.stringify(next)) } catch {}
      return next
    })
  }
  ```
- **Pass to `AppShell`** (render block `:914–924`): add `navCollapsed={navCollapsed}` and
  `onToggleNav={handleToggleNav}`.

### 3b. Forward through `AppShell` — `src/components/shell/AppShell.jsx`

- Add `navCollapsed` + `onToggleNav` to the props destructure (`:5–16`).
- Forward to NavRail (`:31`):
  `{showNav && <NavRail showRookies={showRookies} collapsed={navCollapsed} onToggle={onToggleNav} />}`
- No state added — `AppShell` stays pure.

### 3c. Collapse behavior — `src/components/shell/NavRail.jsx`

Rewrite `NavRail` (`:4–39`) to accept `{ showRookies, collapsed = false, onToggle }` (default
`collapsed=false` so callers that don't pass it — e.g. `AppShell.test.jsx` — stay expanded):

- **Width:** `nav` className `w-40` → `${collapsed ? 'w-14' : 'w-40'}`. Keep `hidden md:flex flex-col
  shrink-0 border-r pt-4 gap-1` (desktop-only; rail is `shrink-0` so `<main>` reflows automatically).
- **Toggle button** as the first child of `<nav>` (desktop-only since the whole rail is `hidden md:flex`):
  ```jsx
  <button onClick={onToggle}
    aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'} aria-expanded={!collapsed}
    className="self-end mr-2 mb-1 px-2 py-1 text-xs rounded text-[var(--color-text-faint)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)]">
    {collapsed ? '»' : '«'}
  </button>
  ```
- **Each primary item + the League link:** when `collapsed`, render `item.label[0]` centered
  (`justify-center px-0`) wrapped in `<Tooltip content={item.label} position="right">`, and add
  `aria-label={item.label}` on the `NavLink`; when expanded, render `item.label` as today. Keep the
  active/inactive class logic identical. The League link uses `'L'` collapsed.
- The `<div className="border-t my-2 mx-4" />` divider stays (optionally `mx-2` when collapsed).

This is the only structural change; routing, active styling, and the rookies branch are otherwise
unchanged.

---

## Edits grouped by file (quick index)

- **`src/utils/careerSummary.js`** *(NEW)* — `computeCareerSummary` (Feature 2a).
- **`src/App.jsx`** — import `computeCareerSummary`; add `LS_NAV_COLLAPSED` (`~:52`);
  replace inline `careerTotalPts` loop (`:328–333`) with the util call; add 5 career row fields
  (`:368–385`); add `navCollapsed` state + `handleToggleNav` (`~:100–113`); pass two props to
  `AppShell` (`:914–924`).
- **`src/components/PlayersTab.jsx`** — add `MarketEdgeDot` (Feature 1) + `CareerCell` (Feature 2c)
  sub-components (~`:15–86`); dot into Player cell (`:2129–2130`); `CareerCell` into Career `<td>`
  (`:2156–2157`); Career `<col>` width `100px`→`124px` (`:2011`); optional Career header tooltip text.
- **`src/components/shell/AppShell.jsx`** — destructure + forward `navCollapsed`/`onToggleNav`
  (`:5–16, :31`).
- **`src/components/shell/NavRail.jsx`** — `collapsed`/`onToggle` props, width swap, toggle button,
  initials-when-collapsed (`:4–39`).

---

## Docs updates

Apply mechanically.

### `docs/ui.md`
1. **Columns table — Player row (`:66`).**
   *Before:* `| **Player** | Name + sub-line: \`POS · age · TEAM · Nyr\` |`
   *After:* `| **Player** | A leading **market-edge dot** (buy/sell/aligned — see below) + name + sub-line: \`POS · age · TEAM · Nyr\` |`
2. **Columns table — Career row (`:69`).**
   *Before:* `| **Career** | 5-bar sparkline (last 5 seasons) |`
   *After:* `| **Career** | 5-bar sparkline (last 5 seasons) + **career PPG** (total pts ÷ total games, **since 2012**); totals/GP/seasons in tooltip; trailing \`*\` flags careers that began before the 2012 ingestion floor |`
3. **New paragraph after the Ceiling/Floor note (`:80`)** (heading "Columns (13 total)" stays — no new column):
   ```
   **Market-edge dot.** The Player cell carries a small colored dot encoding the model-vs-market
   *direction only*: green (`--color-market-up`) = model values the player above KTC consensus (buy-low),
   red (`--color-market-down`) = below consensus (sell-high), faint neutral (`--color-market-neutral`) =
   aligned; no dot when KTC or dynasty score is missing. It reuses `divergenceSignal`
   (`computeMarketDivergence`) — the same signal behind the Profile market chips — and computes nothing.
   Magnitude (the exact Our-rank vs KTC-rank gap) stays in the Player Profile peek; the dot is direction
   only, kept in the Player cell so it stays visually separate from the KTC cell's 30-day Δ.

   **Career PPG (since 2012).** Beside the sparkline, the Career cell shows volume-weighted career PPG
   (total fantasy points ÷ total games across all covered seasons), with total points · games · seasons
   in the tooltip. Because ingestion floors at 2012, "career" means "career since 2012"; a player whose
   first NFL season (`currentSeason − years_exp`) predates 2012 gets a trailing `*` and a tooltip note
   that pre-2012 production isn't counted. Display-only (`src/utils/careerSummary.js`); never feeds
   projection or dynasty score. Note: this total/total PPG deliberately differs from the Profile's
   mean-of-seasons "career avg".
   ```
4. **Navigation & surfaces — `NavRail` collapse (`:19`).** Append to the paragraph:
   "The desktop left rail has a collapse/expand toggle (initials-only when collapsed, full labels in
   tooltips); the collapsed state persists in `localStorage['nav-collapsed']` (default expanded)."

### `docs/architecture.md`
5. **localStorage keys table (`:30–38`)** — add a row:
   `| \`nav-collapsed\` | \`"true"\` or \`"false"\` (default false) — desktop nav-rail collapsed state |`
6. **Key React state in App table (`:44–62`)** — add a row:
   `| \`navCollapsed\` | \`boolean\` | Desktop nav-rail collapsed; default false; persisted in \`localStorage['nav-collapsed']\`; forwarded through \`AppShell\` to \`NavRail\` |`

### `CLAUDE.md`
7. **`src/utils/` table** — add a row:
   `| \`careerSummary.js\` | \`computeCareerSummary\` — pure, view-only career aggregate over careerStats since the 2012 floor (totalPts/totalGP/seasonsPlayed/ppg + pre-2012 truncation via \`years_exp\`); ppg is volume-weighted (total/total), distinct from usePlayerProfile's mean-of-seasons avg. Explorer Career cell only; never feeds projection/scoring |`
8. **`src/components/` — `PlayersTab.jsx` row.** Append to its cell:
   "Value tab also adds a direction-only market-edge dot (reuses `divergenceSignal`) in the Player
   cell and a career-PPG-since-2012 figure in the Career cell (`careerSummary.js`) — both display-only."
9. **`src/components/` — shell row** (`shell/{TopBar,NavRail,…}` line). Append:
   "`NavRail` has a localStorage-persisted (`nav-collapsed`) collapse/expand toggle; state owned by
   App.jsx and forwarded through AppShell."
10. **Routing / IA — "Nav chrome" paragraph** (the `NavRail` + `BottomTabBar` sentence). Append:
    "The desktop rail collapses/expands (persisted to `localStorage['nav-collapsed']`)."

### `README.md`
11. **File-tree comment for `NavRail.jsx` (`:101`).**
    *Before:* `NavRail.jsx       # Desktop left-rail nav (md+); four primary + League + seasonal Rookies`
    *After:* `NavRail.jsx       # Desktop left-rail nav (md+); four primary + League + seasonal Rookies; collapse/expand toggle (localStorage 'nav-collapsed')`
    (No other README change — README's `PlayersTab.jsx` line `:127` is a one-line surface descriptor
    that doesn't enumerate columns, so it needs no edit.)

### `docs/signal-registry.md`
**No change.** This adds no raw source, computed `factors` entry, ephemeral capture, or coverage
status — career PPG is a pure display derivation of already-registered `fantasyPoints`/`gp`, and the
market dot reuses already-registered divergence. (Self-maintenance signal/factor trigger does not fire.)

---

## Tests to add

1. **`src/utils/careerSummary.test.js`** (co-located unit, the `seasonRanks.test.js` model).
   Cover `computeCareerSummary`:
   - **Multi-season totals + volume-weighted ppg.** `careerStats = { 2013:{p1:{fantasyPoints:200,gamesPlayed:16}}, 2014:{p1:{fantasyPoints:150,gamesPlayed:10}} }`, `opts={currentSeason:2025, yearsExp:12}` → `totalPts:350, totalGP:26, seasonsPlayed:2, ppg:350/26 (≈13.4615)`, `firstSeason:2013, truncated:false`.
   - **gamesPlayed:0 season excluded** from all three totals.
   - **Missing player / null careerStats** → `{ totalPts:0, totalGP:0, seasonsPlayed:0, ppg:null, ... }` (ppg null, no throw).
   - **Single season.**
   - **Truncation true:** `yearsExp:14, currentSeason:2025` → `firstSeason:2011, truncated:true`.
   - **Truncation boundary false:** `yearsExp:13, currentSeason:2025` → `firstSeason:2012, truncated:false`.
   - **`yearsExp:null`** → `firstSeason:null, truncated:false`.
   - **rookie `yearsExp:0`** → `firstSeason:currentSeason, truncated:false`.
   - **custom `floorSeason`** honored.
2. **`src/components/shell/NavRail.test.jsx`** (NEW; co-located with `AppShell.test.jsx`, same
   jsdom + RTL + `MemoryRouter` harness). Render `NavRail` directly:
   - **expanded (`collapsed={false}`)**: full labels "Board/Roster/Players/Trade/League" present; toggle button has `aria-label="Collapse navigation"`.
   - **collapsed (`collapsed={true}`)**: full label text absent (e.g. `queryByText('Players')` null), initials present, toggle `aria-label="Expand navigation"`; each link still has accessible name via `aria-label` (`getByLabelText('Players')`).
   - **toggle fires**: click the toggle button → `onToggle` called once (vi.fn).
   - **default expanded**: render with no `collapsed` prop → labels visible (guards the AppShell.test contract).
   *(If preferred, these can extend `AppShell.test.jsx` instead by passing `navCollapsed`; a dedicated
   `NavRail.test.jsx` is cleaner. Either is acceptable — pick one.)*
3. **Market-edge dot & `CareerCell`** — **no dedicated test.** Both are presentational internal cells
   (the `CeilingFloorCell`/`CareerSparkline` precedent — internal Explorer cells are not unit-tested;
   `PlayersTab.jsx` has no test harness). The dot reuses the already-tested `divergenceSignal`
   (`dynastyScore.test.js`) and the career numeric/truncation logic is fully covered by
   `careerSummary.test.js` (#1). State this explicitly rather than standing up a `PlayersTab` harness.

No contract test (`src/__tests__/`) is needed — nothing here touches `factors`, stat keys, advstats,
or schedule view-only guards.

---

## Cross-repo impact

**None.** All three changes are app-side and view-only: the dot reuses an existing in-app computed
field, the career figure is a pure function of already-loaded `careerStats` + Sleeper `years_exp`, and
the nav toggle is local UI chrome state. No data-store shape, snapshot schema, manifest, or
`MAX_SUPPORTED_SCHEMA` is touched; `sleeper-dashboard-data` needs no mirror.

---

## Done-definition (for the sonnet session)

1. `npm test` green (incl. new `careerSummary.test.js` + nav-rail tests).
2. `npm run lint` — 0 problems.
3. `npm run build` — clean, no warnings.
4. Apply all Docs updates in the same change (CLAUDE.md self-maintenance rule).
5. **Do not** start the dev server / run any visual smoke — hand back for the user's manual
   light+dark check (token/theme-touching work).
