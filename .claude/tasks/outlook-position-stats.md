# Outlook position-specific stat columns

**Session 1 (opus) plan — implement in Session 2 (sonnet).** Planning only; no source was edited.

## Goal

On the **Players → Dynasty → Outlook** tab (`src/components/players/OutlookTab.jsx`), when a
**specific position pill (QB/RB/WR/TE)** is active, **replace the right-hand `Snap trend · Opp
trend · Role` column group with three position-specific stat columns**. The **ALL** view is
**unchanged** (keeps Snap/Opp/Role; QBs are already carried by the left position-agnostic group).
Left agnostic columns (Player · Proj · Δ vs now · Proj G · Signals · PPG ± SD) are unchanged in
every view.

Per-position right group:

| Pill | Col 1 | Col 2 | Col 3 |
|---|---|---|---|
| QB | Completion % | Passer rating | Sacks |
| RB | Rush share | Target share | Yards/carry |
| WR | Target share | Air-yards share | aDOT |
| TE | Target share | Air-yards share | aDOT |

Each new cell is a **stacked two-line cell** (Ceiling/Floor style, `CeilingFloorCell` at
`PlayersTab.jsx:62`):
- **PRIMARY** (headline, trend-arrow convention): season-over-season **TREND** = latest
  qualifying season's value − prior qualifying season's value, signed, arrow-coloured.
- **SECONDARY** (smaller, muted): the latest qualifying season's **LEVEL** (e.g. `68.2%`).
- **<2 qualifying seasons → level only**, no trend arrow. **Below the gp floor (0 qualifying
  seasons) → `—`.** Never render `NaN`.

**Display-only** (CLAUDE.md invariant): nothing here feeds projection or the dynasty score.

---

## Findings against live source (the correctness core)

Read these before implementing — they pin down where each number comes from.

### F1 — Every required counting component exists in season-totals ✅
Union of `careerStats[season][id].stats` keys (verified by scanning
`src/__fixtures__/season-totals-2025.json`, all present): `pass_cmp`, `pass_att`, `pass_yd`,
`pass_td`, `pass_int`, **`pass_sack`**, `rush_att`, `rush_yd`, `rec`, `rec_tgt`, **`rec_air_yd`**,
`rec_yd`. Historical coverage is deep: `docs/signal-registry.md` confirms `rec_air_yd` **2012+**
(349 rows in 2012) and the passer-rating keys **2012+**. So aDOT, air-yards share, passer rating,
and Cmp% all have multi-season trend windows.

### F2 — Sacks: NO substitution needed ✅
`pass_sack` is present in season-totals (F1). The QB third stat is **Sacks** as specified;
**do not** wire `src/api/nflGameLogs.js`. (`pass_sack` is the QB's sacks-taken count.)

### F3 — Stored rate keys are the C4 trap — NEVER read them ⛔
These also exist in the data and **must never be displayed**: `cmp_pct`, `pass_rtg`, `pass_ypa`,
`rush_ypa`, `rec_ypr`, `rec_ypt`. They are season **sums of weekly rates** (mixing rate with
volume). Every rate is **recomputed from summed counting components**:
- Cmp% = `pass_cmp / pass_att`
- Passer rating = canonical formula on `(cmp, att, yd, td, int)`
- Y/C = `rush_yd / rush_att`
- aDOT = `rec_air_yd / rec_tgt`

### F4 — `passerRating` exists but is NOT exported ⚠️ (reuse blocker)
`src/utils/efficiencyMetrics.js:34` defines `function passerRating(s)` — the canonical formula
the task mandates ("do not write parallel math") — but the file's only export is
`computeEfficiencyFactor` (line 142). **The implementer must add `export` to `passerRating`**
(see Edit E5). This is behavior-preserving (exposes an existing pure fn) and changes no
projection output. Its inputs (`pass_cmp/att/yd/td/int`) are already stat-key-contract keys.

### F5 — Cmp% / Y/C / aDOT reuse status
- **Cmp%**: `src/utils/nflStats.js` `computeSeasonAverages(seasonData)` already returns
  `compPct = 100 * pass_cmp / pass_att` (`:28`, null when `pass_att<=0`). **Reuse it** so Outlook
  and NFL stats agree.
- **Y/C** and **aDOT**: no existing reusable derivation. `computeSeasonAverages` does **not**
  emit `rush_yd/rush_att` or `rec_air_yd/rec_tgt`; the `ypc`/efficiency ratios in
  `efficiencyMetrics.js` are private lambdas (`:58`, not exported) tied to the cohort-percentile
  machinery. There is **no other Y/C or aDOT anywhere in the app**, so the canonical division is
  unambiguous and there is no "parallel math" to avoid — compute them directly in the new util.

### F6 — Shares: the existing path supplies only ONE share per player ⚠️ (the real gap)
`historicalShares` (`computeHistoricalShares`, `teamContext.js:219`) is the season-share path
that already backs the **Opp-trend** column. It emits **one** share per player-season,
`{season, share, gamesPlayed}` (gp≥8-gated, oldest→newest):
- **RB** → `rush_att / team rushAtt`  (= **Rush share**)
- **WR/TE** → `rec_tgt / team recTgt` (= **Target share**)

Consequences for the 4 distinct shares the spec needs:

| Share | In existing path? | Source |
|---|---|---|
| RB **Rush share** | ✅ yes | reuse `historicalShares` (it *is* the Opp-trend series for RBs) |
| WR/TE **Target share** | ✅ yes | reuse `historicalShares` (it *is* the Opp-trend series for WR/TE) |
| RB **Target share** | ❌ no | new: `rec_tgt / team recTgt` (team denom exists in concept, not exposed to Outlook) |
| WR/TE **Air-yards share** | ❌ no | new: `rec_air_yd / team recAirYd` — **no team air-yards denominator exists anywhere** |

`computeHistoricalTeamTotals` (`teamContext.js:191`) aggregates `rushAtt/rec/recTgt/rushRz/recRz`
but **not** `rec_air_yd`, and that function is **not passed to OutlookTab** anyway. So RB target
share and WR/TE air-yards share need a **new view-only team-receiving-totals denominator**.

**Resolution (display-only, pipeline-untouched):** build a view-only
`buildTeamReceivingTotals(careerStats, playerMap)` → `{[season]:{[team]:{recTgt, recAirYd}}}` that
**mirrors `computeHistoricalTeamTotals` exactly** (only-`gamesPlayed≥1` players, **current-team
attribution via `playerMap[pid].team`**) and additionally sums `rec_air_yd`. This is a correct
team-total share (NOT per-game-share averaging — that would be the same class of error as the C4
trap) and does **not** modify any pipeline function that feeds `dynastyScore`/projection.
Reusing the same current-team attribution keeps all four share columns on one consistent basis
and keeps RB/WR-TE target share identical to what `historicalShares` already shows. (See Flag Q2
for the per-season-team alternative.)

### F7 — Qualifying convention (reused) and the never-NaN guard
Reuse `QUALIFYING_GP = 8` from `src/utils/outlookConsistency.js:3`. A season is **qualifying for
metric M** iff `gamesPlayed ≥ 8` **AND** M's value is finite (its denominator > 0 — e.g.
`pass_att>0` for Cmp%/passer rating, `rush_att>0` for Y/C, `rec_tgt>0` for aDOT, team denom > 0
for the new shares; `pass_sack` is a count, finite whenever present). The trend uses the **two
most recent metric-qualifying seasons**; the level is the **latest** metric-qualifying season's
value. For the two reused shares, `historicalShares` entries are already gp≥8 and finite, so the
qualifying set = the `historicalShares` entries (exactly as `computeUsageTrend` treats them for
the Opp trend today).

### F8 — Sort & pill-swap mechanics (already safe)
- `usePlayersTable.handlePosFilter` (`:47`) **resets sort to `defaultSort`** (`{projectedPPG,
  desc}` — a left agnostic column present in every view) on every pill change. So a position-stat
  sort key is **never stranded** after switching pills. No extra guarding needed.
- **colSpan stays 10 in every view**: chevron + Player + Proj + Δ + Proj G + Signals + PPG±SD +
  **3** right-group columns = 10, identical for ALL and for each position pill. No `colSpan` change.
- The NFL-stats tab's column-swap precedent (`NflStatsTab.jsx:11-46`) is a `COLUMNS` object keyed
  by `posFilter` with `{key,label,fmt}` descriptors, rendered as `cols = COLUMNS[posFilter] ??
  COLUMNS.ALL` and `COLUMNS.TE = COLUMNS.WR`. **Outlook cannot reuse that infrastructure
  verbatim** because NFL stats swaps the *entire* stat-column set while Outlook swaps only the
  *right group* (the left agnostic columns persist). Outlook gets its **own** per-pill descriptor
  object (mirroring the same shape) used only for the right three columns.

---

## New file: `src/utils/outlookPositionStats.js` (view-only, pure)

Mirrors the `outlookConsistency.js` / `outlookUsage.js` view-only convention (leading comment:
"view-only; never feeds projectedPPG, dynasty score, or any factors entry; pure"). Imports
`QUALIFYING_GP` from `./outlookConsistency.js`, `passerRating` from `./efficiencyMetrics.js`
(after E5), and `computeSeasonAverages` from `./nflStats.js`.

```js
// Metric ids per position. TE aliases WR.
export const POSITION_STAT_METRICS = {
  QB: ['cmpPct', 'passerRating', 'sacks'],
  RB: ['rushShare', 'rbTargetShare', 'yardsPerCarry'],
  WR: ['targetShare', 'airYardsShare', 'aDOT'],
}
POSITION_STAT_METRICS.TE = POSITION_STAT_METRICS.WR

// Which metric ids read the reused historicalShares series (vs careerStats counting).
const SHARE_FROM_HISTORICAL = new Set(['rushShare', 'targetShare'])

/**
 * View-only team receiving denominators per season. Mirrors
 * computeHistoricalTeamTotals (teamContext.js:191) EXACTLY — gamesPlayed>=1 players,
 * current-team attribution via playerMap[pid].team — and additionally sums rec_air_yd.
 * Used as the denominator for RB target share and WR/TE air-yards share (correct
 * team-total shares, never per-game-share averages). Never feeds projection/scoring.
 * @returns {{ [season:number]: { [team:string]: { recTgt:number, recAirYd:number } } }}
 */
export function buildTeamReceivingTotals(careerStats, playerMap) { /* see F6 */ }

/**
 * Per-metric per-season series for one player, oldest->newest, gp>=QUALIFYING_GP and
 * finite-value only. Rates recomputed from counting components (never stored rate keys).
 * rushShare/targetShare REUSE historicalShares (identical to the Opp-trend series);
 * rbTargetShare/airYardsShare use teamReceivingTotals; cmpPct via computeSeasonAverages;
 * passerRating via efficiencyMetrics.passerRating; yardsPerCarry/aDOT via direct division;
 * sacks = stats.pass_sack count.
 * @param {string} playerId
 * @param {'QB'|'RB'|'WR'|'TE'} position
 * @param {object} careerStats
 * @param {object} deps  { historicalShares, teamReceivingTotals, playerMap }
 * @returns {{ [metricId:string]: Array<{ season:number, value:number }> }}
 */
export function buildPositionStatSeries(playerId, position, careerStats, deps) { /* ... */ }

/**
 * Collapse one metric series into the cell summary.
 * @param {Array<{season,value}>} series  oldest->newest, already gp>=8 & finite
 * @param {number} eps  per-metric dead-band for direction (caller supplies; see column config)
 * @returns {null | {
 *   level:number, latestSeason:number,
 *   trend: null | { latest:number, prior:number, delta:number,
 *                   direction:'up'|'down'|'flat', latestSeason:number, priorSeason:number }
 * }}
 *  - empty series        -> null            (below floor -> cell renders '—')
 *  - exactly 1 entry     -> { level, latestSeason, trend:null }  (level-only cell)
 *  - >=2 entries         -> trend populated
 */
export function computeMetricSummary(series, eps) { /* ... */ }
```

`computeMetricValue(id, seasonData, { season, team, teamReceivingTotals })` (module-private),
returns `number|null`:

| id | computation | null when |
|---|---|---|
| `cmpPct` | `computeSeasonAverages(seasonData).compPct` (0–100) | `pass_att<=0` |
| `passerRating` | `passerRating(seasonData.stats)` | `pass_att<=0` or `pass_cmp` absent |
| `sacks` | `seasonData.stats.pass_sack ?? null` | key absent |
| `yardsPerCarry` | `rush_yd / rush_att` | `rush_att<=0` |
| `aDOT` | `rec_air_yd / rec_tgt` | `rec_tgt<=0` |
| `rbTargetShare` | `rec_tgt / teamReceivingTotals[season][team].recTgt` | `rec_tgt<=0`, no team, denom<=0 |
| `airYardsShare` | `rec_air_yd / teamReceivingTotals[season][team].recAirYd` | `rec_air_yd<=0`, no team, denom<=0 |

(`rushShare`/`targetShare` bypass `computeMetricValue` — read from `deps.historicalShares[pid]`
`{season, share}`.) Round share-derived values to 3 dp (`Math.round(x*1000)/1000`, matching
`computeHistoricalShares`); leave rate metrics raw (the display formatter rounds). Use
`Number.isFinite` everywhere — never push/return `NaN`.

---

## Edits — grouped by file

### `src/utils/efficiencyMetrics.js`

**E5** — `:34` change `function passerRating(s)` → **`export function passerRating(s)`**.
Behavior-preserving (see F4). Update the leading comment (`:28-33`) to add: "Exported for
view-only reuse by `outlookPositionStats.js` (Outlook QB passer-rating column)." No other change;
`computeEfficiencyFactor` and the factors/stat-key contracts are untouched.

### `src/components/players/OutlookTab.jsx`

**E1 — imports (`:1-9`).** Add:
```js
import { POSITION_STAT_METRICS, buildPositionStatSeries, computeMetricSummary,
         buildTeamReceivingTotals } from '../../utils/outlookPositionStats'
```

**E2 — per-pill column config + stacked cell (add near `TrendCell`/`ConsistencyCell`, ~`:35-138`).**
Add a `POSITION_STAT_COLUMNS` object (Outlook's own; mirrors the NFL-stats `COLUMNS` shape but for
the right group only) and a `PositionStatCell` presenter:

```js
const pctShareFmt = {
  levelFmt: v => `${(v * 100).toFixed(1)}%`,
  deltaFmt: d => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}`,
  deltaEps: 0.01,                       // 1pp dead-band — matches outlookUsage TREND_EPS
}
const oneDecimalFmt = (eps) => ({
  levelFmt: v => v.toFixed(1),
  deltaFmt: d => `${d > 0 ? '+' : ''}${d.toFixed(1)}`,
  deltaEps: eps,
})
const POSITION_STAT_COLUMNS = {
  QB: [
    { id: 'cmpPct',       label: 'Cmp%',         tooltip: 'Completion % (pass_cmp/pass_att), recomputed from season-total counting stats — never the stored cmp_pct. Trend = latest vs prior qualifying season (gp≥8); level below.',
      levelFmt: v => `${v.toFixed(1)}%`, deltaFmt: d => `${d > 0 ? '+' : ''}${d.toFixed(1)}`, deltaEps: 0.5 },
    { id: 'passerRating', label: 'Passer rtg',   tooltip: 'NFL passer rating from season-total components (efficiencyMetrics.passerRating) — never the stored pass_rtg.',
      ...oneDecimalFmt(1.0) },
    { id: 'sacks',        label: 'Sacks',        tooltip: 'Sacks taken (pass_sack), season total. Trend is raw Δ (more sacks shows ↑); display-only, not a value judgment.',
      levelFmt: v => `${Math.round(v)}`, deltaFmt: d => `${d > 0 ? '+' : ''}${Math.round(d)}`, deltaEps: 0.5 },
  ],
  RB: [
    { id: 'rushShare',     label: 'Rush share',   tooltip: 'rush_att / team rush_att (reused historicalShares — same series as the ALL-view Opp trend). gp≥8.', ...pctShareFmt },
    { id: 'rbTargetShare', label: 'Target share', tooltip: 'rec_tgt / team rec_tgt (view-only team-total denominator). gp≥8.', ...pctShareFmt },
    { id: 'yardsPerCarry', label: 'Y/C',          tooltip: 'Yards per carry (rush_yd/rush_att), recomputed from counting stats — never the stored rush_ypa.', ...oneDecimalFmt(0.1) },
  ],
  WR: [
    { id: 'targetShare',  label: 'Target share', tooltip: 'rec_tgt / team rec_tgt (reused historicalShares — same series as the ALL-view Opp trend). gp≥8.', ...pctShareFmt },
    { id: 'airYardsShare',label: 'AY share',     tooltip: 'rec_air_yd / team rec_air_yd (view-only team-total denominator). gp≥8.', ...pctShareFmt },
    { id: 'aDOT',         label: 'aDOT',         tooltip: 'Average depth of target (rec_air_yd/rec_tgt), recomputed from counting stats.', ...oneDecimalFmt(0.5) },
  ],
}
POSITION_STAT_COLUMNS.TE = POSITION_STAT_COLUMNS.WR

// Stacked trend-over-level cell — mirrors CeilingFloorCell (PlayersTab.jsx:62) structure
// and TrendCell (this file :35-51) arrow/colour convention.
function PositionStatCell({ summary, col }) {
  if (!summary || summary.level == null)
    return <span className="text-[var(--color-text-faintest)] text-xs">—</span>
  const { level, trend } = summary
  const levelStr = col.levelFmt(level)
  if (!trend)   // <2 qualifying seasons -> level only, no arrow
    return (
      <div className="leading-tight">
        <div className="text-xs tabular-nums text-[var(--color-text-secondary)]">{levelStr}</div>
      </div>
    )
  const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'
  const colorClass = trend.direction === 'up' ? 'text-[var(--color-positive-text)]'
    : trend.direction === 'down' ? 'text-[var(--color-negative-text)]'
    : 'text-[var(--color-market-neutral)]'
  const tooltip = `${trend.latestSeason}: ${levelStr} vs ${trend.priorSeason}: ${col.levelFmt(trend.prior)}`
  return (
    <Tooltip content={tooltip} position="top">
      <div className="leading-tight">
        <div className={`text-xs tabular-nums ${colorClass}`}>{arrow}{col.deltaFmt(trend.delta)}</div>
        <div className="text-[10px] text-[var(--color-text-faint)] tabular-nums">{levelStr}</div>
      </div>
    </Tooltip>
  )
}
```
(Arrow glyphs `↑/↓/→` reuse the existing `TrendCell` convention verbatim — `:38-41`. The Context
note's "·" for neutral is the same neutral state rendered as `→` here, matching the shipped Opp
trend.)

**E3 — derivations in the component body (`:250-304`).** Add a `teamReceivingTotals` memo (place
it beside `usageByPlayer`, ~`:250-256`):
```js
const teamReceivingTotals = useMemo(
  () => buildTeamReceivingTotals(careerStats, playerMap),
  [careerStats, playerMap]
)
```
Inside the existing `enrichedRows` map (`:269-304`), after the current fields, add per-row
position-stat summaries + flat sort mirrors:
```js
const series = buildPositionStatSeries(id, r.position, careerStats,
  { historicalShares, teamReceivingTotals, playerMap })
const cols = POSITION_STAT_COLUMNS[r.position] ?? []
const _posSummaries = {}
const _posSort = {}
for (const c of cols) {
  const sum = computeMetricSummary(series[c.id], c.deltaEps)
  _posSummaries[c.id] = sum
  _posSort[`_ps_${c.id}`] = sum?.level ?? null   // sort on latest LEVEL; null -> sinks
}
return { ...r, /* existing fields */ _posSummaries, ..._posSort }
```
Add `historicalShares, teamReceivingTotals, playerMap` to the `enrichedRows` dependency array
(`:304`). (`playerRows` carries `position`/`player_id` already; `historicalShares` is an existing
prop.)

**E4a — header swap (`:332-351`).** Keep the chevron + Player + Proj + Δ + Proj G + Signals +
PPG±SD `SortTh`s unchanged. Replace the **Snap/Opp/Role** trio (`:345-350`) with a conditional:
```jsx
{posFilter === 'ALL' ? (
  <>
    <SortTh label="Snap trend" col="_snapTrend" {...sortProps} tooltip="…unchanged…" />
    <SortTh label="Opp trend"  col="_oppTrend"  {...sortProps} tooltip="…unchanged…" />
    <SortTh label="Role"       col="_role"      {...sortProps} tooltip="…unchanged…" />
  </>
) : (
  (POSITION_STAT_COLUMNS[posFilter] ?? []).map(c => (
    <SortTh key={c.id} label={c.label} col={`_ps_${c.id}`} tooltip={c.tooltip} {...sortProps} />
  ))
)}
```

**E4b — cell swap (`:425-444`).** In `renderRow`, keep all cells through PPG±SD unchanged.
Replace the **Snap/Opp/Role** `<td>` trio (`:425-444`) with the matching conditional:
```jsx
{posFilter === 'ALL' ? (
  <>
    <td className="py-2 px-3"><TrendCell trend={row._snapTrend} /></td>
    <td className="py-2 px-3"><TrendCell trend={row._oppTrend} /></td>
    <td className="py-2 px-3">{/* …existing Role cell, unchanged… */}</td>
  </>
) : (
  (POSITION_STAT_COLUMNS[posFilter] ?? []).map(c => (
    <td key={c.id} className="py-2 px-3">
      <PositionStatCell summary={row._posSummaries?.[c.id]} col={c} />
    </td>
  ))
)}
```

**E4c — sort comparator (`:306-322`): NO change required.** The position-stat sort keys are flat
numeric mirrors (`_ps_<id>`), so the existing default branch `compareNullsLast(a[key], b[key],
dir)` already sorts them on the latest level with nulls last. The `_snapTrend/_oppTrend/_role`
special cases stay (they only fire in ALL view). Verify this during implementation; do not add a
special case.

**No change** to `colSpan={10}` (header and `ExpandableTableRow`), the expansion panel
(`AdjustmentNarrative`/`DistributionPanel`/`UsageHistoryPanel`), or `PlayersDataTable.jsx`
(`['ALL','QB','RB','WR','TE']` pills already present, render-prop `header`/`renderRow`).

---

## Step sequence

1. **E5** — export `passerRating` from `efficiencyMetrics.js`; run `npm test` (sanity: nothing
   red from the new export).
2. Create **`src/utils/outlookPositionStats.js`** (`buildTeamReceivingTotals`,
   `buildPositionStatSeries`, `computeMetricSummary`, `POSITION_STAT_METRICS`,
   private `computeMetricValue`).
3. Write **`src/utils/outlookPositionStats.test.js`** (see Tests). Run; green before touching UI.
4. **E1/E2** — imports, `POSITION_STAT_COLUMNS`, `PositionStatCell` in `OutlookTab.jsx`.
5. **E3** — `teamReceivingTotals` memo + `enrichedRows` position-stat fields + deps.
6. **E4a/E4b** — conditional header + cell swaps; confirm **E4c** needs no comparator change.
7. Extend **`OutlookTab.test.jsx`** (see Tests).
8. Apply **Docs updates**.
9. Done-definition: `npm test` · `npm run lint` · `npm run build` all clean. Hand back for the
   user's manual smoke (do not run the dev server).

---

## Docs updates

**`docs/ui.md` → "Outlook tab" (`:137-174`)** — required.
- **Intro (`:143`)**: replace the trailing "Snap trend / Opp trend / Role remain RB/WR/TE-only."
  with: *"In the **ALL** view the right group stays Snap trend · Opp trend · Role (blank for QBs).
  When a specific position pill is active, that group is **replaced** by three position-specific
  stacked stat columns (below); the left agnostic group is unchanged in every view."*
- **Column table (`:145-156`)**: retitle the Snap/Opp/Role rows as the **ALL-view** right group,
  and add a per-position sub-table:

  | Pill | Col 1 | Col 2 | Col 3 |
  |---|---|---|---|
  | QB | Completion % | Passer rating | Sacks |
  | RB | Rush share | Target share | Yards/carry |
  | WR / TE | Target share | Air-yards share | aDOT |

- **Add a paragraph** after the table:
  > **Position-specific stat columns.** When a QB/RB/WR/TE pill is active the right column group
  > swaps to three stacked trend-over-level cells (Ceiling/Floor cell style): the **primary** line
  > is the season-over-season trend (latest − prior **qualifying** season, `gp ≥ 8`; ↑green /
  > ↓red / →neutral, signed) and the **secondary** muted line is the latest qualifying season's
  > level. `<2` qualifying seasons → level only (no arrow); `0` → `—`; never `NaN`. **Rates are
  > recomputed from season-total counting components** — Cmp% (`pass_cmp/pass_att`, reusing
  > `nflStats.computeSeasonAverages`), passer rating (`efficiencyMetrics.passerRating`), Y/C
  > (`rush_yd/rush_att`), aDOT (`rec_air_yd/rec_tgt`) — **never** the stored weekly-summed rate
  > keys (`cmp_pct`, `pass_rtg`, `rush_ypa`, `rec_ypr`, …). **Shares are season team-total shares**:
  > Rush share (RB) and Target share (WR/TE) reuse `historicalShares` (identical to the Opp-trend
  > series); RB Target share and WR/TE Air-yards share use a view-only team-receiving denominator
  > (`buildTeamReceivingTotals`, mirroring `computeHistoricalTeamTotals` discipline + `rec_air_yd`)
  > — never per-game-share averages. Sacks are the `pass_sack` season count. Columns sort on the
  > latest-season level (nulls last). New pure helpers live in `src/utils/outlookPositionStats.js`.
  > **Display-only** — never feeds projection or the dynasty score.
- **`:174`**: leave "table uses `table-auto` … 10-column set" — still 10 columns in every view.

**`docs/ui.md` → "Shared players table" (`:123-133`)** — **no change** (still accurate; the swap
is internal to the Outlook tab's `header`/`renderRow` render-props).

**`CLAUDE.md`** — required:
- `src/utils/` table: add a row —
  `| `outlookPositionStats.js` | `buildTeamReceivingTotals`, `buildPositionStatSeries`,
  `computeMetricSummary`, `POSITION_STAT_METRICS` — view-only Outlook position-stat derivations
  (per-pill stacked trend-over-level cells: Cmp%/passer-rtg/sacks · rush/target share + Y/C ·
  target/air-yards share + aDOT). Rates recomputed from season-total counting components (never
  stored rate keys); new shares via a view-only team-receiving denominator; reuses
  `historicalShares`, `outlookConsistency.QUALIFYING_GP`, `efficiencyMetrics.passerRating`,
  `nflStats.computeSeasonAverages`. Never feeds projection/scoring. |`
- `efficiencyMetrics.js` row (`:132`): append " — also exports `passerRating` (reused view-only by
  `outlookPositionStats.js`)."
- `OutlookTab.jsx` component row (in `src/components/`): append a sentence — "Position pills swap
  the right-hand column group to three position-specific stacked stat columns (`outlookPositionStats.js`);
  ALL view keeps Snap/Opp/Role."

**`README.md`** — required:
- `:124` `OutlookTab.jsx` blurb: extend "…snap/opp/role usage trends…" → "…snap/opp/role usage
  trends in the ALL view, swapped to per-position stacked stat columns (Cmp%/passer-rtg/sacks ·
  rush/target share/Y-C · target/air-yards share/aDOT) when a position pill is active…".
- `:161-163` utils list: add `outlookPositionStats.js` — "view-only Outlook position-stat
  derivations (per-pill trend-over-level columns)".

**`docs/signal-registry.md`** — **no required change.** This adds **no** signal, factor, raw
source, or ephemeral capture; it is a display-only derivation from already-inventoried keys
(`rec_air_yd`, `pass_cmp`/passer-rating keys, `rec_tgt`, `rush_att`/`rush_yd`, `pass_sack`).
*Optional:* append "(also Outlook position-stats view)" to the Current-use cell for the receiving
(`:51`) and passing (`:50`) keys. Not required by the self-maintenance rule (no reclassification).

---

## Tests to add

**`src/utils/outlookPositionStats.test.js`** (co-located unit, mirrors
`outlookUsage.test.js`/`outlookConsistency.test.js`):

1. **Rate recomputed from components, not stored rate (C4 guard).** Feed a QB season with
   `pass_cmp/pass_att/pass_yd/pass_td/pass_int` AND deliberately *wrong* `cmp_pct`/`pass_rtg`/
   `pass_ypa`. Assert `cmpPct` = `100*pass_cmp/pass_att` and `passerRating` = the canonical value
   — both **ignore** the stored keys. Same for `yardsPerCarry` (set wrong `rush_ypa`) and `aDOT`
   (set wrong `rec_ypt`).
2. **`<2` qualifying seasons → level only.** One qualifying season → `computeMetricSummary` →
   `{ level, latestSeason, trend: null }`.
3. **Below-floor season omitted.** A season with `gamesPlayed = 7` is excluded from every series;
   a `gp ≥ 8` neighbour is included. Two `gp≥8` seasons straddling a `gp=7` season → trend uses
   the two `gp≥8` seasons.
4. **Share sourced from the season path.** `rushShare` (RB) / `targetShare` (WR/TE) come from
   `historicalShares` verbatim (assert equality to the input share, not recomputed). `rbTargetShare`
   / `airYardsShare` = player `rec_tgt`/`rec_air_yd` ÷ the `buildTeamReceivingTotals` denominator
   (assert it equals the team-total ratio, and that it is **not** an average of per-game share
   fields — feed differing per-game data and a single season total).
5. **`buildTeamReceivingTotals`.** Two players on team `KC` (gp≥1) + one with `gp=0` (excluded);
   assert `recTgt`/`recAirYd` = sum of the gp≥1 players only; current-team attribution via
   `playerMap[pid].team`; missing-team player skipped.
6. **Sacks present path (no substitution).** `pass_sack` read as a count; level = season sacks,
   trend = Δ count; assert finite (documents F2 — `pass_sack` exists, gamelogs loader not needed).
7. **`computeMetricSummary` direction & dead-band.** Empty → `null`; deltas inside/outside
   `eps` → `flat`/`up`/`down`.
8. **Never NaN.** Zero denominators (`pass_att=0`, `rush_att=0`, `rec_tgt=0`, team denom `0`) →
   that season's value is `null` (omitted), never `NaN`; summaries stay finite or null.

**`src/components/players/OutlookTab.test.jsx`** (extend existing; jsdom):

9. **ALL view** renders `Snap trend`/`Opp trend`/`Role` headers (unchanged).
10. **QB pill** renders `Cmp%`/`Passer rtg`/`Sacks` headers and **not** Snap/Opp/Role; **RB pill**
    → `Rush share`/`Target share`/`Y/C`; **WR & TE pills** → `Target share`/`AY share`/`aDOT`.
11. **QB stacked cell renders** where ALL view shows a blank QB Snap/Opp/Role: a QB row in the QB
    view shows a level string (e.g. a `%` for Cmp%); confirms the original "blank for QBs"
    complaint is resolved.
12. **Level-only vs trend cell:** a one-qualifying-season player shows the level with no arrow; a
    ≥2-season player shows an arrow + the muted level line.
13. **Sort on a position-stat level with nulls last:** click a position-stat header; rows order by
    latest level descending and a player with no qualifying season sinks to the bottom.
14. **Pill swap is non-crashing and resets sort:** switching QB→RB→ALL re-renders the correct
    header set without error (sort reset to `projectedPPG` is `usePlayersTable` behavior).

No new contract test in `src/__tests__/` is required: this is a view-only util (not projection),
so it is outside `factorsSchema`/`statKeysContract`. (Optional, for parity with
`advStatsViewOnly.test.js`: a guard asserting no projection/scoring module imports
`outlookPositionStats.js`. The sibling outlook utils ship without such a guard, so this is
optional, not required.)

---

## Cross-repo impact

**None.** All sourcing is app-internal from the existing season-totals (`careerStats`) the data
repo already serves. The two keys this slice newly *reads* — `rec_air_yd` and `pass_sack` — are
already present in served season-totals (verified in `src/__fixtures__/season-totals-2025.json`
and confirmed 2012+ in `docs/signal-registry.md`); **no new field, no schema bump, no manifest or
served-shape change** is requested of `sleeper-dashboard-data`. No snapshot/factors/contract
change. Nothing crosses the repo boundary.

---

## Flags for review (recommendations, not yet decided)

- **Q1 — Sacks trend colour semantics.** The uniform raw-Δ convention colours *more sacks* ↑green.
  For a QB that reads backwards (fewer sacks is "better"). Recommendation: keep the uniform raw-Δ
  convention (consistent with every other cell; the tooltip says "raw Δ, not a value judgment"),
  matching the display-only/"not advice" framing used for Role. Alternative: invert sacks
  (fewer = ↑green) — rejected as a special-case that breaks the one-convention rule. **Decide.**
- **Q2 — Team attribution for the new shares.** `buildTeamReceivingTotals` uses **current-team**
  attribution to mirror `computeHistoricalTeamTotals` and keep all four share columns consistent
  with the reused `historicalShares`. Per-season team (`careerStats[season][id].team`, schema v3)
  would be more correct for a team-changer's *prior*-season denominator, but would diverge from
  the reused target/rush share basis. Recommendation: current-team now (mirror the existing path);
  note per-season-team as a future refinement. **Confirm.**
- **Q3 — `passerRating` export (E5).** Required to honor "do not write parallel math" (F4).
  Behavior-preserving export of an existing pure fn from a projection module; the alternative
  (duplicating the formula in the view util) is explicitly discouraged by the task. **Confirm the
  export is acceptable** vs. duplication.
