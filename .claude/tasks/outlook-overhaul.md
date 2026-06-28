# Outlook tab overhaul — projection signals (left) + scoring consistency (right)

**Session model:** opus plans (this file), sonnet implements. No source edits in this session.
**Scope:** `Players → Dynasty → Outlook` tab only. **Display-only** — nothing here may feed
`projectedPPG`, the dynasty score, or any `factors` entry (CLAUDE.md invariant). One new pure
helper, one new component file is *not* needed (all UI stays in `OutlookTab.jsx`), no pipeline
change, no data-shape change, no cross-repo change.

---

## 0. Problem & shape of the fix

Today the Outlook inline columns after Proj are **Snap trend · Opp trend · Role** — all three are
RB/WR/TE-only and render `—` for QBs by design (`outlookUsage.js`: snap gated to
`SNAP_POSITIONS`, share null for QB, `classifyRole` returns null for QB). Default sort is Proj ↓,
so QBs sit on top and the first screen reads as three empty columns. The `table-fixed` 6-column
layout also leaves a wide empty band on the right.

Fix = two new column groups, both from data already in memory:

- **LEFT (forward-looking, position-agnostic):** `Δ vs now`, `Proj G`, `Signals`.
- **RIGHT (historical fact, position-agnostic):** `Consistency "PPG ± SD"`.

Final inline column order (10 cells incl. chevron):

| # | Column | Source | Pos-agnostic? | New? |
|---|--------|--------|---------------|------|
| 1 | _(chevron)_ | — | — | keep |
| 2 | Player | `row.full_name` + sub-line | — | keep |
| 3 | Proj | `row.projectedPPG` + `row.nextSeasonRank` | yes | keep |
| 4 | Δ vs now | `row.projectedPPG − row.currentSeasonPPG` | **yes** | **new** |
| 5 | Proj G | `seasonProjections[id].projectedGames` | **yes** | **new** |
| 6 | Signals | `row.dynastyScore.signals` (compact glyph cluster) | **yes** | **new** |
| 7 | Consistency | `computeConsistency(careerStats,id)` → `mean ±sd` | **yes** | **new** |
| 8 | Snap trend | `row._snapTrend` | RB/WR/TE | **keep, unchanged** |
| 9 | Opp trend | `row._oppTrend` | RB/WR/TE | **keep, unchanged** |
| 10 | Role | `row._role` | RB/WR/TE | **keep, unchanged** |

Expansion row (chevron), top → bottom: **(a)** adjustment narrative · **(b)** per-season
distribution table + boom/bust · **(c)** existing usage-history table (unchanged, moves to bottom).

---

## 1. Confirmed facts from live source (do not re-derive)

All verified against the current tree this session. Anchors are `file:line`.

### 1.1 What OutlookTab already receives
`PlayersSurface` spreads `{...props}` to `OutlookTab` ([PlayersSurface.jsx:78](src/components/players/PlayersSurface.jsx)).
App passes to `PlayersSurface` ([App.jsx:1013-1034](src/App.jsx)):
- `playerRows={playerRowsWithProj}` — each row carries `dynastyScore`, `currentSeasonPPG`,
  `projectedPPG`, `projectionConfidence`, `nextSeasonRank`, `position`, etc.
- `seasonProjections={seasonProjections}` — `{ [player_id]: projectionObject }` (full objects).
- `careerStats`, `historicalShares`, and the rest already destructured by `OutlookTab` today.

So **no new prop is needed.** `OutlookTab`'s signature already destructures `seasonProjections`
([OutlookTab.jsx:91-95](src/components/players/OutlookTab.jsx)).

### 1.2 Field sources for each new column

**Δ vs now — current side = the EXACT Explorer "PPG" source.**
Explorer PPG cell renders `row.currentSeasonPPG > 0 ? row.currentSeasonPPG.toFixed(1) : '—'`
([PlayersTab.jsx:2144](src/components/PlayersTab.jsx)). `currentSeasonPPG` is built in
[App.jsx:321-323](src/App.jsx) as most-recent-season `fantasyPoints/gamesPlayed`, and is **`0`
(not null)** when the player didn't play the most-recent season. So **"present" ⇔ `> 0`** — mirror
the Explorer's `> 0` guard exactly so Outlook and Value agree (this resolves the task's
"qualifying" wording: the operative instruction is "reuse the exact source the Explorer PPG column
uses"; that source is `currentSeasonPPG` with the `> 0` guard, **not** the Recent-rank
qualifying-PPG). Projected side = `row.projectedPPG` (present ⇔ `!= null`).

**Proj G = `seasonProjections[id].projectedGames`.** Present on both projection paths:
vet `projectedGames = Math.round(clamp(avgGames, 8, 17))` ([seasonProjection.js:540](src/utils/seasonProjection.js),
returned at [:668](src/utils/seasonProjection.js)); rookie `projectedGames = 14`
([seasonProjection.js:174](src/utils/seasonProjection.js), returned at [:195](src/utils/seasonProjection.js)).
**Not** on the row (only `projectedPPG/projectedTotalPts/projectionConfidence` are merged onto rows
at [App.jsx:539-541](src/App.jsx)) → read from the `seasonProjections` prop.

**Signals = `row.dynastyScore.signals`** — the SAME object the Profile → Dynasty "Signal badges"
read ([PlayersTab.jsx:802](src/components/PlayersTab.jsx) `const sig = dynastyScore.signals ?? {}`,
badges at [:863-881](src/components/PlayersTab.jsx)). Built in `computeDynastyScore`
([dynastyScore.js:1030-1058](src/utils/dynastyScore.js)) which internally calls
`projectionSignals.js` (`computeBreakoutFlag`/`computeBounceBackFlag`/`computeTdReliance`). The
relevant keys: `isBreakout`, `isBounceBack`, `momentumLabel` (`'accelerating'|'decelerating'|…`),
`isTdReliant`, `tdDependency`, `ageCurveFactor` (number, `Math.round(ageFactor*100)/100`, or null).
**Reuse this object verbatim — do NOT recompute flags from `seasonProjections[id].factors`**
(the task says reuse the Profile-badge flag derivation, and the Profile reads `dynastyScore.signals`).
`row.dynastyScore` can be `null` (e.g. `confidence:'none'` → `signals:null`, and the test fixtures
pass `dynastyScore:null`) → must be null-safe.

**adjustmentSummary = `seasonProjections[id].adjustmentSummary`** — array of human-readable strings,
e.g. `'Age curve improving ↑'`, `'Growing role ↑'`, `'TD-reliant scoring — extra regression ↓'`
(vet built at [seasonProjection.js:622-664](src/utils/seasonProjection.js), returned at [:733](src/utils/seasonProjection.js);
rookie built at [:178-191](src/utils/seasonProjection.js), returned at [:238](src/utils/seasonProjection.js)).
Reuse verbatim — **do not author new copy.** May be `[]`.

**Per-game points = `careerStats[season][id].weeklyPoints`.** Shape confirmed against the fixture:
it is an **object keyed by week number string**, only played weeks present, e.g.
`{"1":12,"2":14,"3":7,…,"18":3}` (a 15-game season has 15 entries; sum == `fantasyPoints`).
`weeklyStatus` is a **length-18 array** indexed `0..17` (`'P'|'D'|'B'|'X'`). `buildGameLog` reads
`weeklyPoints?.[w]` with `w` = 1..18 (1-indexed) and `weeklyStatus?.[w-1]`
([nflStats.js:53,83,92](src/utils/nflStats.js)). For the consistency helper we want the per-game
**values**, so use `Object.values(weeklyPoints).filter(Number.isFinite)` — robust to the object form
*and* a legacy 1-indexed-array form (holes/`undefined` are dropped by the finite filter; legitimate
negative games, e.g. INT-heavy QB weeks, are kept). `weeklyPoints` may be absent on pre-Phase-5 (v1)
season files → treat as no games for that season.

### 1.3 Qualifying-season convention (answers the task's "≥6 GP?" question)
The dominant, full-season qualifying threshold across the codebase is **`gamesPlayed ≥ 8`**:
- Consistency rank window: `(careerStats[season][id].gamesPlayed ?? 0) >= 8` ([dynastyScore.js:308](src/utils/dynastyScore.js))
- Recent-rank fallback, last-season rank, peak rank: all `>= 8` ([dynastyScore.js:268,282,294](src/utils/dynastyScore.js))
- `getStableRecentPPG`: "A qualifying season requires gamesPlayed ≥ 8" ([dynastyScore.js:596](src/utils/dynastyScore.js))

The `>= 6` check at [dynastyScore.js:257](src/utils/dynastyScore.js) is **only** the carve-out for an
*in-progress current season*. Outlook is an offseason view (today = 2026-06-28; the latest season is
complete), so **use `gamesPlayed ≥ 8`** for the consistency window. This is the existing convention,
not an invented number.

### 1.4 Shared table chrome (must follow)
`usePlayersTable({storageKey,defaultSort})` → `{posFilter, sortState, page, expanded,
selectedPlayerId, sortProps, handlePosFilter, toggleExpanded, setPage, setSelectedPlayerId}`
([usePlayersTable.js:14-68](src/hooks/usePlayersTable.js)). `sortProps = {sortKey, sortAsc, onSort}`
([:62](src/hooks/usePlayersTable.js)). `SortTh({label,col,sortKey,sortAsc,onSort,tooltip})`
([PlayersTab.jsx:91-103](src/components/PlayersTab.jsx)). `PlayersDataTable` takes
`colgroup` (defaults `null`), `tableClassName`, `colSpan`, render-prop `header`/`renderRow`
([PlayersDataTable.jsx:6-9](src/components/players/PlayersDataTable.jsx)). `ExpandableTableRow`
+ `ExpandChevron` ([ExpandableTableRow.jsx:2-35](src/components/ui/ExpandableTableRow.jsx)).
`compareNullsLast(va,vb,dir)` sinks nulls regardless of direction ([sortUtils.js](src/utils/sortUtils.js)).

**Layout precedent for a many-column tab:** `NflStatsTab` uses `tableClassName="table-auto"` with
**no colgroup** and `colSpan = 3 + cols.length` ([NflStatsTab.jsx:307-308](src/components/players/NflStatsTab.jsx)).
Outlook will follow the same pattern (drop the current `table-fixed`+`colgroup`, use `table-auto`,
`colSpan=10`) — this both fits 10 columns and fills the empty horizontal band.

---

## 2. New file — `src/utils/outlookConsistency.js` (pure, view-only)

Mean / population SD / CV / boom-bust over a player's recent qualifying seasons, pooled across games.
Mirrors the `outlookUsage.js` header banner ("view-only; never feeds projection/dynasty score; pure").

### 2.1 Design decisions (justified)

- **Population SD, not sample SD.** We are *describing* the realized game-to-game spread of a fixed
  set of observed games — not estimating a parameter of a larger hypothetical population. Population
  SD (`÷ N`) is the correct descriptive statistic and avoids Bessel's small-sample inflation.
  Justify this in a one-line comment.
- **Qualifying season = `gamesPlayed ≥ 8`** (`QUALIFYING_GP`, §1.3).
- **Window = last 3 qualifying seasons** (`WINDOW_SEASONS = 3`), most-recent first.
- **Inline-cell pooled-game floor = 10** (`MIN_POOLED_GAMES`). A population SD is unstable below
  ~10 observations; 10 sits above one qualifying season (8) and below the ≥16 implied by two
  qualifying seasons, so in practice it only suppresses genuinely sparse weekly-point data (two
  barely-qualifying seasons with missing weekly arrays). Anchored to the 8-GP convention + margin,
  not invented.
- **Per-season SD/CV floor = 8 finite games** (`PER_SEASON_MIN_GAMES`, == `QUALIFYING_GP`). A
  per-season SD shows only when that season itself has a qualifying season's worth of game-level
  data. Window seasons are ≥8 GP by construction, so this is a robustness guard for sparse
  `weeklyPoints`, not a common omission.
- **Boom/bust thresholds:** boom = share of pooled games `≥ 1.5 × pooledMean`; bust = share
  `≤ 0.5 × pooledMean` (`BOOM_MULT=1.5`, `BUST_MULT=0.5`). Self-relative to the player's own pooled
  mean (per task — no positional threshold). Null when below pooled floor or `pooledMean ≤ 0`.
- **CV = sd / mean**, null when `sd` is null or `mean ≤ 0` (avoid divide-by-zero / nonsense).
- **Distribution table shows the window (last 3 qualifying seasons)** — the exact seasons that feed
  the inline `mean ±sd`, so the expansion *explains* the inline number and boom/bust (pooled over the
  window) stays coherent with the rows shown. _(Design choice — flagged in §7 "Open choices"; the
  alternative is "all seasons with SD/CV omitted below floor," which decouples the table from the
  pooled stat.)_

### 2.2 Constants & exports

```js
export const QUALIFYING_GP        = 8    // season counts toward the window (matches dynastyScore.js)
export const WINDOW_SEASONS       = 3    // pool the last N qualifying seasons
export const MIN_POOLED_GAMES     = 10   // pooled finite games needed for an inline SD
export const PER_SEASON_MIN_GAMES = 8    // a season needs this many finite games for its own SD/CV
const BOOM_MULT = 1.5
const BUST_MULT = 0.5
```

### 2.3 Function signatures & shapes

```js
/**
 * Finite per-game fantasy points for one season, from careerStats[season][id].weeklyPoints.
 * weeklyPoints is an object keyed by week ({"1":12.3,…}); Object.values handles object or array.
 * @param {object|undefined} seasonData  careerStats[season][playerId]
 * @returns {number[]}  finite per-game points (may be empty); never throws
 */
export function extractGamePoints(seasonData)   // Object.values(weeklyPoints ?? {}).filter(Number.isFinite)

// internal
function mean(xs)                 // xs.length ? sum/len : null
function populationStdDev(xs, m)  // xs.length ? Math.sqrt(sum((x-m)^2)/N) : null  (m = precomputed mean)

/**
 * One season's distribution. Null-safe.
 * @param {object|undefined} seasonData
 * @returns {{ games:number, mean:number|null, sd:number|null, cv:number|null }}
 *   games = finite-game count; mean over those games;
 *   sd = population SD, null when games < PER_SEASON_MIN_GAMES;
 *   cv = sd/mean, null when sd null or mean <= 0.
 */
export function computeSeasonConsistency(seasonData)

/**
 * Pooled distribution over a player's last WINDOW_SEASONS qualifying (gp>=QUALIFYING_GP) seasons.
 * @param {object|null} careerStats  { [season]: { [pid]: { gamesPlayed, weeklyPoints, ... } } }
 * @param {string} playerId
 * @returns {null | {
 *   window:     number,            // # qualifying seasons used (1..WINDOW_SEASONS)
 *   pooledGames:number,            // total finite games pooled
 *   mean:       number|null,       // pooled mean (null iff pooledGames === 0)
 *   sd:         number|null,       // pooled population SD (null when pooledGames < MIN_POOLED_GAMES)
 *   cv:         number|null,       // sd/mean (null when sd null or mean<=0)
 *   boomRate:   number|null,       // share pooled games >= 1.5*mean (null below pooled floor / mean<=0)
 *   bustRate:   number|null,       // share pooled games <= 0.5*mean (   ''                          )
 *   seasons: Array<{ season:number, games:number, mean:number|null, sd:number|null, cv:number|null }>
 *            // most-recent first, the window seasons (computeSeasonConsistency each)
 * }}
 *   Returns null when the player has ZERO qualifying seasons (so the expansion can show
 *   "Not enough qualifying seasons"). When window >= 1 returns the object; the inline cell's
 *   own eligibility (window>=2 && pooledGames>=MIN_POOLED_GAMES && sd!=null) is checked by the caller.
 */
export function computeConsistency(careerStats, playerId)
```

**Algorithm for `computeConsistency`:**
1. Guard `!careerStats` → `null`.
2. `seasons = Object.keys(careerStats).map(Number).sort((a,b)=>b-a)` (desc).
3. Walk desc, collect seasons where `(careerStats[s][playerId]?.gamesPlayed ?? 0) >= QUALIFYING_GP`,
   stop at `WINDOW_SEASONS`. → `window` list (most-recent first).
4. If `window.length === 0` → `null`.
5. Per window season: `computeSeasonConsistency(careerStats[s][playerId])` → push to `seasons[]`;
   accumulate `extractGamePoints(...)` into `pooled[]`.
6. `pooledGames = pooled.length`; `mean = mean(pooled)`;
   `sd = pooledGames >= MIN_POOLED_GAMES ? populationStdDev(pooled, mean) : null`;
   `cv = (sd!=null && mean>0) ? sd/mean : null`.
7. Boom/bust: when `sd != null && mean > 0`,
   `boomRate = pooled.filter(x=>x>=BOOM_MULT*mean).length / pooledGames`,
   `bustRate = pooled.filter(x=>x<=BUST_MULT*mean).length / pooledGames`; else both `null`.
8. Return the object. (No rounding in the helper — callers format; keeps it test-friendly.)

> Note: the pooled `mean` here is the per-game mean over the window, which can differ slightly from
> any single-season `fantasyPoints/gamesPlayed` or from `projectedPPG`. That is expected — it is a
> distinct, multi-season pooled statistic. Document in the column tooltip (§3.3).

---

## 3. Edits to `src/components/players/OutlookTab.jsx`

Grouped; cite the anchor you are changing. Read narrowly.

### 3.1 Imports ([:1-8](src/components/players/OutlookTab.jsx))
Add: `import { computeConsistency } from '../../utils/outlookConsistency'`.
(`Tooltip`, `SortTh`, `projectionConfidenceClass`, `ExpandableTableRow`/`ExpandChevron`,
`compareNullsLast`, `usePlayersTable`, `PlayersDataTable`, the `outlookUsage` helpers are already
imported.) `DEFAULT_SORT` stays `{ column:'projectedPPG', direction:'desc' }` ([:32](src/components/players/OutlookTab.jsx)).

### 3.2 New in-file pure presenter helpers (add near `TrendCell`, [:34-50](src/components/players/OutlookTab.jsx))

**(a) `DeltaCell({ proj, cur })`** — Δ vs now.
- `if (proj == null || !(cur > 0)) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>`
  (the `cur > 0` guard mirrors Explorer [PlayersTab.jsx:2144](src/components/PlayersTab.jsx)).
- `const d = proj - cur`. Neutral dead-band `±0.05`: `dir = d > 0.05 ? 'up' : d < -0.05 ? 'down' : 'flat'`.
- Arrow `↑/↓/→`; color via the same tokens `TrendCell` uses (`--color-positive-text` /
  `--color-negative-text` / `--color-market-neutral`). Text: `` `${d>0?'+':''}${d.toFixed(1)}` ``,
  `text-xs tabular-nums`. Tooltip: `` `Proj ${proj.toFixed(1)} vs now ${cur.toFixed(1)}` ``.

**(b) `SignalCluster({ signals })`** — compact glyph cluster reusing Profile-badge flags.
- `if (!signals) return null` (render nothing — not `—`).
- Build glyphs in this fixed order, each a `<Tooltip>`-wrapped `<span>` (reuse Profile badge
  tooltip copy from [PlayersTab.jsx:865-880](src/components/PlayersTab.jsx)):
  | flag condition | glyph | color token | tooltip (reuse) |
  |---|---|---|---|
  | `signals.isBreakout` | `⚡` | `--color-positive-text` | "Performing 30%+ above age-curve expectation…" |
  | `signals.isBounceBack` | `↩` | accent/blue (`--c-blue-700`) | "Strong return after injury-shortened season" |
  | `signals.momentumLabel === 'accelerating'` | `↑↑` | `--color-positive-text` | "Production significantly higher in last 2 seasons vs prior 2" |
  | `signals.momentumLabel === 'decelerating'` | `↓↓` | `--color-negative-text` | "Production significantly lower in last 2 seasons vs prior 2" |
  | `signals.isTdReliant` | `⚠` | `--color-caution-*`/`--c-yellow-800` | `` `${Math.round((signals.tdDependency??0)*100)}% of points from touchdowns…` `` |
  | `signals.ageCurveFactor >= 1.05` | `↑` | `--color-text-muted` | "Performing above expected level for age" |
  | `signals.ageCurveFactor <= 0.95` | `↓` | `--color-text-muted` | "Performing below expected level for age" |
- Render as `<span className="inline-flex gap-1 text-xs">{glyphs}</span>`; if zero glyphs return `null`.
- **Age-curve dead-band (±0.05 around 1.0):** keeps the cluster from showing an age arrow on
  essentially every in-prime veteran (`ageCurveFactor` clusters near 1.0). The boolean flags need no
  threshold; this is the one display threshold and is **view-only** (never feeds anything). _(Flagged
  in §7.)_ The Profile uses a no-dead-band `×factor` label; we intentionally use a compact arrow with
  a dead-band because the column is a glance-cluster, not a detail badge.

**(c) `ConsistencyCell({ c })`** — inline `PPG ± SD`.
- `eligible = !!c && c.window >= 2 && c.pooledGames >= 10 && c.sd != null`
  (10 = `MIN_POOLED_GAMES`; import-or-inline the constant — prefer importing to avoid a magic number).
- `if (!eligible) return <span className="text-[var(--color-text-faintest)] text-xs">—</span>`.
- Else `<span className="text-xs tabular-nums">{c.mean.toFixed(1)} <span className="text-[var(--color-text-faint)]">±{c.sd.toFixed(1)}</span></span>`
  wrapped in a Tooltip: `` `Mean ± SD of per-game fantasy points over last ${c.window} qualifying seasons (${c.pooledGames} games)` ``.

**(d) `AdjustmentNarrative({ lines })`** — expansion section (a).
- `lines` = `seasonProjections[id]?.adjustmentSummary ?? []`.
- `if (!lines.length) return <span className="text-xs text-[var(--color-text-faint)]">No notable projection adjustments.</span>`.
- Else a small header "Why next season" + wrapped chips: `lines.map(t => <span key className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-surface-3)] text-[var(--color-text-secondary)]">{t}</span>)`.
  **Reuse the strings verbatim** — no new copy.

**(e) `DistributionPanel({ c })`** — expansion section (b).
- `if (!c) return <span className="text-xs text-[var(--color-text-faint)]">Not enough qualifying seasons for a distribution.</span>`.
- Header "Scoring distribution" + boom/bust summary line when present:
  `` `Boom ${Math.round(c.boomRate*100)}% · Bust ${Math.round(c.bustRate*100)}%` `` (omit the line when
  `boomRate==null`), Tooltip: "Boom = games ≥ 1.5× this player's pooled mean; Bust = games ≤ 0.5×.
  Self-relative — no positional threshold."
- Table (reuse `UsageHistoryPanel`'s table classes), most-recent first, columns
  **Season · G · PPG · SD · CV**, from `c.seasons`:
  - PPG → `s.mean != null ? s.mean.toFixed(1) : '—'`
  - SD → `s.sd != null ? s.sd.toFixed(1) : '—'`
  - CV → `s.cv != null ? s.cv.toFixed(2) : '—'`
  - G → `s.games`
  (no NaN — every numeric is null-checked.)

`UsageHistoryPanel` ([:52-89](src/components/players/OutlookTab.jsx)) is **unchanged**; it becomes
expansion section (c).

### 3.3 Row enrichment — `enrichedRows` memo ([:113-129](src/components/players/OutlookTab.jsx))
This memo already attaches `_history/_snapTrend/_oppTrend/_role`. Add a `consistencyByPlayer` Map
memo (sibling of `usageByPlayer`, [:100-106](src/components/players/OutlookTab.jsx)) and extend
`enrichedRows` to attach the new precomputed cells + **sort keys** (so the sort path needs no
special-casing):

```js
const consistencyByPlayer = useMemo(() => {
  const m = new Map()
  for (const row of (playerRows ?? [])) m.set(row.player_id, computeConsistency(careerStats, row.player_id))
  return m
}, [playerRows, careerStats])
```

Inside the `enrichedRows` map add, per row (`id = r.player_id`, `proj = seasonProjections?.[id]`):
```js
const cons = consistencyByPlayer.get(id) ?? null
const sig  = r.dynastyScore?.signals ?? null
const consEligible = !!cons && cons.window >= 2 && cons.pooledGames >= 10 && cons.sd != null
const delta = (r.projectedPPG != null && r.currentSeasonPPG > 0) ? r.projectedPPG - r.currentSeasonPPG : null
const signalCount =
  (sig ? ((sig.isBreakout?1:0) + (sig.isBounceBack?1:0)
       + (sig.momentumLabel==='accelerating'||sig.momentumLabel==='decelerating'?1:0)
       + (sig.isTdReliant?1:0)
       + (sig.ageCurveFactor>=1.05||sig.ageCurveFactor<=0.95?1:0)) : 0)
return {
  ...r,
  _history: h, _snapTrend: …, _oppTrend: …, _role: …,   // unchanged
  _consistency:     cons,
  _signals:         sig,
  _projGames:       proj?.projectedGames ?? null,
  _adjustments:     proj?.adjustmentSummary ?? [],
  _deltaVsNow:      delta,
  _projGamesSort:   proj?.projectedGames ?? null,
  _signalCountSort: signalCount > 0 ? signalCount : null,   // 0 signals sink to bottom
  _consistencySort: consEligible ? cons.mean : null,
}
```
Add `seasonProjections` and `consistencyByPlayer` to the memo deps (currently
`[playerRows, usageByPlayer, roleCohort]`).

> Storing numeric sort keys on the row means `displayRows`' default branch
> (`compareNullsLast(a[key], b[key], dir)`) handles all four new columns with **no new switch arm**.

### 3.4 Sort path — `displayRows` memo ([:131-147](src/components/players/OutlookTab.jsx))
Keep the existing special cases for `_snapTrend`/`_oppTrend` (`?.delta`) and `_role` (ROLE_ORDER).
The new columns sort via the **default** branch already present
(`return compareNullsLast(a[key], b[key], dir)`) because their sort keys are plain numbers/null on
the row. SortTh `col` values map to these row keys:
`_deltaVsNow`, `_projGamesSort`, `_signalCountSort`, `_consistencySort`. No code change needed in the
switch beyond confirming the default arm covers them.

### 3.5 Table shell, colgroup, header, colSpan ([:150-178](src/components/players/OutlookTab.jsx))
- Change `tableClassName="table-fixed"` → `tableClassName="table-auto"`.
- **Remove the `colgroup={…}`** block ([:156-165](src/components/players/OutlookTab.jsx)) (omit the
  prop; `PlayersDataTable` defaults it to `null`). Rationale: 10 columns + fill the empty band, per
  the `NflStatsTab` precedent ([NflStatsTab.jsx:307-308](src/components/players/NflStatsTab.jsx)).
- `colSpan={6}` → `colSpan={10}` (both on `PlayersDataTable` [:166] and on the `ExpandableTableRow`
  [:187]).
- `header` ([:167-178](src/components/players/OutlookTab.jsx)) — insert four `SortTh` between Proj and
  Snap trend; keep the chevron `<th>`, Player, Proj, Snap/Opp/Role exactly:
  ```jsx
  <SortTh label="Δ vs now" col="_deltaVsNow" {...sortProps}
    tooltip="Projected PPG minus current/most-recent PPG (same PPG as the Value tab). Position-agnostic." />
  <SortTh label="Proj G" col="_projGamesSort" {...sortProps}
    tooltip="Projected games played next season (durability outlook). Position-agnostic." />
  <SortTh label="Signals" col="_signalCountSort" {...sortProps}
    tooltip="Projection signal flags (same as the Profile → Dynasty tab): ⚡ breakout · ↩ bounce-back · ↑↑/↓↓ trajectory · ⚠ TD-reliant · ↑/↓ age curve. Sorts by active-flag count." />
  <SortTh label="PPG ± SD" col="_consistencySort" {...sortProps}
    tooltip="Mean ± standard deviation of per-game fantasy points over the last 3 qualifying seasons (pooled). Sorts by mean. Position-agnostic." />
  ```

### 3.6 Row cells — `renderRow` ([:182-254](src/components/players/OutlookTab.jsx))
- `detail` prop ([:190](src/components/players/OutlookTab.jsx)) becomes a stacked fragment:
  ```jsx
  detail={
    <div className="space-y-4">
      <AdjustmentNarrative lines={row._adjustments} />
      <DistributionPanel c={row._consistency} />
      <UsageHistoryPanel history={row._history} shareMetric={row._history[0]?.shareMetric ?? null} />
    </div>
  }
  ```
- Keep chevron cell ([:193-198]) and Player cell ([:201-212]) verbatim.
- Keep Proj cell ([:214-230]) verbatim.
- **Insert four `<td>` after Proj, before Snap trend** ([:231]):
  ```jsx
  <td className="py-2 px-3"><DeltaCell proj={row.projectedPPG} cur={row.currentSeasonPPG} /></td>
  <td className="py-2 px-3 tabular-nums">
    {row._projGames != null ? row._projGames : <span className="text-[var(--color-text-faintest)] text-xs">—</span>}
  </td>
  <td className="py-2 px-3">{<SignalCluster signals={row._signals} /> ?? null}</td>
  <td className="py-2 px-3"><ConsistencyCell c={row._consistency} /></td>
  ```
  (For Signals, render `<SignalCluster …/>`; it returns `null` when empty → an empty cell, **not** `—`.)
- Keep Snap/Opp/Role cells ([:232-251]) verbatim.
- `profileContextValue` ([:258-262]) unchanged.

No change to `lastNonNull`, `ROLE_ORDER`, `TrendCell`, `UsageHistoryPanel`, `usageByPlayer`,
`roleCohort`, or the `PlayersDataTable` props beyond `tableClassName`/`colgroup`/`colSpan`.

---

## 4. No edits needed in these files (confirm, don't touch)
- `src/hooks/usePlayersTable.js` — sort/persistence already generic; new `col` keys just flow through.
- `src/components/players/PlayersDataTable.jsx` — `colgroup` already defaults `null`; render-prop
  `header`/`renderRow` already generic.
- `src/utils/outlookUsage.js` — Snap/Opp/Role + usage history unchanged.
- `src/utils/projectionSignals.js`, `seasonProjection.js`, `dynastyScore.js`, `App.jsx` — read-only
  consumers; **no source change** (display-only invariant).

---

## 5. Step sequence (for the implementer)
1. Add `src/utils/outlookConsistency.js` (§2) + its unit test (§ Tests 1). Run that test file green.
2. Edit `OutlookTab.jsx` (§3): imports → presenter helpers → `consistencyByPlayer` memo + `enrichedRows`
   keys → header (4 SortTh) → table-auto/no-colgroup/colSpan=10 → four cells + stacked `detail`.
3. Update `OutlookTab.test.jsx` fixtures + assertions (§ Tests 2).
4. Docs (§6).
5. `npm test` (full) · `npm run lint` (0) · `npm run build` (clean). No dev server (user smoke).

---

## 6. Docs updates (apply mechanically)

### 6.1 `docs/ui.md` — "Outlook tab" section ([docs/ui.md:137-165](docs/ui.md))
- **Column table ([:145-152](docs/ui.md))** — insert four rows after the **Proj** row and before
  **Snap trend**, leaving Snap/Opp/Role rows unchanged:
  ```
  | **Δ vs now** | `projectedPPG − currentSeasonPPG` (same PPG source as the Explorer/Value tab; `—` when either side missing). Arrow + signed delta. Position-agnostic |
  | **Proj G** | Projected games next season (`seasonProjections[id].projectedGames`) — durability outlook. Position-agnostic |
  | **Signals** | Compact glyph cluster reusing the Profile → Dynasty signal flags (`dynastyScore.signals`): ⚡ breakout · ↩ bounce-back · ↑↑/↓↓ trajectory · ⚠ TD-reliant · ↑/↓ age curve. Position-agnostic; renders nothing (not `—`) when no flag fires |
  | **PPG ± SD** | Pooled mean ± population SD of per-game fantasy points over the last 3 qualifying seasons (`gp ≥ 8`); `—` below the min-sample floor (≥2 qualifying seasons AND ≥10 pooled games). Position-agnostic |
  ```
- **Intro paragraph ([:139-143](docs/ui.md))** — append a sentence: "After Proj, three
  position-agnostic columns (Δ vs now, Proj G, Signals) and a Consistency PPG ± SD column fill the
  row for QBs as well as RB/WR/TE; Snap trend / Opp trend / Role remain RB/WR/TE-only."
- **"Row interactions" / expansion ([:161-165](docs/ui.md))** — replace the single-panel description
  with: "The chevron expands a three-section panel: (a) the projection's `adjustmentSummary` lines
  (the 'why'); (b) a per-season scoring-distribution table — Season · G · PPG · SD · CV (CV = SD ÷
  mean) with self-relative boom/bust rates (boom = games ≥ 1.5× the player's own pooled mean, bust ≤
  0.5×); (c) the existing per-season usage history (Season · G · Snap% · Carry/Target Share · PPG),
  unchanged, at the bottom. Population SD; min-sample floors prevent meaningless SD on tiny samples."
- Optional: note the table is now `table-auto` (no fixed colgroup) to fit the wider column set.

### 6.2 `CLAUDE.md`
- **src/utils table** — add a row (alphabetically near `outlookUsage.js`):
  ```
  | `outlookConsistency.js` | `extractGamePoints`, `computeSeasonConsistency`, `computeConsistency` — view-only per-game scoring-distribution helpers (pooled mean / population SD / CV / self-relative boom-bust over the last 3 qualifying seasons, `gp ≥ 8`). Reuses `careerStats[...].weeklyPoints`; never feeds projection/scoring. |
  ```
- **src/components table — `players/OutlookTab.jsx` row** — update the responsibility line to:
  "Players → Dynasty → Outlook table: next-season projection columns (Proj · Δ vs now · Proj G ·
  Signals) + scoring-consistency (PPG ± SD) + the existing snap/opp/role usage trends, with an
  expandable panel (adjustment narrative · per-season distribution · usage history). Display-only.
  Reuses `dynastyScore.signals` (same flags as the Profile Dynasty badges), `seasonProjections`
  (`projectedGames`/`adjustmentSummary`), `currentSeasonPPG` (same PPG as the Value tab),
  `outlookUsage.js`, and `outlookConsistency.js`. Shared `usePlayersTable`/`PlayersDataTable`."

### 6.3 `README.md`
- **Source tree comment ([README.md:123](README.md))** — update the `OutlookTab.jsx` comment to:
  "Players → Dynasty → Outlook table (projection: proj/Δ-vs-now/proj-games/signals + scoring
  consistency PPG±SD + snap/opp/role usage trends; expandable adjustment-narrative + distribution +
  usage history)".
- **Utils list ([README.md:160](README.md))** — add after the `outlookUsage.js` line:
  "`outlookConsistency.js`  # extractGamePoints / computeSeasonConsistency / computeConsistency —
  view-only per-game scoring distribution (pooled mean / population SD / CV / boom-bust)".

### 6.4 `docs/signal-registry.md`
Add **one** row to the view-only/computed-factor (view-layer) block, next to the existing Outlook
entries ([docs/signal-registry.md:100-102](docs/signal-registry.md)):
```
| Outlook scoring consistency (pooled per-game mean / population SD / CV / self-relative boom-bust) | computed factor (view-layer) | app: `src/utils/outlookConsistency.js`, from in-memory `careerStats[...].weeklyPoints` | last 3 qualifying seasons (gp≥8); weeklyPoints 2018+ where present | **Reconstructable** (pure fn of weekly points) | **view-only display** (Players Outlook tab; never moves `projectedPPG`/dynasty score) |
```
No other registry change: this reuses already-registered projection signals (breakout/bounce-back/
TD-reliant/momentum/age-curve) and the registered `currentSeasonPPG`/`projectedGames`/
`adjustmentSummary` outputs — nothing is reclassified, no raw source or ephemeral capture is added.

### 6.5 `docs/projection.md`
**None.** We consume `projectedGames`/`adjustmentSummary`/signal flags read-only; we do not change the
projection, its `factors` shape, or the `adjustmentSummary` copy.

---

## 7. Open choices (intentional defaults — implementer may keep as-is)
1. **Distribution table = window (3 seasons), not all seasons.** Chosen so the table explains the
   inline pooled stat and boom/bust stays coherent. Alternative (all seasons, SD/CV omitted below
   floor) is viable but decouples the table from the pooled number.
2. **Age-curve glyph dead-band ±0.05** around `ageCurveFactor = 1.0`. The only display threshold in
   the Signals cluster (boolean flags need none). View-only; differs from the Profile's no-dead-band
   `×factor` label by design (compact glance vs. detail).
3. **Signals sorts by active-flag count** (0 → sinks). The cluster has no single magnitude; flag count
   is the natural ordering.
4. **Consistency sorts by pooled mean** (the leading number). SD-based sort is a possible later toggle.

## 8. No-NaN audit (acceptance)
Every new numeric render is null-/zero-guarded: `DeltaCell` (`proj==null || cur<=0 → —`), `Proj G`
(`null → —`), `ConsistencyCell` (eligibility gate `→ —`), `DistributionPanel` (each of PPG/SD/CV
null-checked), `SignalCluster` (`!signals → null`; `tdDependency ?? 0`). Helper never divides by zero
(`mean<=0 → cv/boom/bust null`; `populationStdDev` guards empty). No `.toFixed` on a possibly-null
value without a prior `!= null` check.

---

## Tests to add

### 1. `src/utils/outlookConsistency.test.js` (co-located unit) — NEW
Pure-function coverage. Hand-compute expected values.

- **`extractGamePoints`**
  - object form `{"1":10,"2":20,"5":0}` → `[10,20,0]` (0 kept; absent weeks dropped).
  - non-finite mixed `{"1":10,"2":null,"3":"x"}` → `[10]`.
  - negative kept: `{"1":-3,"2":12}` → `[-3,12]`.
  - `undefined`/`{}` → `[]` (no throw).
- **`computeSeasonConsistency`**
  - 10 games `[10×10]` (all equal) → `mean:10, sd:0, cv:0`.
  - known set, e.g. `[12,8,10,14,6,16,9,11]` (8 games): `mean=10.75`, population
    `sd=Math.sqrt(mean of squared devs)` — assert with `toBeCloseTo`; `cv=sd/mean`.
  - 5 games (< `PER_SEASON_MIN_GAMES=8`) → `games:5, mean:<num>, sd:null, cv:null`.
  - all-zero games `[0,0,…0]` (≥8) → `mean:0, sd:0, cv:null` (mean ≤ 0 → cv null).
  - empty season → `{games:0, mean:null, sd:null, cv:null}`.
- **`computeConsistency`**
  - `null` careerStats → `null`; player with 0 qualifying seasons → `null`.
  - 1 qualifying season only → `window:1`; inline-ineligible (caller gate) — assert `window<2`.
  - 2 qualifying seasons, each 8 games, ≥10 pooled → `window:2`, `pooledGames:16`, `mean`/`sd`
    (population, pooled) via `toBeCloseTo`, `cv` set, `seasons.length===2` **most-recent first**
    (assert `seasons[0].season > seasons[1].season`).
  - sub-8-GP season present but **excluded** from window (e.g. a 5-GP season between two 10-GP
    seasons is skipped; window pulls the next-older 10-GP season).
  - **>3 qualifying seasons** → only the latest 3 used (`window:3`).
  - **pooled-floor edge:** 2 seasons that qualify on GP but yield only `pooledGames:9` finite weekly
    points (sparse `weeklyPoints`) → `sd:null, cv:null, boomRate:null, bustRate:null` (below
    `MIN_POOLED_GAMES=10`) while `mean` is still a number and `window:2`.
  - **boom/bust exact:** craft pooled games where a known share are ≥1.5×mean and ≤0.5×mean; assert
    `boomRate`/`bustRate` exact fractions.
  - **null-safety:** missing `weeklyPoints` on a gp≥8 season → that season contributes 0 pooled games;
    no throw, no NaN.

### 2. `src/components/players/OutlookTab.test.jsx` (co-located component) — UPDATE
First, **update fixtures** in the existing file ([OutlookTab.test.jsx:23-75](src/components/players/OutlookTab.test.jsx)):
- Add `weeklyPoints` objects to `careerStats` entries for `wr1` (give it ≥2 qualifying seasons, ≥10
  pooled games so the Consistency cell is eligible) and keep `rk1`/`qb1` sparse so theirs read `—`.
- Add `seasonProjections` with `{ wr1:{ projectedGames:16, adjustmentSummary:['Growing role ↑'] },
  qb1:{ projectedGames:17, adjustmentSummary:[] } }` (replace the empty `{}` at [:69]).
- Give `wr1` a real `dynastyScore.signals` object (e.g. `{ isBreakout:true, isBounceBack:false,
  momentumLabel:'accelerating', isTdReliant:false, ageCurveFactor:1.10, tdDependency:0.2 }`); leave
  others `dynastyScore:null`.
- Keep `wr1.currentSeasonPPG=12.0`, `projectedPPG=14.2` (Δ = +2.2), `qb1.currentSeasonPPG=22.0`,
  `projectedPPG=22.0` (Δ ≈ 0 → `→`), `rk1.projectedPPG=null` (Δ → `—`).

Then add/adjust assertions:
- **Δ vs now:** `wr1` shows `↑+2.2` (positive token); `qb1` shows `→` neutral (Δ≈0); `rk1` shows `—`.
- **Proj G:** `wr1` → `16`, `qb1` → `17`; a row with no `seasonProjections` entry → `—`.
- **Signals:** `wr1` cluster shows `⚡` and `↑↑` and an age `↑` (ageCurveFactor 1.10 ≥ 1.05); rows with
  `dynastyScore:null` render an **empty** Signals cell (assert no `—` is *added* by that cell — i.e.
  the glyphs are absent, cell empty).
- **Consistency:** `wr1` shows `<mean>.toFixed(1)` + `±<sd>.toFixed(1)`; `rk1`/`qb1` (below floor) → `—`.
- **Expansion:** after clicking `wr1`'s chevron, assert the adjustment chip `Growing role ↑` is
  visible, the distribution table header row (Season/G/PPG/SD/CV) is present, AND the existing usage
  history (2024/2023) still renders below.
- **Sort:** clicking the new `Δ vs now` / `PPG ± SD` / `Proj G` headers toggles the indicator
  (`↑`/`↓`) like the existing Proj test ([:155-162](src/components/players/OutlookTab.test.jsx));
  nulls remain at the bottom.
- **Re-validate existing assertions** that count `getAllByText('—')` / use `getByText('14.2')`: with
  the four new columns, `getByText('14.2')` could become ambiguous if a consistency mean also renders
  `14.2` — choose fixture values that avoid collisions, or switch those queries to `getAllByText`/
  scoped `within(row)` queries. The `not.toMatch(/NaN|undefined/)` guard ([:164-167]) must still pass.

### 3. Contract test — **none.**
This change adds no `factors` key, touches no projection/scoring/data shape, and imports nothing into
projection/scoring — so `factorsSchema.test.js`/`statKeysContract.test.js`/`advStatsViewOnly.test.js`/
`scheduleViewOnly.test.js` are unaffected and need no new entry. The display-only invariant is
enforced structurally (no projection/scoring module imports `outlookConsistency.js`); optionally a
one-line grep-style guard could assert that, but it is not required by an existing pattern.

---

## Cross-repo impact

**None.** All inputs are already in memory in the app: `careerStats[...].weeklyPoints/gamesPlayed`
(served season-totals, already consumed by `NflStatsTab`/Profile), `seasonProjections`
(`projectedGames`/`adjustmentSummary`, computed in-app), `dynastyScore.signals` (computed in-app),
and `currentSeasonPPG` (computed in-app). No served-JSON shape, manifest field, snapshot envelope,
`schemaVersion`, or sparsity floor changes. `sleeper-dashboard-data` needs no mirror.
