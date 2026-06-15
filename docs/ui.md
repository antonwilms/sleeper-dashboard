Deep reference for the Explorer, Player Profile panel, and shared UI components.

## Features

### Persistent session

Username and league selection are saved to `localStorage`. On return visits the app skips the username form and loads straight into the last league. A sticky header bar shows avatar, display name, and league name with a **Switch** link.

A **Tooltips on/off** toggle in the header persists in `localStorage` (default: on). When off, `Tooltip` renders children with no wrapper — zero overhead.

### League selection

Enter a Sleeper username to fetch all leagues for the current season. Each league card shows scoring format (PPR / Half PPR / Standard), team count, and status.

### Standings · Schedule · Rosters · My Team

Standard dynasty dashboard views. My Team shows current-week projections, last-week actuals, 4-week average, and a 4-bar trend sparkline per player.

**My Team enhancements:**
- **Sort toggle**: switch between _This Week_ (by current projection) and _Next Season_ (by `projectedPPG`).
- **Per-player next-season line**: "Next season: ~X.X PPG · ~N pts" with a confidence badge (`high` / `med` / `low` / `rookie`).
- **Roster total**: sum of all projected PPG for the upcoming season displayed at the top of the roster.

---

## Player Explorer

Searchable, filterable, sortable table of skill-position players. Ghost entries (retired, no-data, irrelevant) are excluded by `isRelevantPlayer` before the table is populated.

### Columns (9 total)

| Column | Notes |
|---|---|
| _(compare toggle)_ | Adds player to the comparison tray |
| **Recent** | Position rank by recent PPG |
| **Player** | Name + sub-line: `POS · age · TEAM · Nyr` |
| **PPG** | Current/most-recent season PPG |
| **Proj** | Next-season projected PPG (styled by confidence) |
| **Career** | 5-bar sparkline (last 5 seasons) |
| **Dynasty** | Dynasty label badge |
| **KTC** | KeepTradeCut dynasty value |
| **Owner** | Owning fantasy team, or "FA" |

**Proj column confidence styling:** bold text = high confidence, normal = medium, grey = low, italic purple = rookie projection.

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

**Sorting:** click any column header; click again to reverse.

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

**2-player mode:** legend rendered below the chart; each player uses a distinct color (`#6366f1` indigo, `#10b981` emerald by default or overridden by `player.color`).

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
