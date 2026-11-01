# Market · Efficiency onto the fact-view path, plus Performance filters

**Review depth: full** — Market state/module change (a column set moves render paths, persisted keys
`market-sort`/`market-filters`/`market-filter-presets` gain or lose valid values), a new view-only util
module, a ranking-registry extension, one `App.jsx` prop removal on `<Market>` (the element both seam
guards parse), and a cross-repo index entry (CR-19) whose App site moves.

Session 1: opus, high. Session 2: **sonnet**, medium. Visual change — Session 2 runs the app from
`.claude/launch.json`; Anton judges the result.

**Status: plan approved by Anton 2026-11-01 — ready for Session 2 (sonnet).** Plan-reviewer (full) flags 1–9
folded in before approval.
(Flag 6 — header tooltips — recorded as a visible loss in §0, not restored; flag 7 — min-games bound scaled per
window, §8; flag 9 — measured 33.6KB before fold-in.)

Builds on market-window-stats Slices A/B (`market-window-stats-a-data.md`, `market-window-stats-b-fact-views.md`).
Live source wins over both.

---

## 0. What this is, for Anton

Efficiency stops being pinned to last season. It follows the Window selector like Overview/Stats/Usage and
every rate carries a position rank. Each position gets its own efficiency columns (QB passing rates, RB
rushing rates, WR/TE catching rates); the ALL pill gets a small set every position fills, so QBs and RBs no
longer read "—" across the board. The play-by-play columns (EPA, CPOE, RACR) only exist for last completed
season — and RACR also for this season so far — so they show "—" on other windows, and the caption says which
apply. Two new filters, **Min games** and **Min snap %**, read the window you are looking at; they apply on the
four fact views and sit greyed-out on Value/Outlook/In-season. The filter panel regroups so the model-based
filters (dynasty group, market signal, KTC, projected games) sit together under **Model**.

Visible losses, by design: Efficiency no longer has the TREND (KTC sparkline) column — no fact view does —
and its old share columns (Tgt share, AY share, RZ share, Snap%, Carry share, Drops, YAC, Broken tackles, AY/att)
are gone from Efficiency; the shares already live on Usage. The old Efficiency headers' hover tooltips (each
metric's definition and its minimum sample — 100 attempts / 25 carries / 25 targets) also go: the fact-view
table gives metric columns no tooltip, and this slice leaves that table unchanged. A player under a minimum reads
"—" with no on-screen explanation.

## 1. Scope

In: `marketMetrics.js` (advanced metrics), a new `src/utils/marketAdvanced.js`, `factViews.js` (Efficiency
descriptors, per-pill default sort, caption helper), `Market.jsx` (wiring + deleting the old branch),
`columnDescriptors.js` (delete `EFFICIENCY_COLUMNS`), `marketFilters.js`, `FilterBar.jsx`, `FilterPanel.jsx`,
one prop line in `App.jsx`, tests, docs, the CR-19 index line.

Out (do not touch): the Model view merge; deleting Value/Outlook/In-season code; pop-up changes; loading
gamelogs for more seasons; removing `market-production-season`; `FactTable.jsx` code (needs no change — see §4; its header comment is the one edit, §11);
`seasonEfficiency.js`, `liveAdvStats.js`, `usageEfficiency.js` (`METRIC_META` keeps its Efficiency entries even
though Market stops reading them — not this slice's cleanup) — **code** in these three is untouchable; only the
header-comment edits §11 names are allowed; `marketWindowStats.js`.

Factual note on the brief: `liveAdvStats.js` has no consumer besides Market today (Portfolio imports
`seasonEfficiency.js` only; `qbSeason.js` imports neither). After this slice its only importer is the new
`marketAdvanced.js`. Kept, as the brief says.

## 2. `src/utils/marketMetrics.js` — advanced metrics

Still imports nothing. Add one formatter and six metrics. Advanced metrics read an optional `ws.adv`
side-object (built only by `marketAdvanced.js`, §3) and carry `adv: true`.

```js
const signed1 = v => (fin(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : NA)
const av = k => ws => ws.adv?.[k] ?? null
// adv rates have no `basis`: rankWindow's games floor uses ws.gp (the source season's games).
const advRate = (id, label, positions, k, format, minVolume) =>
  ({ id, label, positions, kind: 'rate', value: av(k), format, better: 'high', minVolume, adv: true })
```

Append to `MARKET_METRICS` (after `rzRushShare`):

| id | label | positions | kind | format | minVolume |
|---|---|---|---|---|---|
| `epaPerAtt` | `EPA/att` | `['QB']` | rate (advRate) | `dec2` | `PASS` |
| `cpoe` | `CPOE` | `['QB']` | rate (advRate) | `signed1` | `PASS` |
| `rushEpaTotal` | `Rush EPA` | `['QB']` | **total** — `{ id, label, positions, kind: 'total', value: av('rushEpaTotal'), format: dec1, better: 'high', adv: true }` | `dec1` | none |
| `rushEpaPerAtt` | `Rush EPA/att` | `['RB']` | rate (advRate) | `dec2` | `RUSH` |
| `epaPerTgt` | `EPA/tgt` | `['WR', 'TE']` | rate (advRate) | `dec2` | `TGT` |
| `racr` | `RACR` | `['WR', 'TE']` | rate (advRate) | `dec2` | `TGT` |

`rankWindow` is **unchanged**: a metric whose value is null for every ws ranks nobody, so on an uncovered
window these columns carry no ranks. `PER_GAME_TWIN` unchanged (`rushEpaTotal` has no twin — Efficiency has no
per-game toggle). The source floors (`MIN_PASS_ATTEMPTS`/`MIN_CARRIES`/`MIN_TARGETS`, applied inside
`computeSeasonEfficiency`/`flooredRacr`) still null the value first; `minVolume` and the half-max games floor
then gate *ranking* exactly as for the box-score rates beside them ("the same floors").

## 3. New `src/utils/marketAdvanced.js`

View-only, pure, no React. Header comment in the style of `marketWindowStats.js`: never feeds
projection/scoring; never mutates `windowStats`, its ws objects, or any loader result. Imports exactly
`./liveAdvStats` (`usableLiveAdvStats`, `flooredRacr`, `liveRacrCell`).

```js
export const GAMELOG_ADV_KEYS = ['epaPerAtt', 'cpoe', 'rushEpaTotal', 'rushEpaPerAtt', 'epaPerTgt']

/**
 * @returns {{ stats: Map|null, coverage: { gamelogs: State, racr: State, racrLiveAvailable: boolean } }}
 *   State = 'covered' | 'outside' | 'unloaded'
 */
export function buildAdvanced({
  windowStats,        // Map<pid, ws> from buildWindowStats, or null
  window,             // the active window ({ id, kind, seasons, label }) or null
  dataSeason,         // Market's completedSeasons[0]
  seasonEfficiency,   // computeSeasonEfficiency(...) output for dataSeason, or null when gamelogs for dataSeason are not complete
  advStats,           // completed-season advstats loader result (or null)
  advStatsLive,       // live-season advstats loader result (or null)
  liveSeason,         // Market's liveSeason prop (nflState.season)
  liveWindowSeason,   // seasons[0] of the live window in Market's `windows`, or null when there is none
})
```

Coverage rules (the brief's coverage rule, made exact):

- `isDataSeasonWindow = window?.kind === 'season' && window.seasons.length === 1 && window.seasons[0] === dataSeason`
  (with `dataSeason` finite).
- `isLiveWindow = window?.kind === 'live'`.
- `liveById = usableLiveAdvStats(advStatsLive, liveSeason, dataSeason)`.
- `gamelogs` = `isDataSeasonWindow ? (seasonEfficiency ? 'covered' : 'unloaded') : 'outside'`.
- `racr` =
  - `isDataSeasonWindow` → `advStats?.complete && advStats.year === dataSeason ? 'covered' : 'unloaded'`;
  - `isLiveWindow` → `liveById != null && liveSeason === window.seasons[0] ? 'covered' : 'unloaded'`;
  - otherwise `'outside'`.
- `racrLiveAvailable = liveById != null && liveWindowSeason != null && liveSeason === liveWindowSeason`
  (caption only — tells the reader RACR exists on the live window too).

Gamelogs are pinned to `dataSeason` deliberately even though the pop-up can widen `gameLogsByYear` to other
seasons: coverage that appeared only after a pop-up visit would make a column fill in or blank out depending on
what the user clicked earlier.

Stats (`coverage` is always computed by the rules above, whatever `windowStats` is):

- `windowStats` null → `stats: null` (coverage still returned).
- `gamelogs !== 'covered' && racr !== 'covered'` → `stats` **is the input `windowStats` (same reference)**;
  no ws gains `adv`.
- Otherwise a **new** `Map`; for each `[pid, ws]`: `{ ...ws, adv }` where `adv` has all six keys:
  - each `GAMELOG_ADV_KEYS` key: `gamelogs === 'covered' ? (seasonEfficiency[pid]?.[k] ?? null) : null`
    (`seasonEfficiency` values are already floored and finite-or-null);
  - `racr`: `racr !== 'covered' ? null : isLiveWindow ? (liveRacrCell(liveById[pid])?.racr ?? null) : flooredRacr(advStats.byId?.[pid])`.

`liveRacrCell` keeps the live column's rules (≥ `MIN_TARGETS` targets, integer `weeks ≥ 1`). The old
"· N wks" suffix is dropped: on the live window the caption already names the season to date.

## 4. `src/components/market/factViews.js`

Still imports exactly `../../utils/marketMetrics`.

- `FACT_VIEWS = ['overview', 'stats', 'usage', 'efficiency']`.
- `FACT_VIEW_COLUMNS.efficiency` (`G` is the existing value column; `m` the existing helper):
  - `QB: [G, ...['cmpPct', 'ypa', 'passTdRate', 'intRate', 'sackRate', 'passerRating', 'passAdot', 'ypc', 'epaPerAtt', 'cpoe', 'rushEpaTotal'].map(m)]`
  - `RB: [G, ...['ypc', 'yacoPerAtt', 'btklRate', 'catchPct', 'ypr', 'dropRate', 'rushEpaPerAtt'].map(m)]`
  - `WR` and `TE` (one shared const `EFFICIENCY_REC`): `[G, ...['catchPct', 'ypr', 'ypt', 'aDOT', 'dropRate', 'epaPerTgt', 'racr'].map(m)]`
  - `ALL: [G, ...['fpPerG', 'oppPerG', 'scrimYdPerG'].map(m)]` — every metric here is registered for all four
    positions, so no row reads "—" for want of a position. Justification: no rate in the registry is
    meaningful across QB and skill players, so ALL shows the per-game production that is (points, opportunities,
    scrimmage yards); ranks stay within position as everywhere else.
  - `G` is added (not in the brief's lists) because every rate here is read against its sample size; it is the
    same column Overview and Usage already lead with.
- Default sorts:
  ```js
  export const FACT_DEFAULT_SORT = { ...existing three, efficiency: { column: 'fpPerG', direction: 'desc' } }
  const EFFICIENCY_DEFAULT_SORT = {
    QB: { column: 'passerRating', direction: 'desc' },
    RB: { column: 'ypc', direction: 'desc' },
    WR: { column: 'ypt', direction: 'desc' },
    TE: { column: 'ypt', direction: 'desc' },
    ALL: FACT_DEFAULT_SORT.efficiency,
  }
  export function factDefaultSort(view, pos) {
    if (view === 'efficiency') return EFFICIENCY_DEFAULT_SORT[pos] ?? EFFICIENCY_DEFAULT_SORT.ALL
    return FACT_DEFAULT_SORT[view]
  }
  ```
- `export function advancedCaption(pos, coverage, dataSeason)` — returns `''` or a string starting `' · '`.
  1. `cols` = `FACT_VIEW_COLUMNS.efficiency[pos] ?? ...ALL`, keep metric columns whose `METRIC_BY_ID[id].adv`;
     none → `''` (so ALL, and any `coverage == null`, → `''`).
  2. Split into gamelog columns (id ≠ `racr`) and the RACR column; each group takes its state from
     `coverage.gamelogs` / `coverage.racr`. Labels are the metric labels, in column order, joined `', '`.
  3. Parts, in this order: covered labels (both groups, column order) → `${labels}: this window`; then, per group
     in column order, `outside` → gamelogs `${labels}: ${dataSeason} season only`, RACR
     `RACR: ${dataSeason} season${coverage.racrLiveAvailable ? ' and live window' : ''} only`; `unloaded` →
     `${labels}: not loaded`. When `dataSeason` is not finite (no completed season in `careerStats`), an `outside`
     group reads `${labels}: not available` instead — never prints `null`.
  4. Return `' · ' + parts.join(' · ')`.

  Expected outputs (dataSeason 2025), asserted in §10:
  | pos | gamelogs | racr | racrLiveAvailable | result |
  |---|---|---|---|---|
  | WR | covered | covered | – | ` · EPA/tgt, RACR: this window` |
  | WR | outside | outside | true | ` · EPA/tgt: 2025 season only · RACR: 2025 season and live window only` |
  | WR | outside | covered | true | ` · RACR: this window · EPA/tgt: 2025 season only` |
  | WR | outside | outside | false | ` · EPA/tgt: 2025 season only · RACR: 2025 season only` |
  | QB | unloaded | outside | false | ` · EPA/att, CPOE, Rush EPA: not loaded` |
  | RB | covered | covered | – | ` · Rush EPA/att: this window` |
  | ALL | covered | covered | – | `` |
  | WR (dataSeason `null`) | outside | outside | false | ` · EPA/tgt: not available · RACR: not available` |

  (QB/RB have no RACR column, so the RACR state is ignored for them.)
- `snapCoverageIncomplete`, `prevWindowFor`, `rankOptionsFor`, `factColumns`, `factSortableKeys`,
  `factCellValue`, `factCellRank` — unchanged.

`FactTable.jsx` needs no code change (header comment only, §11): it renders whatever `factColumns` returns and reads values/ranks through
`factCellValue`/`factCellRank` from the `windowStats`/`ranks` props Market passes. Its import-guard test stays as is.

## 5. `src/components/market/Market.jsx`

**Delete** (with their comments): `EFFICIENCY_LEAD_SORT`, `getEfficiencyDefaultSort`, the `efficiency` entry of
`DEFAULT_SORT` (it now arrives via `...FACT_DEFAULT_SORT`), `EFFICIENCY_SORTABLE_KEYS`,
`EFFICIENCY_SORTABLE_KEYS_BY_POS`, the `efficiency` entries of `SORTABLE_KEYS` and `SORT_LABELS`,
`fmtEfficiencyValue`, `efficiencyColumnLabel`, the old `seasonEfficiency` memo, `liveById`/`showLiveRacr`,
`efficiencyRows`, the `efficiency` arm of `enrichedRows`, the `efficiency` sort branch in `displayRows`, the
`efficiency` arm of `activeColumnLabel`, the `else if (columnSet === 'efficiency')` header/row render branch,
and the Efficiency caption `<p>`. Remove imports that become unused: `EFFICIENCY_COLUMNS`,
`buildRzShareSeries`/`METRIC_META` (the whole `usageEfficiency` import), and the `liveAdvStats` import. Keep
`computeSeasonEfficiency`. Drop `historicalTeamTotals` from the props destructure (its only reader was
`efficiencyRows`); keep `gameLogsByYear`, `teamContextByYear` (still feeds `rankTable`), `advStats`,
`advStatsLive`, `liveSeason`. Rewrite the prop-comment block above `inSeasonSortValue` so it says these feed the
Efficiency fact view's advanced columns via `marketAdvanced.js`. Update the file-header comment's history line
(Efficiency is now a fact view following the window).

**Change:**

1. Import `factDefaultSort`, `advancedCaption` from `./factViews`; `buildAdvanced` from `../../utils/marketAdvanced`.
2. `handleSelectColumnSet`: `setSortState(FACT_VIEWS.includes(next) ? factDefaultSort(next, posFilter) : DEFAULT_SORT[next])`.
3. `handleSelectPosFilter`: keep the wrapper; when `columnSet === 'efficiency'` call
   `setSortState(factDefaultSort('efficiency', next))` after `handlePosFilter(next)` (pill reset to the new
   pill's default). Update its comment.
4. Validity effect: the fact branch falls back to `factDefaultSort(columnSet, posFilter)`; delete the whole
   `columnSet === 'efficiency'` branch; drop `advStatsLive`/`showLiveRacr` from the deps. A stored `market-sort`
   of an old Efficiency key (`aySh`, `racrLive`, `epaPerAtt` under a WR pill, …) is not in
   `factSortableKeys('efficiency', pos)` and falls back to that pill's default — this is the stale-sort path.
5. After `windowStats`:
   ```js
   const seasonEfficiency = useMemo(() => {
     if (columnSet !== 'efficiency' || dataSeason == null || !gameLogsByYear?.[dataSeason]?.complete) return null
     // carrySh (the only teamcontext join) is unused by the fact view, so no teamcontext is passed.
     return computeSeasonEfficiency(gameLogsByYear[dataSeason], null, dataSeason)
   }, [columnSet, gameLogsByYear, dataSeason])
   const liveWindowSeason = windows.find(w => w.kind === 'live')?.seasons[0] ?? null
   const advanced = useMemo(() => (columnSet === 'efficiency'
     ? buildAdvanced({ windowStats, window: activeWindow, dataSeason, seasonEfficiency, advStats, advStatsLive, liveSeason, liveWindowSeason })
     : null), [columnSet, windowStats, activeWindow, dataSeason, seasonEfficiency, advStats, advStatsLive, liveSeason, liveWindowSeason])
   const factStats = advanced ? advanced.stats : windowStats
   ```
   `windowRanks` ranks `factStats` (memo deps `[factStats, activeWindow]`). FactTable gets
   `windowStats={factStats}`. `windowStats` itself (Slice A's output) is never written.
6. `displayRows`: pass `windowStats: isFactView ? factStats : null` into `applyMarketFilters`' ctx; add
   `isFactView`/`factStats` to the deps.
7. Header count: `activeFilterCount(filters, { performanceApplies: isFactView })`.
8. `filterBar`: pass `performanceApplies={isFactView}` to `FilterBar`.
9. Caption: inside the existing `isFactView && activeWindow` paragraph, after the scoring clause:
   the snap clause condition becomes `(columnSet === 'overview' || columnSet === 'usage') && snapCoverageIncomplete(windowStats)`
   (Efficiency has no Snap% column; Overview/Usage behaviour identical to today); then append
   `{columnSet === 'efficiency' ? advancedCaption(posFilter, advanced?.coverage, dataSeason) : ''}`.
10. `COLUMN_SETS`, `COLUMN_SET_LABELS`, `COLUMN_SET_GROUPS` and `loadColumnSet` are unchanged — the id stays
    `'efficiency'`, so a stored `market-column-set: 'efficiency'` opens Efficiency, now with the Window select.

## 6. `src/components/market/columnDescriptors.js`

Delete `EFFICIENCY_COLUMNS` (and its `.TE`/`.ALL` aliases and comment block). Rewrite the header comment to
cover Outlook only. Before deleting, `grep -rn EFFICIENCY_COLUMNS src` must show only Market.jsx (removed in §5)
and this file.

## 7. `src/App.jsx`

Delete exactly the one line `historicalTeamTotals={historicalTeamTotals}` inside the `<Market` element.
Nothing else in App.jsx.

## 8. Filters — `src/utils/marketFilters.js`

- Constants: `export const MAX_MIN_GAMES = 400` (the **storage** ceiling — a generous career bound, so a value set
  on a career window survives normalisation) and `export const MAX_MIN_SNAP_PCT = 100`. The **slider** bound is
  per window, from `minGamesSliderMax` (below), not this constant.
- `export function minGamesSliderMax(window, windowStats)`: `season`/`live` → 17; `last3` → 51 (17 × 3);
  `career` → `Math.max(17, max ws.gp over windowStats)` (0 entries → 17); no window → 17. Pure; Market calls it.
- `DEFAULT_MARKET_FILTERS` gains, after `fantasyTeams`:
  `minGames: 0,   // window games played >= N; 0 = off (fact views only)` and
  `minSnapPct: 0, // window snap share >= N%; 0 = off (fact views only)`.
  Update the "sixteen" comments to eighteen.
- Validators: `isValidMinGames = v => Number.isInteger(v) && v >= 0 && v <= MAX_MIN_GAMES`,
  `isValidMinSnapPct = v => Number.isInteger(v) && v >= 0 && v <= MAX_MIN_SNAP_PCT`.
- `normalizeFilters`: `minGames`/`minSnapPct` validated, default 0 when absent or invalid (both MUST be in the
  returned literal — same trap as the env keys' comment).
- `isRestorableFilters`: absent-OK, present-invalid fails, exactly like the env keys
  (`(raw.minGames === undefined || isValidMinGames(raw.minGames)) && …`), with a comment saying why.
- `applyMarketFilters(rows, filters, ctx)`: ctx gains `windowStats` (a `Map<pid, ws>` or null/absent). New
  **PERFORMANCE** section placed after TEAM (mirrors the panel order); update the JSDoc order line and ctx doc:
  ```js
  // PERFORMANCE — facts from the active window. Inert without `windowStats` (Market passes it only on the
  // fact views), so a stored value never filters Value/Outlook/In-season.
  if (windowStats) {
    if (f.minGames > 0) out = out.filter(r => (windowStats.get(r.player_id)?.gp ?? 0) >= f.minGames)
    if (f.minSnapPct > 0) out = out.filter(r => {
      const s = windowStats.get(r.player_id)?.usage?.snapPct
      return Number.isFinite(s) && s >= f.minSnapPct / 100   // divide the threshold, never multiply s (0.29*100 < 29)
    })
  }
  ```
  A row with no ws in the window, or a null snap share (pre-2020 seasons, no snap data), survives at rest and is
  dropped once the control moves — the graceful-null rule every range filter follows.
- `activeFilterCount(f, { performanceApplies = true } = {})`: counts `minGames > 0` and `minSnapPct > 0` only when
  `performanceApplies`. Existing callers without the second arg are unaffected.

## 9. `FilterBar.jsx` + `FilterPanel.jsx`

**FilterBar** — new props `performanceApplies = true` and `minGamesMax = 17`, both passed through to
`FilterPanel`. Market passes `minGamesMax={minGamesSliderMax(activeWindow, factStats)}` (import from
`marketFilters`; with no active window it returns 17). `buildPills` adds, after
the fantasy-team pill: `minGames` → `` `Min ${n} G played` ``; `minSnapPct` → `` `Snap ≥ ${n}%` ``. When
`!performanceApplies` those two pills keep their `×` (clearOne/Reset all still work) but render with
`opacity-50` and `title="Not applied on Value, Outlook or In-season"`. The existing `Min ${n} games` pill
(projected games) is unchanged. Presets save/apply/delete code unchanged — `normalizeFilters`/`isRestorableFilters`
carry the new keys.

**FilterPanel** — new props `performanceApplies = true`, `minGamesMax = 17`. `GroupLabel`'s div gains
`data-testid="filter-group-label"` (the label text is its first child text node; `NewBadge` is a following
`<span>`). Groups, in this DOM order:
**Player · Availability · Team · Performance · Model · Environment**, then the Reset/Apply cell (`col-start-4`).

- **Performance** (`<GroupLabel>Performance<NewBadge /></GroupLabel>`): `SingleSlider` "Min games played",
  `min={0} max={Math.max(minGamesMax, filters.minGames)} step={1}` (the `Math.max` keeps a value stored on a longer
  window visible and draggable back down on a shorter one; on that shorter window it filters out every player
  below it, as stored), `format={n => (n === 0 ? 'any' : `${n}+`)}`; `SingleSlider`
  "Min snap %", `min={0} max={MAX_MIN_SNAP_PCT} step={5}`, `format={n => (n === 0 ? 'any' : `${n}%+`)}`.
  Both read the active window. When `!performanceApplies`: both sliders `disabled`, plus one line
  `<p className="text-[11px] text-dp-muted">Applies to Overview, Stats, Usage and Efficiency only.</p>`.
- **Model**: the former Dynasty group's three controls (dynasty chips, market signal, KTC range) followed by
  the former Projection group's "Min projected games" slider — controls moved unedited. The `Dynasty` and
  `Projection` group labels go away.
- `SingleSlider` gains an optional `disabled` prop (additive): sets `disabled` on the `<input>` and
  `opacity-50` on the wrapper. Omitted, it renders exactly as today.
- Slider bounds must equal the defaults (0) so "off" stays reachable by dragging — same rule as the file header.

## 10. Tests (each names its defect; each must be shown failing with the defect reintroduced)

**Removed, not bent:** Market.test.jsx's whole `describe('Efficiency column set (dp-v2 5b)', …)` block (incl.
the nested `live RACR column` describe) — its subject (row builder, `_eff`, per-position lead sorts, "· N wks")
no longer exists; its live-RACR and floor intents are re-asserted below against the new path. Two mixed tests
lose only their Efficiency lines, every Value/Outlook/In-season assertion byte-identical:
- Market.test.jsx `'renders the Value, Outlook and Efficiency sets with their own headers'`: delete the comment
  and the two Efficiency lines at its end. (Title stays — renaming is not needed and keeps the diff minimal.)
- Market.factViews.test.jsx case `15`: remove the `['Efficiency', /Target share/]` tuple from the loop (Efficiency
  now *has* a Window select, so the tuple would assert the opposite of the new behaviour).

**`src/utils/marketAdvanced.test.js` (new)** — hand-built ws via a small `mk` like marketMetrics.test.js:
1. dataSeason window, gamelogs + advStats complete → every ws in `stats` has `adv` with the seasonEfficiency
   values and `flooredRacr` RACR; coverage `covered/covered`. *Fails if adv is not attached on the covered window.*
2. `last3`, `career` and a non-dataSeason `season` window → `stats` **is** the input Map (`toBe`), no ws has `adv`,
   coverage `gamelogs: 'outside'`, `racr: 'outside'`. *Fails if EPA/RACR leak into uncovered windows.*
3. live window, usable `advStatsLive` (year = liveSeason > dataSeason, liveSeason = window season): RACR from the
   live row; all five gamelog keys null even when `seasonEfficiency` is passed; a 24-target row → null; a
   `weeks: 0` row → null. *Fails if the live window shows EPA, or the target/weeks floor is skipped.*
4. live window with `liveSeason !== window.seasons[0]` → `racr: 'unloaded'`, no `adv`. *Fails if a mismatched live
   load is shown as this window's.*
5. dataSeason window with `seasonEfficiency: null` → `gamelogs: 'unloaded'`, EPA null; `advStats.year !== dataSeason`
   → `racr: 'unloaded'`. *Fails if a wrong-season or incomplete source is presented as covered.*
6. Frozen inputs (deep-freeze windowStats' ws objects, seasonEfficiency, advStats, advStatsLive) on the covered
   window: no throw; input ws still has no `adv`; output ws `!==` input ws. *Fails if the builder mutates Slice A's
   output or a loader result.*
7. `racrLiveAvailable`: true only when liveById usable and `liveWindowSeason === liveSeason`; false with
   `liveWindowSeason: null`. *Fails if the caption claims a live window that is not in the select.*
8. `windowStats: null` → `stats: null`.

**`marketMetrics.test.js`:**
- New: each adv metric reads `ws.adv` and is null when `adv` is absent; with `adv` present it ranks when the ws is
  eligible (a single eligible ws ranks `{ rank: 1, of: 1 }`, as for every metric); when no ws has `adv` it is null
  for every ws. *Fails if adv metrics read the wrong object or rank "—" values.*
- New: `epaPerTgt` respects `minVolume` (a 2 tgt/G receiver with a value is unranked). *Fails if the adv rates
  skip the shared volume floor.*
- Changed `'basis pairs'`: the last assertion becomes
  `MARKET_METRICS.filter(m => m.kind === 'rate' && !m.adv).every(m => m.basis)` plus
  `MARKET_METRICS.filter(m => m.adv).every(m => !m.basis)`. *Still fails if a box-score rate loses its basis; newly
  fails if an adv rate gets a basis (which would read a missing basisGp → 0 games → never ranked).*
- Changed `'every total has a twin'`: iterate `kind === 'total' && !x.adv`. *Still fails on a box-score total
  without a twin.*

**`factViews.test.js`:** the existing descriptor/position loops pick up `efficiency` via `FACT_VIEWS` unedited.
- New: every metric column of `FACT_VIEW_COLUMNS.efficiency.ALL` has `positions` containing all of QB/RB/WR/TE.
  *Fails on the old reuse of one position's list for ALL.*
- New: for each pill, `factDefaultSort('efficiency', pos).column` is in `factSortableKeys('efficiency', pos)`,
  and `factDefaultSort('overview', 'QB')` equals `FACT_DEFAULT_SORT.overview`. *Fails if a pill's default names a
  column it does not have (an instant stale-sort loop) or the other views' defaults drift.*
- New: `advancedCaption` — the seven rows of the §4 table. *Fails if the caption names a column as covered on a
  window that shows "—", or omits the live-window note.*

**`marketFilters.test.js`:**
- Changed: the DEFAULT keys test → eighteen keys, with `minGames: 0, minSnapPct: 0`.
- New: both at 0 filter nothing, with and without `windowStats` (incl. a row absent from windowStats).
  *Fails if the new filters are not sentinel-gated.*
- New: `minGames: 10` with windowStats keeps gp ≥ 10, drops gp 9 and a row with no ws. *Fails if gp is not read.*
- New: `minSnapPct: 29` keeps snapPct `0.29`, drops `0.28` and a null snapPct. *Fails on the float trap or if
  null passes once active.*
- New: `minGames: 10, minSnapPct: 50` with **no** `windowStats` returns every row. *Fails if they filter Value.*
- New: normalizeFilters on a payload without the keys → 0/0; with `minGames: 18`, `-1`, `2.5`, `'8'` → 0;
  `minSnapPct: 101` → 0. isRestorableFilters: a pre-slice preset (no keys) → true; `minGames: 'x'` → false.
  *Fails if a stored object or saved preset from before this slice is rejected or reads as active.*
- New: `activeFilterCount({ ...DEFAULT, minGames: 8, minSnapPct: 50 })` → 2; with `{ performanceApplies: false }` → 0.
- New: normalizeFilters keeps `minGames: 40` (a career-window value) and rejects `401`. *Fails if the storage bound
  is one season, silently dropping a career threshold on reload.*
- New: `minGamesSliderMax` — `season`/`live` 17, `last3` 51, `career` with pool max gp 40 → 40, career with pool max 10
  → 17, `null` window → 17. *Fails if multi-season windows keep a one-season bound.*

**`Market.factViews.test.jsx` (new `describe('Efficiency fact view')` and `describe('performance filters')`)** —
reuse the module fixture; overrides only as stated. `dataSeason` there is 2024.
1. *Follows the window.* careerStats override: 2023 `w1` = `row(14, 210, { rec_tgt: 100, rec: 85, rec_yd: 800, rec_td: 5, rush_att: 2, rush_yd: 10 })`,
   2024 `w1` = `row(12, 120, { rec_tgt: 100, rec: 60, rec_yd: 900, rec_td: 5, rush_att: 2, rush_yd: 10 })`.
   Efficiency, WR pill: window 2023 → w1 Catch% `85.0%` rank `#1`; window 2024 → `60.0%` rank `#3`.
   *Fails if Efficiency is still pinned to dataSeason or ignores the window.*
2. *ALL pill.* Efficiency, ALL pill, window 2024: q1 and r1 rows' FP/G, Opp/G and Scrim Yd/G cells are not "—".
   *Fails on the old one-position reuse.*
3. *Advanced coverage.* Props: `liveSeasonUsable: true` (so the `live` window exists), `gameLogsByYear: { 2024: { complete: true, players: { w1: { games: [
   { week: 1, seasonType: 'REG', team: 'DAL', targets: 15, receivingEpa: 3 },
   { week: 2, seasonType: 'REG', team: 'DAL', targets: 15, receivingEpa: 3 } ] } } } }`,
   `advStats: { complete: true, year: 2024, byId: { w1: { racr: 1.15, components: { targets: 30 } } } }`.
   WR pill: window 2024 → w1 EPA/tgt cell textContent `0.20#1`, RACR `1.15#1` (FactTable renders `value#rank`;
   w1 is the only WR with a value and clears the gp floor 9 and 3 tgt/G); windows `live`, `last3`, `career` → both "—"; caption on
   `career` contains `EPA/tgt: 2024 season only`. *Fails if EPA leaks into uncovered windows or vanishes from the
   covered one.*
4. *Live RACR.* Props: `liveSeason: 2025`, `liveSeasonUsable: true`, `advStatsLive: { complete: true, year: 2025,
   byId: { w1: { racr: 2.45, components: { targets: 30, weeks: 5 } }, w2: { racr: 3.0, components: { targets: 24, weeks: 5 } } } }`,
   plus test 3's `advStats`. WR pill: window `live` → w1 RACR cell textContent `2.45#1`, w2 "—"; window 2024 →
   w1 RACR `1.15#1` (never 2.45); window `last3` → "—". *Fails if live RACR shows outside the live window or ignores the 25-target floor.*
5. *Default sort per pill + stale fallback.* `market-column-set: 'efficiency'`, `market-sort: { column: 'aySh', direction: 'desc' }`
   in localStorage → mounts on Efficiency with the Window combobox, `market-sort.column === 'fpPerG'`; QB pill →
   header `Rating ↓`; RB → `Y/C ↓`; WR → `Y/Tgt ↓`. *Fails if a stored `'efficiency'` no longer opens Efficiency, a
   stale old key sticks, or the pill does not reset to its default.*
6. *minGames on fact views only.* `market-filters` stored as `{ minGames: 17 }`: Overview, window 2024 → w1 (12 gp)
   and w4 (5 gp) absent, w2/w3 present; switch to Value → w1 and w4 present. *Fails if the filter does not apply on
   fact views, or filters Value.*
7. *minSnapPct.* careerStats override: 2024 `w3` gets `off_snp: 400` (40%). `market-filters` `{ minSnapPct: 50 }`:
   Usage, window 2024 → w3 absent, w2 present. *Fails if snap share is not read from the window.*
8. *Inert at default + Model-view state.* No stored filters → Overview row count equals the unfiltered count.
   With `{ minGames: 8 }` stored, on Value: the header subtitle does not say `filter active`; opening the panel
   shows both Performance sliders disabled and the text `Applies to Overview, Stats, Usage and Efficiency only.`
   *Fails if a stored performance filter counts or looks live where it does nothing.*
9. *Backward compatibility.* `market-filters` stored without the two keys (the Slice-vii shape) and
   `market-filter-presets` holding one preset whose `state` lacks them (and the env keys) → table renders all rows,
   the preset is listed and applying it renders all rows. *Fails if pre-slice stored objects or presets are dropped
   or empty the table.* Add `'market-filter-presets'` to this file's `afterEach` key list (Market.factViews.test.jsx
   lines 8–13) so the preset cannot leak into later tests.
10. *Panel groups.* Open the panel →
    `screen.getAllByTestId('filter-group-label').map(el => el.childNodes[0].textContent)` equals exactly
    `['Player', 'Availability', 'Team', 'Performance', 'Model', 'Environment']` (the first child text node excludes
    the `New` badge span). *Fails if Model filters stay split under Dynasty/Projection or Performance is missing.*
11. *Min-games slider follows the window.* Open the panel on Overview: window 2024 → the `Min games played`
    slider's `max` attribute is `17`; window `last3` → `51`; window `career` → `40` (fixture's pool max; the
    precondition test pins it). *Fails if the bound stays one season on multi-season windows.*

**`src/__tests__/marketWindowStatsViewOnly.test.js`:** extend the PIPELINE loop's regex to
`/marketWindowStats|marketMetrics|marketAdvanced/`; new cases: `marketAdvanced.js imports exactly ./liveAdvStats`;
add it to the "never imports the in-season modules or the api layer" loop. *Fails if a pipeline file imports the
new module or the module grows an api/in-season import.*

`currentSeasonTotalsIsolation.test.js` and `inSeasonEvidenceViewOnly.test.js` are not edited and stay green.
Value/Outlook/In-season `Market.test.jsx` cases unmodified (beyond the two-line deletion above).

## 11. Docs

- `docs/ui.md` → *Market*: the column-set paragraph (Efficiency is a fact view with the Window select); the TREND
  gutter line ("Value/Outlook/In-season", no longer Efficiency); replace the **Efficiency** bullet and its
  sub-bullets (≈ lines 211–218) with one bullet: per-pill columns, ALL's cross-position set, advanced columns'
  coverage rule and caption, default sort per pill; delete numbered note 5 (per-position lead sort) and drop
  "/Efficiency" from note 4; *Filter bar + panel*: the six groups, the two Performance filters, fact-view-only rule,
  disabled state, pills.
- `docs/nav/components.md`: rows for `market/Market.jsx`, `market/factViews.js`, `market/FilterBar.jsx`,
  `market/FilterPanel.jsx` (and `market/columnDescriptors.js` if it has a row).
- `docs/nav/utils.md`: rows for `marketFilters.js` (eighteen keys, `windowStats` ctx), `marketMetrics.js` (adv
  metrics), `seasonEfficiency.js` and `liveAdvStats.js` (consumer is now `marketAdvanced.js` / the Efficiency fact
  view); new row for `marketAdvanced.js` beside `marketMetrics.js`.
- `docs/navigation.md` :24 (route row) and :36 (drop `EFFICIENCY_COLUMNS` from the descriptor-map sentence).
- `docs/integrations.md` :335 and `docs/signal-registry.md` rows at :56, :59, :63: name the Efficiency **fact view**
  and its new path (`marketWindowStats.js` rates for the five counting keys; `marketAdvanced.js` for RACR/EPA).
  Row :56's consumer list loses `SACK%`/`AY/ATT`/`YAC`/`BTKL`/`DROPS` and gains the window rates that read those keys
  (`Sack%`, `aDOT` (QB), `YACo/Att`, `Brk Tkl%`, `Drop%`).
- `docs/cross-repo-registry.md` CR-19: App site becomes `src/utils/marketWindowStats.js` (`WINDOW_TOTAL_KEYS`) —
  the five keys' live reader (METRIC_META's entries lose their Market consumer). Invariant and Data side unchanged;
  the data repo's `data-catalog.md` ("Market Efficiency-set keys") stays accurate, so no backlog line is needed.
  `crossRepoIndex.test.js` must stay green (symbol resolves whole-word in that file).
- Further stale text to fix in the same change:
  - `docs/signal-registry.md:64` (teamcontext row): drop Market Efficiency's `CARRY SH` as an `off.rushPlays`
    consumer (Market now passes no teamcontext to `computeSeasonEfficiency`); Portfolio (`Portfolio.jsx`) remains.
  - `docs/navigation.md:84` (`advStats.js` row): the separate "`RACR <liveSeason>`" column is gone — RACR is one
    Efficiency column that reads the live load on the live window.
  - `docs/ui.md:225` note 4: delete the "`Efficiency` resolves `a._eff?.[key]`" clause outright, as well as "/Efficiency".
  - `Market.jsx` comments at ≈:524 and ≈:770 (TREND gutter sets): drop Efficiency.
  - `factViews.js:1-2` and `FactTable.jsx:1-2` header comments: "(Overview / Stats / Usage / Efficiency)". This is
    FactTable's only edit (comment only).
  - `seasonEfficiency.js:1` and `:12-19` header comments: Market's Efficiency fact view reads it via
    `marketAdvanced.js` for the dataSeason window only; CARRY SH is no longer a Market column (Portfolio still reads
    `carrySh`). Comment-only — no code change in that file.
- `CLAUDE.md` *Advstats are display-only*: unchanged — "Efficiency column set reads RACR for the completed and the
  live season (WR/TE only, gated on `advStats.complete`)" remains true.
- `docsAvailabilityClaims.test.js` scope applies: state mechanism ("on a window the source does not cover the
  column reads —"), never what is loaded today.

## 12. Done-definition

CLAUDE.md's list. `npm run build` clean except the pre-existing chunk-size warning. `grep -rn "PROVISIONAL(" src/`
output in the hand-back (this slice adds none). Smoke (`.claude/launch.json` preview): Efficiency on each pill and
on `live`/dataSeason/`last3`/`career` windows — no `NaN`, ranks present on rates, advanced columns "—" where §3 says;
the caption; the filter panel's six groups on a fact view and on Value (disabled Performance + note). Commit on
`main`; do not push. Hand back SHA, files, deviations, and per test: assertion, defect, seen-red confirmation.

---

## Verification record

Session 2 (sonnet) committed `1dba593` (`a2467c8..1dba593`, 25 files, all on the touch list). Implementation-reviewer
(full, opus/high) on that range: three non-blocking flags, no SCOPE block. Deviations 1–3 and 5 accepted as reported
(1: §10's `minGames: 18` contradicted §8 — `401` is the right rejected value; 2: Environment-test counts 2/6 are exact
consequences of §9; 3: Portfolio reads only `epaPerAtt`; 5: extra tests discriminate). Deviation 4 confirmed: the
`handleSelectPosFilter` efficiency branch is unobservable — `usePlayersTable` resets to `DEFAULT_SORT.efficiency`
(`fpPerG`) and the validity effect then moves single-position pills to `factDefaultSort`.

## Fix pass 1

**Review depth: light** — one dead branch removed (no behaviour change), tests added, comment/doc text only.

Touch only: `src/components/market/Market.jsx`, `src/components/market/Market.factViews.test.jsx`,
`docs/nav/utils.md`, `src/utils/usageEfficiency.js`, `src/utils/liveAdvStats.js`,
`src/__tests__/statKeysContract.test.js`, `src/App.jsx`. In the last four files **comments only** — no code, no
values, no test logic.

1. **Remove the redundant pill wrapper** (`Market.jsx` ≈:341–352). Delete the comment block and `handleSelectPosFilter`;
   pass `handlePosFilter` directly as `onPosFilter` to both `FactTable` (≈:1032) and `MarketTable` (≈:1043). In the
   validity-effect comment (≈:418) replace the reference to `handleSelectPosFilter` with: the effect is what moves a
   single-position Efficiency pill from the table's `fpPerG` reset to that pill's `factDefaultSort`, and also covers a
   `market-sort` value restored at mount. Leave `handleSelectColumnSet` as it is (its `factDefaultSort` call is kept:
   it lands the correct sort in one render). Drop `factDefaultSort` from the imports only if lint reports it unused (it
   is still used by `handleSelectColumnSet` and the effect).
2. **Delete test `5b`** (`Market.factViews.test.jsx` ≈:359–368) — it cannot fail. Test 5 is the behavioural guard for
   the pill defaults (it must stay green after item 1; that is the check that the branch was redundant).
3. **Pill test** — new case in `describe('performance filters')`: store `market-filters` as
   `{ minGames: 8, minSnapPct: 50 }`; on Overview (no column-set stored) the two pills read exactly `Min 8 G played`
   and `Snap ≥ 50%` and neither has a `title`; click `Value` → both pills still present, each has
   `title="Not applied on Value, Outlook or In-season"` and class `opacity-50`; click one pill's `×` → that key returns
   to 0 in `localStorage['market-filters']`. *Fails if the labels drift, the Model-view dimming is lost, or a dimmed pill
   cannot be cleared.* Show red by temporarily making the `title` unconditional, then restore.
4. **Efficiency snap-caption test** — extend test 14 at its end (append, do not rewrite its existing lines): after the
   `Stats` assertion, `pill('Efficiency')` (window still `career`) → `queryByText(/Snap % covers/)` is null; then
   `pill('Usage')` → the note is present again. *Fails if Efficiency shows the snap note it has no column for.* Show red
   by temporarily reverting the caption condition to `columnSet !== 'stats'`, then restore.
5. **Stale wording, comment/doc only:**
   - `docs/nav/utils.md:51` (`usageEfficiency.js` row): the 13 Efficiency entries are no longer read by Market (the
     Efficiency fact view takes labels/formats from `marketMetrics.js`); `racrLive` was the retired live-RACR column's
     metadata. Say the entries are retained, unconsumed by Market, and that CR-19's App site is
     `marketWindowStats.js` (`WINDOW_TOTAL_KEYS`). Nothing else in the row.
   - `src/utils/usageEfficiency.js` ≈:97–99 and ≈:174: the section comments say Market's Efficiency set reads these;
     reword to "written for the retired dp-v2 Slice 5b Efficiency set; no Market consumer since the Efficiency fact
     view (market-efficiency-fact-view.md); retained". Entries untouched.
   - `src/utils/liveAdvStats.js:1-4` header: governs RACR for Market's Efficiency fact view via `marketAdvanced.js` —
     the per-target floor and when the live advstats load is usable for the live window. Drop "columns"/"pinned".
   - `src/__tests__/statKeysContract.test.js:74` comment: `pass_air_yd` is read as the QB `aDOT` rate (`passAdot`)
     since the Efficiency fact view, not "AY/ATT since Slice 5b". Comment only.
   - `src/App.jsx` ≈:1228 comment: "consumed by Market's Efficiency fact view (RACR)". Comment only; nothing else in
     App.jsx.

Done-definition: `npm test` green, `npm run lint` 0, `npm run build` clean (chunk-size warning excepted). No smoke
(no visible change; item 1 is proven by test 5 staying green). Commit on `main`, do not push. Hand back the SHA, files
touched, and for items 3–4 the assertion, the defect, and the seen-red confirmation.

Fix pass 1 applied as `5c542d8` (fix-applier). Light re-review on `1dba593..5c542d8`: no flags — all seven paths on
the section's touch list, comment-only where required, new assertions discriminate. Session 1 re-ran `npm test`
(168 files / 3354 green) and `npm run lint` (0) on `5c542d8`. Anton signed off visually 2026-11-01; pushed.
