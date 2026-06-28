Deep reference for the Explorer, Player Profile panel, and shared UI components.

## Features

### Persistent session

Username and league selection are saved to `localStorage`. On return visits the app skips the username form and loads straight into the last league. A sticky header bar shows avatar, display name, and league name with a **Switch** link.

A **light/dark theme toggle** sits beside the tooltips toggle in the header; default dark, persisted to `localStorage['theme']`.

A **Tooltips on/off** toggle in the header persists in `localStorage` (default: on). When off, `Tooltip` renders children with no wrapper — zero overhead.

### League selection

Enter a Sleeper username to fetch all leagues for the current season. Each league card shows scoring format (PPR / Half PPR / Standard), team count, and status.

### Navigation & surfaces

The app uses a persistent nav shell (`AppShell`) with a **desktop left rail** (`NavRail`) and a **mobile bottom tab bar** (`BottomTabBar`). Four primary surfaces are always available once a league is loaded:

| Surface | Route | Status |
|---|---|---|
| **Board** | `/board` | Gated placeholder — requires marginal-value engine + season-phase classifier (slice 5) |
| **Roster** | `/roster` | The former "My Team" view — current-week projections + next-season outlook |
| **Players** | `/players` | The Explorer (default landing until Board lands) |
| **Trade** | `/trade` | Gated placeholder — requires marginal-/phase-aware trade evaluator (slice 5) |

The secondary **League** group (`/league/:view`) covers Standings, Schedule, and Rosters. Reached via the "League" entry in the desktop rail or a small affordance in the top bar on mobile.

A seasonal **Rookies** slot (visible Jan–May only) is reserved in the nav; the route and board land in slice 7.

The **Players** surface hosts a two-level intra-surface tab shell: primary tabs **Dynasty** | **Weekly** (underline-active), and under Dynasty the secondary tabs **Value** | **Outlook** | **NFL stats** (pill). **Value** is the default and is the Player Explorer (below). **Outlook** is a next-season-projection + usage-trend table with an expandable per-season usage history (see *Outlook tab* below). **NFL stats** is a position-split season-average table with an expandable per-game game log (see *NFL stats tab* below). **Weekly** is a gated placeholder (weekly rankings & matchup engine, Sleeper projections). Both tab selections persist to `localStorage` — `players-view` and `players-dynasty-tab` — and the route stays `/players` (these are not nav-shell entries). Implemented by `src/components/players/PlayersSurface.jsx`.

### Roster surface (formerly My Team)

Shows current-week projections, last-week actuals, 4-week average, and a 4-bar trend sparkline per player.

**Roster enhancements:**
- **Sort toggle**: switch between _This Week_ (by current projection) and _Next Season_ (by `projectedPPG`).
- **Per-player next-season line**: "Next season: ~X.X PPG · ~N pts" with a confidence badge (`high` / `med` / `low` / `rookie`).
- **Roster total**: sum of all projected PPG for the upcoming season displayed at the top of the roster.

### League group

Standard dynasty views, reached via `/league/:view`:
- **Standings** — season record, points for/against, rank
- **Schedule** — weekly matchup grid with win/loss colouring
- **Rosters** — all-league rosters grouped by position with Starter/Bench/IR badges

---

## Player Explorer

The Explorer is the **Players → Dynasty → Value** tab (the default tab of the Players surface). It renders `PlayersTab` unchanged; everything below describes that tab.

Searchable, filterable, sortable table of skill-position players. Ghost entries (retired, no-data, irrelevant) are excluded by `isRelevantPlayer` before the table is populated.

### Columns (11 total)

| Column | Notes |
|---|---|
| _(compare toggle)_ | Adds player to the comparison tray |
| **Recent** | Current-form rank vs **active** players by most-recent qualifying PPG (this season if ≥6 GP, else the latest of the last ≤3 seasons with ≥8 GP) — a mixed-season "current form" rank, **not** a single-season finish |
| **Player** | Name + sub-line: `POS · age · TEAM · Nyr` |
| **PPG** | Current/most-recent season PPG |
| **Proj** | Next-season projected PPG (styled by confidence) |
| **Career** | 5-bar sparkline (last 5 seasons) |
| **Ceiling** | Best **single-season** positional finish (by PPG) **among all players that season (full field)**: rank · season + that season's total pts and signed delta vs the per-rank average |
| **Floor** | Worst **single-season** positional finish (by PPG), **full-field**: same stacked format |
| **Dynasty** | Dynasty label badge |
| **KTC** | KeepTradeCut dynasty value, with a signed ~30-day value Δ beneath it (green up / red down; tooltip shows the exact span). Δ shows only when ≥2 banked snapshots exist. |
| **Owner** | Owning fantasy team, or "FA" |

**Proj column confidence styling:** bold text = high confidence, normal = medium, grey = low, italic purple = rookie projection.

**Ceiling & Floor seasons.** For each player the Explorer derives their best (Ceiling) and worst (Floor) career season by **positional finish rank** — ranked by league-scored PPG, the same per-season ranking shown in the Player Profile "Pos Rank" column (`src/utils/seasonRanks.js`, shared with `usePlayerProfile`). Each cell stacks the positional-rank badge + season year over that season's **total** fantasy points and a signed delta vs the **average total points for that finish** across seasons. Because rank is by PPG but the delta is by total points, an injury-shortened top-PPG season reads **negative** (below the typical finisher) while a full strong season reads **positive** — the delta is the insight. Single-season players show the same season for both; players with no qualifying season show `—`. **Display-only** — never feeds projection or dynasty score. This **full-field, single-season** basis is deliberately different from the **Recent** column, which ranks within the **active-player pool** by each player's most-recent *qualifying* PPG (a mixed-season "current form" rank). The two can legitimately show different ranks for the same player and season — e.g. a player whose Recent rank counts active peers measured on a *stronger prior season*, while the same player's Floor counts the full field of that one season. Both are correct for their respective scopes; neither is "the" 2025 rank.

**Recent vs Ceiling/Floor — two different scopes.** *Recent* (and the Profile Rankings-row chips) rank within the **active/relevant player pool** by a **mixed-season** "most-recent qualifying PPG" (`computePositionalRanks`). *Ceiling/Floor* (and the Profile per-season "Pos Rank") rank within a **single season's full field** of everyone who played (`seasonRanks.js`). Same player, same year can therefore carry two different positional ranks — by design.

### Filter sidebar

A slide-in panel (triggered by a filter button) with five collapsible sections:

| Section | Controls |
|---|---|
| **Player type** | Multi-select dynasty group chips (Build Around / Hold / Monitor / Sell Window / Prospects / Limited Data) |
| **Position** | ALL / QB / RB / WR / TE tabs |
| **Ownership** | All Players / My League / Free Agents |
| **Age range** | Dual-handle range slider (18–40) |
| **NFL Team** | Multi-select team chips |

A filter count badge on the filter button shows the number of active non-default filters. "Reset all" clears all filters and resets sort to default.

**Filter state** is a single `filterState` object:
```js
{
  dynastyGroups: [],    // [] = all; entries from DYNASTY_GROUPS
  position: 'ALL',
  ownership: 'all',
  ageMin: 18,
  ageMax: 40,
  nflTeams: [],         // [] = all teams
  nameSearch: '',
}
```

**Presets:** Saved filter configurations stored in `localStorage['explorer-presets']`. Name a filter combination and recall it in one click.

### Sort persistence

Sort state (`{ column, direction }`) is written to `localStorage['explorer-sort']` on every sort change and restored on load. Sort **never resets** when filters change — only when switching position tabs or clicking "Reset all".

**Default sort per position tab:** ALL → PPG descending; any specific position → Recent rank ascending.

**Sorting:** click any column header; click again to reverse. Null/missing values always sort to the bottom regardless of direction.

---

## Shared players table (`usePlayersTable` + `PlayersDataTable`)

The Outlook and NFL-stats tabs share their table chrome through
`src/hooks/usePlayersTable.js` (view-local state: ALL/QB/RB/WR/TE pill filter, `SortTh` sort
+ `localStorage` persistence under a per-tab key, pagination page, expand `Set`, selected
profile id) and `src/components/players/PlayersDataTable.jsx` (presentational wrapper: pills
+ optional toolbar, `!loaded` notice, `overflow-x-auto` table shell, 50-row pagination,
empty-state, and the Player Profile panel + backdrop). Each tab supplies its own columns
(`header`), rows (`renderRow` → an `ExpandableTableRow`), filter→sort pipeline, and detail
panel; the Weekly tab is the planned third consumer. Display-only; never feeds
projection/scoring.

---

## Outlook tab (`src/components/players/OutlookTab.jsx`)

The **Players → Dynasty → Outlook** tab. Same relevant player set as the Explorer
(the `playerRows` prop), with ALL/QB/RB/WR/TE position tabs, column sort
(`localStorage['outlook-sort']`, default Proj ↓) and pagination — but **no filter
sidebar** this slice. **Display-only**: nothing here feeds projection or the dynasty
score. (Pills/sort/pagination/profile via the shared `usePlayersTable`/`PlayersDataTable` — see above.)

| Column | Notes |
|---|---|
| _(chevron)_ | Toggles an inline per-season usage-history panel |
| **Player** | Name + sub-line `POS · age · TEAM · Nyr` |
| **Proj** | Next-season `projectedPPG` (confidence-styled, shared with the Explorer) + muted next-season positional rank |
| **Snap trend** | Latest-vs-prior snap % (`off_snp/tm_off_snp`), arrow + Δ percentage-points. RB/WR/TE, 2020+ data; `—` for QB or <2 snap seasons |
| **Opp trend** | Latest-vs-prior **target** (WR/TE) / **carry** (RB) share, arrow + Δpp; `—` for QB or <2 share seasons |
| **Role** | Descriptive usage class — RB: Every-down / Lead / Committee / Rotational back; WR/TE: Every-down / Primary / Secondary target / Rotational. Banded against position-cohort tertiles of the most-recent snap% + share. Purely descriptive (not advice); `—` for QB / no share / thin cohort |

**Trends & history.** Snap % is derived per season from `careerStats`
(`off_snp/tm_off_snp`); the target/carry **share series is reused** from
`historicalShares` (`computeHistoricalShares`) — not recomputed. `computeUsageTrend`
(`src/utils/outlookUsage.js`) takes latest vs the immediately-prior season **that has
the metric** (≥2 → else `—`); ±1pp dead-band, same convention as the Profile
Role-History "vs Prior" cell. Trend coloring uses the up/down/neutral semantic tokens.

**Row interactions.** The chevron (a stop-propagation cell, like the Explorer compare
cell) toggles the inline history panel — Season · G · Snap% · Carry/Target Share ·
PPG, most-recent first. Clicking the rest of the row opens the same **Player Profile**
panel as the Explorer. The expand mechanism is the reusable
`src/components/ui/ExpandableTableRow.jsx` (`ExpandableTableRow` + `ExpandChevron`).

---

## NFL stats tab (`src/components/players/NflStatsTab.jsx`)

The **Players → Dynasty → NFL stats** tab. Same relevant player set as the Explorer (the
`playerRows` prop), ALL/QB/RB/WR/TE position pills, column sort
(`localStorage['nflstats-sort']`, default FP/G ↓), pagination — no filter sidebar.
**Display-only**: nothing here feeds projection or the dynasty score. (Pills/sort/pagination/profile via the shared `usePlayersTable`/`PlayersDataTable` — see above.)

The table shows **season averages for a selected season** — a table-level season `<select>`
(`localStorage['nflstats-season']`, default = most-recent season `max(careerStats keys)`)
recomputes every row's averages for the chosen season. The visible columns vary by position
pill:

| Pill | Stat columns |
|---|---|
| QB | Cmp% · Pass Yd/G · Pass TD · INT · Rush Yd/G · Rush TD · FP/G |
| RB | Rush Att · Rush Yd/G · Rush TD · Tgt · Rec · Rec Yd/G · Rec TD · FP/G |
| WR / TE | Tgt · Rec · Catch% · Rec Yd/G · Y/R · Rec TD · FP/G |
| ALL | Yds/G · TD · FP/G (position-agnostic composite) |

Rates (Cmp%, Catch%, Y/R) are **derived from counting stats** — the pre-summed weekly-rate
keys in `careerStats.stats` (`cmp_pct`, `pass_ypa`, `rec_ypr`, …) are season *sums of
weekly rates* and are never displayed. Cells with no data show `—` (never NaN).

**Game log (row expansion).** Each row expands (reusable
`src/components/ui/ExpandableTableRow.jsx`) into a per-game log for a selected season
(season `<select>` when the player has multiple): **Wk · Opp (vs/@) · Result (W/L/T +
score) · FP · Spread · Total**, plus a **High/Low** best/worst-fantasy-game summary. Per-game
fantasy points reuse `careerStats[season][id].weeklyPoints` (the Profile weekly-grid
source); matchup context is joined from `nflverse/schedule/<year>.json` via
`loadNflSchedule(year)` (lazy-loaded per season on first expansion, cached per year).

**Schedule join.** Key `(team, week, season)` against `gameType === 'REG'` games. The join
team is the **per-season `team`** from season-totals v3 (`careerStats[season][id].team`,
keyed by the selected log season), normalized Sleeper→nflverse (`LAR→LA`); when a season
has no resolved team (`null`, or a pre-v3 file) the matchup cells degrade to `—`. A
join-sanity guard hides matchup context for a season whose joined team has no game in a
played week (unresolved team, or a played week on the team's bye) — those cells degrade to
`—` rather than show a wrong opponent. `result` is the home
margin (0 = tie); `spreadLine` is home-perspective (shown favorite-negative from the
player's side). Pure helpers live in `src/utils/nflStats.js`
(`computeSeasonAverages`/`buildGameLog`/`computeHighLow`/`normalizeTeamForSchedule`).

**Row interactions.** Chevron (stop-propagation cell) toggles the game log; clicking the
rest of the row opens the same **Player Profile** panel as the Explorer/Outlook.

**Known limitations / future.** Per-season team comes from season-totals v3
(`team`); the residual is **mid-season trades** — a single per-season team can't be exact
for a traded player, so the minority-team weeks may show `—` or, when they fall inside the
dominant team's schedule, a wrong opponent (a per-*week* team would be needed to fix this).
Defense-vs-position (DvP) matchup strength and a richer matchup card are a
**future slice** (need weekly defensive splits not in this ingest). An advstats target-share
column is a possible later add (gate on `advStats.year === season`).

---

## SpiderChart (`src/components/SpiderChart.jsx`)

```jsx
<SpiderChart players={[{ label, values, color }]} size={260} interactive={true} />
```

5-axis SVG radar chart for dynasty score components. Supports 1 or 2 player overlays.

**Axes (clockwise from top):** Age-Adjusted · Trajectory · Opportunity · Reliability · Level

Each axis maps a 0–100 score to a position on the corresponding axis vector.

**SVG layers:**
1. Grid rings at 25/50/75/100 with graduated opacity
2. Axis lines (centre to tip)
3. Data polygons (`fillOpacity: 0.20`) + dot markers per axis point
4. HTML overlay: axis labels (wrapped in `<Tooltip>` when `interactive`) + invisible circular hover targets per data point with value tooltips

**2-player mode:** legend rendered below the chart; each player uses a distinct color (`var(--color-compare-1)` indigo, `var(--color-compare-2)` emerald by default or overridden by `player.color`).

---

## Team depth chart (`buildTeamDepthChart`)

`buildTeamDepthChart(nflTeam, playersMap, playerRows)` in `teamContext.js`.

Groups all skill-position players on `nflTeam` by position (QB/RB/WR/TE), sorts each group by `depth_chart_order` then by current-season PPG, and returns:

```js
{
  QB: [{ player_id, full_name, age, depthOrder, dynastyLabel, dynastyScore, dynastyConf, ktcValue, currentSeasonPPG }],
  RB: [...],
  WR: [...],
  TE: [...],
}
```

Used by the **Team** tab in the Player Profile panel.

---

## Theming & tokens

All color is defined in `src/index.css` `@theme` as CSS custom properties and consumed via Tailwind's arbitrary-value syntax (`bg-[var(--token)]`). When adding a new surface or component, choose an existing token — never a raw Tailwind palette class. Every new token must have a corresponding `.dark` override value in the `.dark` block.

**Surfaces & elevation (1e).** The page is painted with `--color-canvas` (a distinct ground), and `--color-surface…--color-surface-5` are the cards/panels/fills that layer above it. Light mode is a subtly warm off-white (surface lifts *above* canvas; higher surface numbers are progressively deeper warm-grey fills); dark mode is a cool-tinted near-black with standard lighter-as-higher elevation. The warm/cool feel is fully contained in the canvas/surface/border block of `src/index.css` — re-tint there in one edit (shift hue, keep the step spacing). Text and semantic tokens are unchanged and remain AA on these surfaces.

## Color token system (`src/index.css`)

All UI color is expressed through CSS custom properties defined in `@theme` inside `src/index.css`. Components use Tailwind's arbitrary-value syntax — `bg-[var(--token)]`, `text-[var(--token)]` — instead of Tailwind's built-in color scale.

### Two-tier architecture

**Tier 1 — chromatic primitives** (`--c-{hue}-{shade}`): exact Tailwind palette hex values. Example: `--c-indigo-500: #6366f1`. Primitives are used directly when a specific shade is needed (badges, chart fills, focus states).

**Tier 2 — semantic role tokens**: reference primitives by role. Light values are the exact hex in use today; dark-mode values are defined in the `.dark` block but not yet applied.

Key semantic groups:

| Group | Tokens |
|---|---|
| Surface | `--color-surface` … `--color-surface-5` |
| Border | `--color-border`, `--color-border-strong` |
| Text | `--color-text`, `--color-text-strong`, `--color-text-secondary`, `--color-text-semi-muted`, `--color-text-muted`, `--color-text-faint`, `--color-text-faintest`, `--color-text-disabled` |
| Accent (indigo) | `--color-accent`, `--color-accent-text`, `--color-accent-hover`, `--color-accent-subtle-bg`, `--color-on-accent` |
| Semantic | `--color-positive-text`, `--color-negative-text`, `--color-scrim`, `--color-tooltip-bg/fg` |
| Chart | `--color-chart-grid`, `--color-chart-axis`, `--color-chart-label`, `--color-chart-recent`, `--color-chart-above`, `--color-chart-below` |
| Compare / sparkline | `--color-compare-1`, `--color-compare-2`, `--color-sparkline` |
| Toast / inverse surface | `--color-toast-bg`, `--color-toast-track` (dark surface even in light mode) |
| Confidence dots | `--color-conf-dot-high`, `--color-conf-dot-moderate`, `--color-conf-dot-default` |
| Market / phase | `--color-market-up/down/neutral`, `--color-phase-*` |

The `.dark` block in `index.css` contains dark-mode overrides for every token. It is activated via the class variant `@custom-variant dark (&:where(.dark, .dark *))` — adding class `dark` to `<html>` enables dark mode (slice 1d).

---

## AdvancedStatsPanel (`src/components/AdvancedStatsPanel.jsx`)

```jsx
<AdvancedStatsPanel position="WR" advStats={advStatsRow} advStatsSeason={2025}
                    snapShare={0.82} usageShare={{ value: 0.24, season: 2025 }} />
```

Pure presentational, view-only. Renders a descriptor-driven (`ADV_STAT_ROWS`) two-group
table of advanced (nflverse) and usage (in-app) metrics for one player. Returns `null`
when no applicable, present rows exist. No context reads, no projection coupling.

---

## Player Profile panel

Click any Explorer row to open a slide-in panel (720 px large / 580 px medium / full-width mobile). Escape or backdrop click to close.

All data computation lives in `usePlayerProfile(playerId)`, which reads from `ProfileDataContext`. The component handles only rendering and UI state.

### ProfileDataContext

Populated by `PlayersTab` once career data is ready:
```js
<ProfileDataContext.Provider value={{
  careerStats, playersMap: playerMap, playerRows,
  positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections,
  enrichmentMap,   // { coaching, scheme, injuries, notes } or null
  advStats,        // { byId, year, complete, rowCount } or null — view-only advanced stats
}}>
```

### Panel layout

**Header** (4-row hierarchy, `divide-y`):
1. **Identity row** — name, position badge, NFL team, age, years of experience
2. **Status row** — owner badge (or "Free Agent"), dynasty label badge, score chip, confidence, career total points
3. **Rankings row** — Recent rank / Peak rank / Consistency rank / Dynasty rank chips + a natural-language narrative line summarising rank trends
4. **Projection row** (compact) — next-season projected PPG · games · total pts + confidence badge; market divergence chips ("📈 Stats ahead of market" / "📉 Market ahead of stats") + KTC value

**Tab bar:** `Stats | Dynasty | Team`

Below the header, content is split by the active tab.

### Stats tab

Single full-width column (`px-6 py-5 space-y-6`). Sections in order:

1. **Career PPG chart** — SVG bar chart per season. Indigo = most recent, green = above career avg, grey = below. Dashed line at career avg.
2. **Career stats table** — Season · Games Played · Total Pts · PPG · Pos Rank (computed per-season).
3. **Role History table** — shown when `historicalShares` has ≥ 2 qualifying seasons. Columns: Season · Carry/Target Share · vs Prior (↑/↓/→). Most recent first.
4. **Advanced & Usage panel** (`src/components/AdvancedStatsPanel.jsx`) — view-only. Two clearly-labeled groups: **Advanced (nflverse)** — target share, air-yards share, WOPR, RACR from the served `nflverse/advstats/<year>.json` (`advStats.js`); and **Usage (in-app)** — snap share (reused from `projection.factors.snapShare`) and carry/target share (reused from `historicalShares`). Per-position gating (RB shows target/carry + snap only; QB shows nothing) and graceful null omission — no NaN/null ever rendered. Descriptor-driven (`ADV_STAT_ROWS`): adding a stat is one entry. **Display only — never feeds projection or dynasty score.**
5. **Availability History table** (`src/components/AvailabilityHistory.jsx`) — one row per season with career data. Columns: Season · GP · DNP · Longest (longest consecutive DNP run) · Returned? (came back after a DNP run) · Week-by-week (18-cell sparkline: green `P`, red `D`, grey `B`, hollow `X`; tooltip per cell). Pre-2021 seasons render 17 cells — week 18 is hidden when every player in that season has `X` at week 18. Seasons stored on a v1 (pre-Phase-5) season-totals file still appear with GP/DNP but no sparkline. **Enrichment**: when an entry in `enrichment/injuries.json` (data repo) covers a `D` cell's week, the tooltip upgrades from `W{n}: DNP` to `W{n}: DNP — {type} ({severity})`, e.g. `W6: DNP — hamstring (multi-week)`. Cells with no matching enrichment show the baseline `W{n}: DNP`.
6. **College Production section** — shown when `collegeStats[playerId]` exists. Position-aware:
   - Breakout age chip, peak chip (`Peak: XX.X%` for skill/RB; `Peak: XX.X score` for QB), production trend chip
   - Per-season table column header: `Dom%` for skill/RB; `Score` for QB
   - Per-season key stats:
     - WR / TE: `rec yds · TD · rec`
     - RB: `rush yds · TD · carries`
     - QB: `pass yds · TD · INT · PCT%`
7. **Career comparables** — up to 3 comps (skipped when empty). Each shows name + similarity %, dual-line sparkline, their avg PPG over next 1–2 seasons.
8. **Season detail section** — season dropdown, weekly points bar chart, 18-cell numeric grid (W1–W18), expandable raw stat totals.
9. **Position context** — top 5 players at same position by PPG, profiled player highlighted.

### Dynasty tab

Three sections:

**1. SpiderChart + score summary**
- `SpiderChart` renders a 5-axis radar chart comparing the profiled player's dynasty score components to position average (or a selected comparison player). Axes: Age-Adjusted · Trajectory · Opportunity · Reliability · Level.
- Below the chart: score chip, label badge, confidence, and a prose summary of the dynasty outlook.

**2. Signal badges**
- ⚡ Breakout, ↩ Bounce-back, ↑↑ Accelerating, ↓↓ Decelerating, ⚠ TD-reliant, age curve factor, KTC-influenced caveat.

**3. Collapsible component breakdown** (toggle "Show breakdown")
- Five component score bars (Age-adjusted, Trajectory, Level, Opportunity, Reliability).
- Opportunity sub-line: efficiency, volume, carry/target share, QB quality modifier, depth chart level.
- Reliability sub-line: durability + consistency + injury season badge.

**4. Market analysis**
- Divergence signal, dynasty rank vs KTC rank, prose interpretation.

### Team tab

Shows the NFL team depth chart for the player's current team. Grouped by position (QB / RB / WR / TE). Each entry shows: player name · age · depth order · dynasty label · dynasty score · KTC value · current-season PPG.

Built by `buildTeamDepthChart(nflTeam, playersMap, playerRows)` in `teamContext.js`. Players sorted by `depth_chart_order` first, then by PPG.

---

## Explorer trend signal

Compares last-3-season avg PPG to career avg PPG (15% threshold):

| Arrow | Meaning |
|---|---|
| ↑ green | last 3 > career avg by > 15% |
| → grey | within 15% |
| ↓ orange | last 3 < career avg by > 15% |
| – grey | fewer than 3 seasons |

---

## Tooltip system (`src/components/Tooltip.jsx`)

Portal-rendered. Features: viewport flip, 350 ms hover delay, arrow, global on/off via `TooltipContext`.
