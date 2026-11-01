# Market window stats · Slice B — Overview / Stats / Usage fact views, window selector, Volume retired

**Review depth: full** — Market state/module change (new views, persisted keys, a migration), a new prop
from App.jsx's live-season gate onto `<Market>` (the isolation seam `currentSeasonTotalsIsolation.test.js`
and `inSeasonEvidenceViewOnly.test.js` guard), and a change to Slice A's ranking API.

Session 1: opus, high. Session 2: **sonnet**, medium.

**Status: plan approved by Anton 2026-11-01 — ready for Session 2.**

Builds on Slice A (`market-window-stats-a-data.md`, commits `4d2dde2`, `42d1e71`). Read §1 of that file only
if a WindowStats field is unclear; live source wins.

---

## 0. What this is, for Anton

Market opens on a new **Overview**: games, fantasy points, points per game, last season's positional rank and
snap share for any time window you pick (this season so far, any past season, last 3, career), with KTC and
dynasty score shown greyed for reference. **Stats** shows the box-score totals (or per-game, one toggle) and
**Usage** shows shares and opportunity. Every number carries its position rank where a rank is meaningful.
Volume goes away; Value, Outlook, In-season and Efficiency are untouched until Slice C.

## 1. Scope

In: career rank floor, per-game twin metrics, a pure view-descriptor module, one new table component,
Market wiring (view control, window selector, stats-mode toggle, caption, persistence, migration, sort
validation), Volume removal, one App.jsx prop, tests, docs.

Out: Efficiency changes (one copy fix, §6.9), the Model view, filter changes, removing
`market-production-season`, pop-up changes, EPA/CPOE, TREND on the new views.

## 2. Touch list

| File | Change |
|---|---|
| `src/utils/marketMetrics.js` | `rankWindow` 3rd arg; 7 new per-game metrics; `rushYdPerG` positions; `PER_GAME_TWIN`; `METRIC_BY_ID` (§4) |
| `src/utils/marketMetrics.test.js` | extend (§9.1) |
| `src/components/market/factViews.js` | **new** — pure descriptors + helpers (§5) |
| `src/components/market/factViews.test.js` | **new** (§9.2) |
| `src/components/market/FactTable.jsx` | **new** (§7) |
| `src/components/market/Market.jsx` | wiring + Volume removal (§6) |
| `src/components/market/columnDescriptors.js` | delete the `COLUMNS` export and its comment (Volume's only consumer); update header comment |
| `src/components/market/Market.test.jsx` | one file-level `beforeEach`; remove Volume cases; the group-label case (§9.3) |
| `src/components/market/Market.factViews.test.jsx` | **new** — integration tests (§9.4) |
| `src/__tests__/marketWindowStatsViewOnly.test.js` | extend to the two new files (§8) |
| `src/App.jsx` | one prop on the `<Market` element (§6.1) |
| `docs/ui.md`, `docs/navigation.md`, `docs/nav/components.md`, `docs/nav/utils.md`, `CLAUDE.md` | §10 |

Nothing else. `marketWindowStats.js`, `usePlayersTable.js`, `dp/MarketTable.jsx`, `dp/cells.jsx`,
`currentSeasonTotalsIsolation.test.js`, `inSeasonEvidenceViewOnly.test.js` are **not** touched. If
implementation seems to need another file, stop and report.

## 3. Planner checks (2026-11-01, against live source)

1. `App.jsx:240` — `liveSeasonUsable` memo exists. Seam tests: `inSeasonEvidenceViewOnly.test.js:126`
   slices the `<Market` element up to its first `/>` and restricts only the identifier `scoringPosteriors`.
   `currentSeasonTotalsIsolation.test.js:107`'s `LIVE` regex (which includes `liveSeasonUsable`) is applied
   via `liveIds` only to the argument lists of `buildProspectLevel`, `buildRookieDynastyPriors`,
   `computeNextSeasonProjection`, `buildInSeasonLevel`, `buildScoringPosteriors`, `buildQbLiveStates` and
   `applyInSeasonProjection`; the `computeDynastyScore(` and `inSeasonSettled` checks use their own literal
   patterns. None reads the `<Market` element, so a `liveSeasonUsable={liveSeasonUsable}` prop there keeps
   both suites green. No test enumerates `<Market`'s props.
2. `usePlayersTable(...)` is called every render with `defaultSort: DEFAULT_SORT[columnSet]`; its
   `handlePosFilter` resets to that, so per-view default sorts need only `DEFAULT_SORT` entries. Its
   `handleSort` hard-codes the asc-first columns, so per-column `defaultSortDir` is applied by FactTable
   through `setSortState` (§7.4), not by editing the hook.
3. `compareNullsLast` (`utils/sortUtils.js`) sinks null/NaN in both directions and localeCompares strings.
4. Snap coverage: `docs/signal-registry.md:13` — `off_snp` is 2020+. `buildWindowStats` already counts a
   season toward `snapPct` only when it tracks both snap keys, exposing the count as `usage.snapSeasons`.
5. `rankWindow` floors every non-`total` metric (rates and `perGame`) at `ceil(0.5 × maxGp)` on
   `basisGp[basis]` (rates) or `gp` (per-game); totals are never floored.
6. `marketMetrics.test.js` asserts unique ids, shape, basis pairs — no metric count, no positions list for
   `rushYdPerG`. `Market.test.jsx` uses `localStorage` keys `market-sort`, `market-column-set`,
   `market-production-season`, `market-filters`, `market-filter-presets` (cleared in its `afterEach`).
7. Volume-dependent test cases in `Market.test.jsx`: lines ~136–153 (four-sets header test, Volume lines),
   ~337 (Volume pill reset), ~598–610 (migration describe), ~640–656 (TREND under every set, Volume lines),
   ~687 (TREND sort in Volume). Lines ~1028 and ~1610 only assert that Volume headers are *absent* under
   Efficiency/In-season — they stay green unmodified. The Efficiency caption test (~1068) matches
   `/Fixed to the 2025 season/`. One case depends on the group **label**, not on Volume:
   `'the In-season chip renders in MODEL & MARKET, after Outlook'` (~1380) reads
   `screen.getByText('MODEL & MARKET')` — it changes with the §6.3 rename (§9.3).
9. Lint: `eslint.config.js:17` enables `react-hooks/exhaustive-deps`; `vitest.config.js` has
   `globals: false`, so RTL does not auto-clean — test files call `cleanup()` themselves (`Market.test.jsx:8–10`).
8. `computeSeasonAverages` and `fmtCell` are used in Market.jsx only by Volume (`:636`, `:1108`).
   `COLUMNS` in `columnDescriptors.js` is imported only by Market.jsx (as `VOLUME_COLUMNS`).

## 4. `marketMetrics.js`

### 4.1 Career floor
```js
export function rankWindow(statsById, metrics = MARKET_METRICS, { minGames } = {}) {
  …
  const gpFloor = Number.isFinite(minGames) ? minGames : Math.ceil(0.5 * maxGp)
```
Everything else unchanged: the floor still applies only to `kind !== 'total'`, against
`basisGp[m.basis] ?? 0` or `ws.gp` exactly as today.

### 4.2 Per-game twins
Add, each placed directly after its total in `MARKET_METRICS` (ids are new; no existing id changes):

| id | label | positions | value | format |
|---|---|---|---|---|
| `passTdPerG` | `Pass TD/G` | `['QB']` | `perG(tot('pass_td'))` | `dec2` |
| `rushAttPerG` | `Car/G` | `['QB','RB']` | `perG(tot('rush_att'))` | `dec1` |
| `rushTdPerG` | `Rush TD/G` | `['QB','RB']` | `perG(tot('rush_td'))` | `dec2` |
| `recPerG` | `Rec/G` | `['RB','WR','TE']` | `perG(tot('rec'))` | `dec1` |
| `recTdPerG` | `Rec TD/G` | `['RB','WR','TE']` | `perG(tot('rec_td'))` | `dec2` |
| `totalTdPerG` | `TD/G` | `ALL` | `perG(sumTot('pass_td','rush_td','rec_td'))` | `dec2` |
| `firstDownsPerG` | `1st Dn/G` | `['RB','WR','TE']` | `perG(sumTot('rush_fd','rec_fd'))` | `dec1` |

All via the existing `perGame(...)` constructor. Change `rushYdPerG`'s positions from `['QB','RB']` to
`['QB','RB','WR']` so it matches its total `rushYd` (a twin must rank exactly where its total ranks).

### 4.3 Pairing and lookup (data, exported)
```js
export const PER_GAME_TWIN = {
  fp: 'fpPerG', passYd: 'passYdPerG', passTd: 'passTdPerG', rushAtt: 'rushAttPerG', rushYd: 'rushYdPerG',
  rushTd: 'rushTdPerG', tgt: 'tgtPerG', rec: 'recPerG', recYd: 'recYdPerG', recTd: 'recTdPerG',
  scrimYd: 'scrimYdPerG', totalTd: 'totalTdPerG', firstDowns: 'firstDownsPerG',
}
export const METRIC_BY_ID = Object.fromEntries(MARKET_METRICS.map(m => [m.id, m]))
```
Every `kind: 'total'` metric has a twin. `marketMetrics.js` still imports nothing.

## 5. `src/components/market/factViews.js` (new, pure, no React)

Header comment: view-only; descriptors for Market's fact views; imports only `marketMetrics`; never feeds
projection/scoring. Imports exactly `{ METRIC_BY_ID, PER_GAME_TWIN }` from `'../../utils/marketMetrics'`.

### 5.1 Constants
```js
export const FACT_VIEWS = ['overview', 'stats', 'usage']
export const FACT_DEFAULT_SORT = {
  overview: { column: 'fp', direction: 'desc' },
  stats:    { column: 'fp', direction: 'desc' },
  usage:    { column: 'oppPerG', direction: 'desc' },
}
export const STATS_MODES = ['totals', 'perGame']
export const CAREER_MIN_GAMES = 32
```

### 5.2 Raw descriptors — `FACT_VIEW_COLUMNS[view][pos]`, pos ∈ `QB|RB|WR|TE|ALL`
A column is either a **metric column** `{ id, metricId, defaultSortDir: 'desc' }` (label and format come from
the metric) or a **value column** `{ id, label, value(row, ws, ext), format(v), defaultSortDir, align?,
muted?, cell?, hideForWindowKinds? }`. Column `id` is the sort key and is stable across the stats-mode toggle
(for a metric column it is the *total* metric id).

Shared value columns (define once, reuse):
```js
const G  = { id: 'gp', label: 'G',  value: (row, ws) => ws?.gp ?? null, format: v => String(v), defaultSortDir: 'desc' }
const GS = { id: 'gs', label: 'GS', value: (row, ws) => ws?.gs ?? null, format: v => String(v), defaultSortDir: 'desc' }
const PREV_RANK = { id: 'prevFpPerGRank', label: 'Prev rk', value: (row, ws, ext) => ext?.prevRank?.rank ?? null,
  format: v => `#${v}`, defaultSortDir: 'asc', hideForWindowKinds: ['last3', 'career'] }
const OWNER = { id: 'ownerTeamName', label: 'Owner', value: row => row.ownerTeamName ?? null, format: v => v,
  defaultSortDir: 'asc', align: 'left', cell: 'owner' }
const KTC = { id: 'ktcValue', label: 'KTC', value: row => row.ktcValue ?? null, format: v => String(Math.round(v)),
  defaultSortDir: 'desc', muted: true }
const DYN = { id: 'dynastyScore', label: 'Dynasty', value: row => row.dynastyScore?.score ?? null,
  format: v => String(Math.round(v)), defaultSortDir: 'desc', muted: true }
const m = id => ({ id, metricId: id, defaultSortDir: 'desc' })
```
`G`, `GS`, `PREV_RANK` read the window (`ws`/`ext`); `OWNER`, `KTC`, `DYN` read the row and render for every
row regardless of window stats.

**Prev rk vs Value's Ceiling/Floor — deliberate divergence.** Prev rk is `rankWindow`'s FP/G rank for the
prior season, which drops players below half that season's max games (`marketMetrics.js:99–102`). Value's
Ceiling/Floor use `seasonRanks.js`'s `buildSeasonPositionRanks` (no games floor, every player who played).
The same player-season can therefore show different position ranks on the two views. Kept on purpose: a
per-game rank among players with a real sample is the honest "how good was he per game" number, and it
matches every other rank on the fact views. Value is replaced in Slice C; do not unify here. State this
in the docs/ui.md Fact views bullet (§10).

**overview** (no stats-mode toggle):
- QB: `G, m('fp'), m('fpPerG'), PREV_RANK, OWNER, KTC, DYN`
- RB / WR / TE / ALL: `G, m('fp'), m('fpPerG'), PREV_RANK, m('snapPct'), OWNER, KTC, DYN`

(QB drops Snap % — `snapPct` does not rank QBs, so a QB-pill column would be all "—". Under ALL the QB
rows show "—" there, per §7.3.)

**stats** (metric ids are the totals; the toggle swaps them, §5.3):
- QB: `passYd, passTd, rushAtt, rushYd, rushTd, fp`
- RB: `rushAtt, rushYd, rushTd, tgt, rec, recYd, recTd, scrimYd, firstDowns, fp`
- WR: `tgt, rec, recYd, recTd, rushYd, firstDowns, fp`
- TE: `tgt, rec, recYd, recTd, firstDowns, fp` (no `rushYd` — it does not rank TEs; a TE-pill column of all
  "—" is noise. Deviation from the brief's shared WR/TE list.)
- ALL: `fp, passYd, rushYd, recYd, totalTd`

**usage**:
- QB: `G, GS, carryShare, rzRushShare, oppPerG`
- RB: `G, GS, snapPct, carryShare, tgtShare, rzRushShare, rzTgtShare, oppPerG`
- WR / TE: `G, GS, snapPct, tgtShare, aySh, rzTgtShare, tgtPerG, oppPerG`
- ALL: `G, GS, snapPct, oppPerG`

Stats/usage carry no OWNER/KTC/DYN. KTC and DYN appear on overview only.

### 5.3 Resolution
```js
export function factColumns(view, pos, { windowKind = null, statsMode = 'totals' } = {})
```
Returns `FACT_VIEW_COLUMNS[view][pos] ?? FACT_VIEW_COLUMNS[view].ALL`, minus any column whose
`hideForWindowKinds` includes `windowKind`, each mapped to a resolved column:
- metric column → `{ ...col, metric }` where `metric = METRIC_BY_ID[view === 'stats' && statsMode === 'perGame'
  ? (PER_GAME_TWIN[col.metricId] ?? col.metricId) : col.metricId]`, `label: metric.label`,
  `align: 'right'`.
- value column → `{ align: 'right', ...col }`.
An unknown `view` returns `[]`.

```js
export function factSortableKeys(view, pos, opts) // new Set(['full_name', ...factColumns(view, pos, opts).map(c => c.id)])
```

```js
export function factCellValue(col, row, ws, ext)
```
The single value used for both display and sort:
- metric column: `ws && col.metric.positions.includes(ws.position) ? col.metric.value(ws) : null`, then
  non-finite → `null`.
- value column: `col.value(row, ws, ext)`, `undefined` → `null`.

```js
export function factCellRank(col, ws, ranks)
```
Metric column with a non-null `factCellValue` → `ranks?.[ws.pid]?.[col.metric.id] ?? null`; otherwise `null`.

### 5.4 Window helpers
```js
export function prevWindowFor(window, windows)
```
- `kind === 'live'` → `windows.find(w => w.kind === 'season') ?? null` (the latest completed season;
  `availableWindows` lists seasons descending).
- `kind === 'season'` → `windows.find(w => w.kind === 'season' && w.id === String(window.seasons[0] - 1)) ?? null`.
- anything else / null → `null`.

```js
export function rankOptionsFor(window) // window?.kind === 'career' ? { minGames: CAREER_MIN_GAMES } : undefined
export function snapCoverageIncomplete(windowStats)
// true iff some ws in the Map has ws.usage.snapSeasons < ws.seasons.length
```

## 6. `Market.jsx`

### 6.1 Prop
Add `liveSeasonUsable = false` to the `Market({...})` destructure. In `App.jsx`, inside the `<Market` element,
add `liveSeasonUsable={liveSeasonUsable}` (one line, after `currentSeasonTotals={currentSeasonTotals}`).
Market never re-derives it and imports nothing new from the in-season modules.

### 6.2 Imports
Add: `availableWindows, defaultWindow, buildWindowStats` from `'../../utils/marketWindowStats'`;
`MARKET_METRICS, METRIC_BY_ID, rankWindow` from `'../../utils/marketMetrics'`;
`FACT_VIEWS, FACT_DEFAULT_SORT, STATS_MODES, factSortableKeys, prevWindowFor, rankOptionsFor,
snapCoverageIncomplete` from `'./factViews'`; `FactTable` from `'./FactTable'`.
Remove: `computeSeasonAverages` import, `COLUMNS as VOLUME_COLUMNS` from the columnDescriptors import.

### 6.3 View control and persistence
```js
const COLUMN_SETS = ['overview', 'stats', 'usage', 'efficiency', 'value', 'outlook', 'inseason']
const COLUMN_SET_LABELS = { overview: 'Overview', stats: 'Stats', usage: 'Usage', efficiency: 'Efficiency',
  value: 'Value', outlook: 'Outlook', inseason: 'In-season' }
const COLUMN_SET_GROUPS = [
  { label: 'FACTS', sets: ['overview', 'stats', 'usage', 'efficiency'] },
  { label: 'MODEL', sets: ['value', 'outlook', 'inseason'] },
]
```
Update the comment above the groups (left group = what happened on the field, right = what the model and
market think).

`loadColumnSet()`: `volume` and `production` both migrate to `stats` and are written back once (same
try/catch shape as today); anything else not in `COLUMN_SETS` → `'overview'`; a throw → `'overview'`.
Update its comment.

New loaders beside it, same try/catch style, **no write-back**:
```js
function loadWindowId()  { /* localStorage 'market-window' raw string, or null */ }
function loadStatsMode() { /* 'market-stats-mode' if in STATS_MODES, else 'totals' */ }
```

### 6.4 Sorting tables
- `DEFAULT_SORT`: delete `volume`; add `...FACT_DEFAULT_SORT` (so `overview`/`stats`/`usage` entries exist —
  `usePlayersTable`'s pill reset and `handleSelectColumnSet` read them unchanged).
- Delete `VOLUME_SORTABLE_KEYS`, `volume` in `SORTABLE_KEYS`, `volume` in `SORT_LABELS`, and `fmtCell` (and
  its comment).

### 6.5 Volume removal
Delete `loadVolumeSeason`, the `volumeSeason` state + `setVolumeSeason`, `activeVolumeSeason`, the
`volumeRows` memo, the Volume season `<select>`, and the final `else` (volume) branch of the header/row chain
(make the in-season branch `else if (columnSet === 'inseason')` with no trailing `else`). Rename the
`volumeSeasons` memo to `completedSeasons` (same body); after the deletions its only reader is `dataSeason`
(`:415`); update that reader and the `dataSeason` comment (`:411–415`) to stop referring to Volume.

Comments made false by this slice — reword each (comment-only, no behaviour):
- `:33–35` and `:491`: TREND gutter "under every set" → under Value/Outlook/In-season/Efficiency, not the fact views.
- `:471`: drop "the volume season selector" (now "the column-set switch and the window selector").
- `:728–730`, `:768–770`, `:778`, `:959–960`, `:994–995`: "before the volume fall-through" → the
  explicit-branch rationale without naming Volume (e.g. "its own explicit branch — no set falls through
  to another's rows or comparator"). Do **not** touch the `market-production-season` key
elsewhere (the test file's `afterEach` keeps clearing it).

### 6.6 Window, stats-mode, fact state (place after `dataSeason`/`liveById`, before the sort-validity effect)
```js
const isFactView = FACT_VIEWS.includes(columnSet)
const [windowId, setWindowIdRaw] = useState(loadWindowId)
const setWindowId = useCallback(id => {
  setWindowIdRaw(id)
  try { localStorage.setItem('market-window', id) } catch { /* ignore */ }
  setPage(1)
}, [setPage])
const [statsMode, setStatsModeRaw] = useState(loadStatsMode)
const setStatsMode = useCallback(mode => {
  setStatsModeRaw(mode)
  try { localStorage.setItem('market-stats-mode', mode) } catch { /* ignore */ }
}, [])

const windows = useMemo(
  () => (isFactView ? availableWindows({ careerStats, currentSeasonTotals, liveUsable: liveSeasonUsable }) : []),
  [isFactView, careerStats, currentSeasonTotals, liveSeasonUsable])
const activeWindow = useMemo(
  () => windows.find(w => w.id === windowId) ?? defaultWindow(windows),
  [windows, windowId])
const windowStats = useMemo(
  () => (activeWindow ? buildWindowStats({ window: activeWindow, careerStats, currentSeasonTotals, playerMap }) : null),
  [activeWindow, careerStats, currentSeasonTotals, playerMap])
const windowRanks = useMemo(
  () => (windowStats ? rankWindow(windowStats, MARKET_METRICS, rankOptionsFor(activeWindow)) : null),
  [windowStats, activeWindow])
const prevWindow = columnSet === 'overview' ? prevWindowFor(activeWindow, windows) : null
const prevRanks = useMemo(() => {
  if (!prevWindow) return null
  const ws = buildWindowStats({ window: prevWindow, careerStats, currentSeasonTotals, playerMap })
  return rankWindow(ws, [METRIC_BY_ID.fpPerG])
}, [prevWindow, careerStats, currentSeasonTotals, playerMap])
```
`activeWindow` is null whenever `isFactView` is false (empty `windows`), so `windowStats`/`windowRanks` cost
nothing on the old views. A stored `market-window` id not in `windows` (a stale `live` in the offseason, a
season no longer loaded, garbage) silently resolves to `defaultWindow(windows)`; it is not written back.
`prevWindow` is a stable object from the `windows` memo, so `prevRanks` re-runs only on real changes.

### 6.7 Sort-validity effect
Add a branch at the top of the existing effect (`:434`), before the efficiency branch:
```js
if (isFactView) {
  const valid = factSortableKeys(columnSet, posFilter, { windowKind: activeWindow?.kind ?? null, statsMode })
  if (!valid.has(sortState.column)) setSortState(FACT_DEFAULT_SORT[columnSet])
  return
}
```
Add `isFactView`, `activeWindow`, `statsMode` to its deps. This covers a restored `market-sort` at mount, a
switch to last3/career while sorted by `prevFpPerGRank`, and a pill change. Position-pill changes already
reset to `DEFAULT_SORT[columnSet]` via the hook.

### 6.8 Rows, sort memo, render
- `enrichedRows`: replace the trailing `: volumeRows` with `: columnSet === 'inseason' ? inSeasonRows : (playerRows ?? [])`
  — the last arm is the fact views (unenriched rows; FactTable reads window stats by `player_id`). Update
  the comment above it.
- `displayRows`: delete the volume sort branch; after the in-season branch, `return rows` with a one-line
  comment that the fact views are sorted by FactTable. Filters/pill apply as today, before this point.
- `activeColumnLabel`: delete the volume branch. (FactTable computes its own label.)
- Render: the old views keep `<MarketTable …/>` exactly as now. For `isFactView`, render instead:
```jsx
<FactTable
  view={columnSet} posFilter={posFilter} onPosFilter={handleSelectPosFilter} loaded={loaded}
  rows={displayRows} page={page} onPageChange={setPage}
  sortState={sortState} onSortChange={setSortState}
  windowKind={activeWindow?.kind ?? null} statsMode={statsMode}
  windowStats={windowStats} ranks={windowRanks} prevRanks={prevRanks} prevSeason={prevWindow?.seasons[0] ?? null}
  myTeamName={myTeamName} onOpenPlayerDetail={onOpenPlayerDetail}
  filterBar={/* the same <FilterBar …/> element as today — hoist it into a const and pass to both */}
/>
```

### 6.9 Header controls and caption
In the right-hand controls `div`, before the groups, for `isFactView && windows.length > 0`:
```jsx
<label className="flex items-center gap-1.5 text-xs text-dp-muted">
  Window
  <select aria-label="Window" value={activeWindow.id} onChange={e => setWindowId(e.target.value)}
    className="bg-dp-card border border-dp-border rounded-md px-2 py-1 text-xs text-dp-text-2">
    {windows.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
  </select>
</label>
```
(same classes as the deleted Volume select). For `columnSet === 'stats'`, a two-button segmented control
(same container/button classes as the view groups) labelled `Totals` / `Per game`, `aria-pressed` on the
active one, calling `setStatsMode('totals' | 'perGame')`.

Caption under the subtitle, for `isFactView && activeWindow`, in the same `<p className="text-[11px]
text-dp-muted mt-0.5">` style as the other captions:
`{activeWindow.label} · {scoring}{snap}` where
- `scoring` = `'League scoring'` when `windowStats` is non-empty and every `ws.leagueScored` is true;
  `"Half-PPR basis (Sleeper's own scoring, not necessarily this league's)"` (In-season's wording) when it is
  non-empty and some `ws.leagueScored` is false; an empty or null pool → no scoring clause and no ` · `
  (render the label alone). Deviation from the brief's fixed "League scoring": the live season's rows may not
  be league-scored, and the caption must not claim it.
- `snap` = `' · Snap % covers 2020 onward'` when `columnSet !== 'stats'` and `snapCoverageIncomplete(windowStats)`.

**Efficiency caption copy fix** (the only Efficiency edit): `(not user-selectable, unlike Volume)` →
`(not user-selectable)`. Volume no longer exists; the caption test's `/Fixed to the 2025 season/` still matches.

### 6.10 Header comment
Append one sentence to the top-of-component comment (`:26–36`): Slice B of market-window-stats added the
Overview/Stats/Usage fact views on a descriptor-driven `FactTable` path, retired Volume, and regrouped the
control into FACTS / MODEL.

## 7. `src/components/market/FactTable.jsx` (new)

Header comment: view-only; the descriptor-driven table for Market's fact views; no TREND gutter; no
per-view branches — everything comes from `factViews.js`.

Imports exactly: `useCallback, useMemo` from `'react'`; `MarketTable` from `'../dp/MarketTable'`;
`SortTh, PlayerCell, ClickableRow` from `'../dp/cells'`; `compareNullsLast` from `'../../utils/sortUtils'`;
`factColumns, factCellValue, factCellRank` from `'./factViews'`.

### 7.1 Props
`{ view, posFilter, onPosFilter, loaded, rows, page, onPageChange, sortState, onSortChange, windowKind,
statsMode, windowStats, ranks, prevRanks, prevSeason, myTeamName, onOpenPlayerDetail, filterBar }`

### 7.2 Derivations
```js
const columns = useMemo(() => factColumns(view, posFilter, { windowKind, statsMode }), [view, posFilter, windowKind, statsMode])
const ctx = useCallback(row => ({
  ws: windowStats?.get(row.player_id) ?? null,
  ext: { prevRank: prevRanks?.[row.player_id]?.fpPerG ?? null },
}), [windowStats, prevRanks])
```
(`useCallback` so the sort memo can list `ctx` as a dep — `react-hooks/exhaustive-deps` is on; a plain
render-body function fails lint either way.) Add `useCallback` to the `react` import.
Sorted rows (`useMemo` on `rows, columns, sortState, ctx`): `dir = asc ? 1 : -1`;
`full_name` → `compareNullsLast(a.full_name, b.full_name, dir)`; a column id → compare
`factCellValue(col, row, ws, ext)` for both rows with `compareNullsLast`; an id matching no column → rows
unchanged (the Market effect corrects it on the next render). A row with no window stats has null in every
window-backed column and sinks.

### 7.3 Cells
- Player: `<td className="px-[18px] py-3"><PlayerCell row={row} /></td>`.
- `col.cell === 'owner'`: render exactly like the Value set's Owner cell (Market.jsx `:885–889`:
  `text-dp-up-text` when `=== myTeamName`, else `text-dp-text-2`; `'Unowned'` when null).
- Every other column: `v = factCellValue(...)`. `v == null` → muted `—` (`<span className="text-dp-muted
  text-xs">—</span>`, as the deleted Volume G cell did). Else text = `col.metric ? col.metric.format(v) :
  col.format(v)`, then if `factCellRank(col, ws, ranks)` is non-null append
  `<span className="ml-1 text-[11px] text-dp-muted">#{rank.rank}</span>` with
  `title={`#${rank.rank} of ${rank.of} ${ws.position}s`}`.
  A metric shown for a position it does not rank (Pass Yd on a WR under ALL) is null by §5.3 → `—`.
- Cell classes: `px-3 py-3 whitespace-nowrap font-dp-mono text-[13px]` + `text-right` unless
  `align === 'left'` + `text-dp-muted` if `col.muted` else `text-dp-text`.

### 7.4 Header and sort
`<SortTh label="Player" col="full_name" … />` then one `SortTh` per column (`label`, `col={c.id}`,
`align`, `tooltip`). Tooltips: `prevFpPerGRank` → `` `FP/G position rank in ${prevSeason}` `` (or
`'FP/G position rank in the prior season'` when `prevSeason` is null); muted KTC/Dynasty →
`'Market and model reference — not a window stat'`; otherwise none.
`SortTh` gets `sortKey={sortState.column}`, `sortAsc={sortState.direction === 'asc'}`, and
`onSort={handleSort}` where:
```js
const handleSort = id => {
  const def = id === 'full_name' ? 'asc' : (columns.find(c => c.id === id)?.defaultSortDir ?? 'desc')
  onSortChange(prev => prev.column === id
    ? { column: id, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
    : { column: id, direction: def })
  onPageChange(1)
}
```
(`setSortState` accepts an updater — `usePlayersTable.js:23`.)

### 7.5 Shell
```jsx
<MarketTable posFilter={posFilter} onPosFilter={onPosFilter} loaded={loaded} header={header}
  colSpan={1 + columns.length} displayRows={sorted} page={page} onPageChange={onPageChange}
  renderRow={renderRow} activeColumnLabel={label} filterBar={filterBar} />
```
`label` = `'player'` for `full_name`, else the matching column's `label.toLowerCase()`, else the raw key.
Rows: `<ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>`.

## 8. View-only guard — `src/__tests__/marketWindowStatsViewOnly.test.js`

Extend in place (keep existing cases):
- the PIPELINE loop also asserts no specifier matches `/factViews|FactTable/`.
- `factViews.js` imports exactly `['../../utils/marketMetrics']`.
- `FactTable.jsx` imports exactly (sorted) `['../../utils/sortUtils', '../dp/MarketTable', '../dp/cells', './factViews', 'react']`.
- neither new file has a specifier matching `/inSeasonEvidence|inSeasonScoring|\/api\/|marketWindowStats/`
  (window stats arrive as props; only Market builds them).
- `marketMetrics.js` still imports nothing (existing case).

## 9. Tests

### 9.1 `marketMetrics.test.js` (extend)
- `minGames` replaces the half-max floor: pool gp `{a: 40, b: 20}` on a per-game metric — default ranks both
  (floor 20); `{ minGames: 32 }` ranks `a` only, `b` null; totals rank both either way.
- `minGames` on a rate uses `basisGp[basis]`, not `gp` (a ws with `gp 40`, `basisGp.snapPct 20` → null at 32).
- Twins: every `kind:'total'` id is a `PER_GAME_TWIN` key; every twin exists, is `kind:'perGame'`, and has the
  same `positions` as its total (sorted compare).
- `METRIC_BY_ID[id] === MARKET_METRICS.find(m => m.id === id)` for every id.
- Each new per-game metric: value = total / gp on a hand-built ws, and null when the total is null.

### 9.2 `factViews.test.js` (new)
- Every descriptor column for every view × pos is either a metric column whose `metricId` is in `METRIC_BY_ID`
  or a value column with `value`/`format` functions; every `defaultSortDir` is `asc|desc`; ids unique per list.
- Every metric column under a single-position pill ranks that position (`metric.positions.includes(pos)`) —
  in both stats modes. (This is what keeps "—"-only columns off single-position pills.)
- `factColumns('stats', 'WR', { statsMode: 'perGame' })` → ids unchanged, metrics/labels are the twins
  (`recYd` column → `recYdPerG`, label `Rec Yd/G`); `'totals'` → the totals.
- `factColumns('overview', pos, { windowKind: 'last3' | 'career' })` has no `prevFpPerGRank`; `'live'`/`'season'` has it.
- KTC/Dynasty (`ktcValue`, `dynastyScore`, both `muted`) appear in overview lists only.
- `factCellValue`: Pass Yd column + WR ws → null; + QB ws → the total; no ws → null for metric and G columns,
  row value for KTC.
- `factCellRank`: null when the value is null even if `ranks` has an entry.
- `prevWindowFor`: live → latest season window; season 2024 → 2023's; earliest season → null; last3/career/null → null.
- `rankOptionsFor`: career → `{ minGames: 32 }`; others → undefined.
- `snapCoverageIncomplete`: true with one ws `snapSeasons 1, seasons [2019, 2020]`; false when all equal.

### 9.3 `Market.test.jsx` (minimal edits)
- Add a file-level `beforeEach(() => localStorage.setItem('market-column-set', 'value'))`. The existing cases
  were written against Value as the clean-store default; this pins that precondition so their bodies stay
  unmodified. Tests that set the key in their own body still override it.
- Delete the Volume lines from the four-sets header test and from the TREND-under-every-set test (rename that
  test to name the remaining sets).
- Delete `'2. clicking a position pill while Volume is active…'` and `'TREND sorts within the Volume set too…'`.
- Delete the `column-set rename & migration (dp-v2 5a §2)` describe (replaced in §9.4).
- `'the In-season chip renders in MODEL & MARKET, after Outlook'` (~1380): changed behaviour (§6.3 rename) —
  retitle to `'… in MODEL, after Outlook'` and change `getByText('MODEL & MARKET')` to
  `getByText('MODEL', { exact: true })`; the asserted button order `['Value', 'Outlook', 'In-season']` stays.
- No other edits. In particular the Efficiency fall-through guard (~1028) and the In-season fall-through guard
  (~1610) stay as they are.

### 9.4 `Market.factViews.test.jsx` (new, jsdom)
Own fixtures. Header as `Market.test.jsx:1–10`: `// @vitest-environment jsdom`,
`expect.extend(jestDomMatchers)`, and an `afterEach` that calls `cleanup()` (RTL does not auto-clean —
`globals: false`) and clears `market-sort`, `market-column-set`, `market-window`, `market-stats-mode`,
`market-filters`. Fixture sketch (Session 2 may extend; keep values hand-checkable):
- `careerStats` 2022–2024 with QB `q1`, WRs `w1`, `w2`, `w3`, RB `r1`, carrying `gamesPlayed`,
  `gamesStarted`, `fantasyPoints`, `scoringBasis: 'league'`, `team`, and `stats` with `rec_tgt`, `rec`,
  `rec_yd`, `rec_td`, `rush_att`, `rush_yd`, `pass_yd`, `off_snp`, `tm_off_snp`.
  `w1`: 17 + 17 + 6 = 40 career games; `w2`: 2023 3 gp + 2024 17 gp = 20 career games. Choose 2023 vs 2024
  values so the WR FP/G order differs between the two seasons, and 2024 so the WR **Rec Yd** leader is not the
  **Rec Yd/G** leader. Include one 2024 WR under `ceil(0.5 × 17) = 9` gp.
  **Career-floor constraint (case 5):** the default floor is `ceil(0.5 × maxGp)` over the whole pool, every
  position. No player may have more than 40 career games (so `w1`'s 40 is the pool max and the default floor
  is exactly 20, which `w2` meets), and case 5 runs with `liveSeasonUsable` false so the career window holds
  no live games. Assert the precondition in the test: the max career `gamesPlayed` across the fixture is 40.
- `currentSeasonTotals = { season: 2025, complete: true, players: {...} }` with a few rows.
- `playerMap` positions for all ids; `playerRows` for all ids with `ktcValue`, `dynastyScore.score`,
  `ownerTeamName`.

Cases (each mirrors a brief bullet):
1. **Default Overview on a clean store** — no `market-column-set`: Overview button `aria`/class active and
   headers `G`, `FP ↓`, `FP/G`, `Prev rk`, `Owner`, `KTC`, `Dynasty` present; no `Trend` header.
2. **Migration** — stored `volume` → Stats headers (`Pass Yd` under ALL) and storage reads `stats`; same for
   `production`; `bogus` → Overview.
3. **Live option** — `liveSeasonUsable` true → the Window select has an option `2025 so far`; false → none.
4. **Window switch** — select `2023` then `2024`: a WR row's FP/G text and `#rank` differ between the two.
5. **Career floor** — Overview, WR pill, Window `career`: `w1`'s FP/G cell has a `#` rank; `w2`'s has a value
   and no `#`. (Discriminates: without `minGames` the floor would be 20 and `w2` would rank.)
6. **Per-game toggle** — Stats, WR pill, 2024: `Rec Yd` header and its leader's `#1`; click `Per game` →
   header `Rec Yd/G`, `#1` on the per-game leader; storage `market-stats-mode` = `perGame`; sort column unchanged.
7. **No rank below floor** — per-game mode, the <9-gp WR shows a value with no `#`.
8. **Pass Yd under ALL** — Stats, ALL: the WR row's Pass Yd cell is `—`; the QB row's is a number with `#1`.
9. **Prev rank** — Window `2024` → `w1`'s Prev rk equals its 2023 FP/G WR rank and the header `title` names
   `2023`; Window live (`liveSeasonUsable`) → title names `2024`; Window `last3` and `career` → no `Prev rk` header.
10. **Muted columns on Overview only** — `KTC`/`Dynasty` headers on Overview; absent on Stats and Usage.
11. **Stale window** — stored `market-window = 'live'` with `liveSeasonUsable` false → Window select value is
    `2024` (the default); storage is not rewritten.
12. **Default sorts and pill reset** — Usage default header `Opp/G ↓`; on Stats click `Player`, then the `QB`
    pill → back to `FP ↓`. A restored `market-sort` of `{column:'dynastyScoreValue'}` on Overview falls back to `FP ↓`.
13. **Missing window stats** — a `playerRows` id absent from every season shows `—` in FP and sorts last
    under FP desc, but its Owner/KTC render.
14. **Caption** — Overview on `2024` shows `2024 · League scoring`; Window covering 2019 (add a 2019 season with
    no snap keys, or a career window spanning it) shows `Snap % covers 2020 onward`; Stats never shows it.
15. **Old views reachable** — clicking `Value`, `Outlook`, `In-season`, `Efficiency` renders their existing
    signature headers (`Dynasty score`, `Proj`, `Opp shift`, `Target share`) and no `Window` select; no `Volume` button.

## 10. Docs

- `docs/ui.md` Market section: route-table row (`:27`) set list; the column-set-control paragraph (`:165`) →
  FACTS [Overview][Stats][Usage][Efficiency] · MODEL [Value][Outlook][In-season], default Overview,
  `volume`/`production` → `stats` migration; replace the Volume bullet (`:210`) with a **Fact views** bullet
  (descriptor path in `factViews.js`/`FactTable.jsx`, window selector + `market-window`, stats-mode toggle +
  `market-stats-mode`, ranks from `rankWindow` with the career 32-game floor, Prev rk, muted KTC/Dynasty,
  caption, no TREND gutter); TREND paragraph (`:167`) → present on Value/Outlook/In-season/Efficiency, not
  on the fact views; environment-filter bullet (`:181`) drop the `activeVolumeSeason` comparison; the sort
  steps (`:224–225`) mention the fact-view branch; In-season bullet (`:209`) "in `MODEL & MARKET` after
  Outlook" → `MODEL`; Efficiency bullet (`:211`) drop "joining Volume in the `ON FIELD` group" (→ `FACTS`
  group) and the quoted "unlike Volume" caption text (→ the new caption wording); `dataSeason` paragraph
  (`:248`) `volumeSeasons[0]` → `completedSeasons[0]`. The Fact views bullet states the Prev rk vs
  Ceiling/Floor divergence (§5.2). Mechanism only — no statements about which seasons are
  populated today (the snap note is UI copy, not doc).
- `docs/navigation.md:24` `/market` row set list.
- `docs/nav/components.md`: Market.jsx row (`:21`) — set list, migration, groups, `market-window`,
  `market-stats-mode`, `liveSeasonUsable` prop, `market-production-season` now unused (left in place); new
  rows for `market/factViews.js` and `market/FactTable.jsx`; the columnDescriptors row if it lists `COLUMNS`.
- `docs/nav/utils.md` `marketMetrics.js` row (`:49`): `rankWindow`'s `{ minGames }`, `PER_GAME_TWIN`,
  `METRIC_BY_ID`.
- `CLAUDE.md` navigation table, `src/components/market/` row: "table, fact-view descriptors and table, column
  descriptors, filter bar, filter panel". Stay under the 25,000-byte ceiling.

No signal-registry change (no new signal), no cross-repo registry change (no new coupling — the snap/RZ keys
are read through Slice A's existing module).

## 11. Done-definition notes

Standard done-definition. Run `npx vitest run src/__tests__/marketWindowStatsViewOnly.test.js
src/__tests__/currentSeasonTotalsIsolation.test.js src/__tests__/inSeasonEvidenceViewOnly.test.js` explicitly
and report all three green with no edits to the latter two. Smoke (visual change): start the app from
`.claude/launch.json`, open `/market`, and report for Overview/Stats/Usage under ALL and one position pill,
on the default window, `last3` and `career`: no `NaN`, no collapsed columns, ranks present, the Window select
and the Totals/Per game toggle work, Value/Outlook/In-season/Efficiency still render. Anton judges the result.
Hand-back as `../CLAUDE.md` specifies, plus `grep -rn "PROVISIONAL(" src/` output (this slice should add none).

## Plan review record

Full-depth plan-reviewer (2026-11-01): 1 HIGH, 3 MEDIUM, 4 LOW; no flags on hook ordering, descriptor
coverage, guard import lists, cross-repo, or the named deviations. All folded in (approved by Anton):
group-label test (§3.7, §9.3); `ctx` via `useCallback` for lint (§7.2); career-floor fixture cap (§9.4);
three stale `docs/ui.md` sites (§10); explicit RTL `cleanup()` (§9.4); §3.1 `LIVE` reach corrected; stale
Market.jsx comments and the single `completedSeasons` reader (§6.5); Prev rk vs Ceiling/Floor divergence
kept deliberately and documented (§5.2).

## Verification record

Session 2 hand-back: commit `769ee6f` on `main` (not pushed). Full-depth implementation-reviewer on
`42d1e71..769ee6f`: no blocking flags, no scope breach, seam tests untouched, old views unchanged. Six flags
(1 MEDIUM, 5 LOW), all accepted by Anton for Fix pass 1. The build's oversized-chunk warning predates
this slice (reproduced by building `42d1e71` in a throwaway worktree, 2026-11-01).

## Fix pass 1

**Review depth: light** — test and doc edits only; no source behaviour changes, no `full` trigger.
Touch only `src/components/market/Market.factViews.test.jsx`, `docs/navigation.md`, `docs/nav/utils.md`.
Do **not** edit `Market.jsx`, `FactTable.jsx`, `factViews.js`, any other test, or any other doc. If a new
assertion fails against current source, stop and report — do not change source to make it pass.

1. **Case 6 must prove the sort survives the toggle** (`Market.factViews.test.jsx` case 6, ~:135–146).
   Before clicking `Per game`, click the `Rec Yd` column header so the sort becomes `recYd`
   (`market-sort.column === 'recYd'`). After `Per game`: assert `JSON.parse(localStorage.getItem('market-sort')).column`
   is `'recYd'` (replacing the current `'fp'` assertion) and that a column header named `Rec Yd/G ↓`
   (the active-sort arrow) is in the document. Keep the existing twin-value and `market-stats-mode`
   assertions; reorder them only as needed for the new click.
2. **Case 13 must prove the null-sink** (~:212–219). Render with a `playerRows` override that puts the
   `ghost` row **first** (e.g. `[ghostRow, ...others]` built from the module's `playerRows`). Assert it is the
   last `tbody tr` under the default FP desc; then click the `FP` header once (FP ascending) and assert it is
   **still** the last row. Keep the `—` / Owner / KTC assertions.
3. **Caption branches** — add one new case after 14:
   - Half-PPR: `careerStats` override where the 2024 `w2` row has `scoringBasis: 'half_ppr'` (all else the
     same) → Overview on the default 2024 window shows text containing
     `Half-PPR basis (Sleeper's own scoring, not necessarily this league's)` and **no** `League scoring`.
   - Empty pool: `careerStats` override `{ 2024: {} }` → the caption paragraph's text is exactly `2024`
     (no ` · `, no scoring clause). Locate it by text `2024` within the header, or by `getByText('2024', { exact: true })`
     on a `<p>` (the Window `<option>` also reads `2024` — scope the query so it does not match the option).
4. **`market-window` persistence** — add one new case: render, `pickWindow('2023')`, assert
   `localStorage.getItem('market-window') === '2023'`; `cleanup()`; render again (no override) and assert the
   Window combobox's value is `'2023'`.
5. `docs/navigation.md:36–37`: replace the sentence about `COLUMNS`/`POSITION_STAT_COLUMNS` with:
   "`POSITION_STAT_COLUMNS`/`EFFICIENCY_COLUMNS` (Market's Outlook and Efficiency descriptor maps) live
   natively in `src/components/market/columnDescriptors.js`; the fact views' descriptors live in
   `src/components/market/factViews.js`;" — keep the `DYNASTY_GROUP_MAP`/`NFL_TEAMS` clause unchanged.
6. `docs/nav/utils.md` `nflStats.js` row: `used by \`Market.jsx\`/\`outlookPositionStats.js\`` →
   `used by \`outlookPositionStats.js\``. Nothing else in that row.

Done-definition: `npm test` green, `npm run lint` 0, `npm run build` clean (the pre-existing chunk-size
warning excepted). No smoke needed (no visible change). Commit on `main`, do not push. Hand back the SHA,
the files touched, and what each new or changed assertion checks.

Fix pass 1 applied as `347a5b4` (fix-applier). Light re-review on `769ee6f..347a5b4`: no flags — scope is
the three allowed files, all six items as specified, new assertions discriminate. Session 1 re-ran
`npm test` (167 files / 3340 green) and `npm run lint` (0) on `347a5b4`. Anton signed off visually 2026-11-01; pushed.
