# Market · one Model view replaces Value / Outlook / In-season (C2)

**Review depth: full** — Market state/module change (three column sets merge into one view on the fact-view
render path; persisted keys `market-column-set`/`market-sort` gain a migration and `market-production-season`
is deleted), `FactTable.jsx` gains props (the file two view-only guards parse), and the pop-up gains a line.
No `App.jsx` change, no cross-repo contract change.

Session 1: opus, high. Session 2: **sonnet**, medium. Visual change — Session 2 runs the app from
`.claude/launch.json`; Anton judges the result.

**Status: plan approved by Anton 2026-11-01 — ready for Session 2 (sonnet).** Plan-reviewer (full) flags 1–9
folded in before approval: 1–2 docs/comments added to §9; 3 old tests ported (§8.1); 4 the `'toString'` test
dropped (it could not fail); 5 dynasty cell reads `dynastyScore?.score`; 6 `FACT_DEFAULT_SORT` import removed;
7 Opp-shift hover only where a value shows; 8 migration clears `market-sort`; 9 role label added to the pop-up
(§7.2), Opp/G before/after split to its own slice with the corrected framing (§0).

Builds on `market-window-stats-b-fact-views.md` and `market-efficiency-fact-view.md` (C1). Live source wins
over both. Not split: under the 40KB line.

---

## 0. What this is, for Anton

The three model tabs (Value, Outlook, In-season) become one **Model** tab with nine columns — dynasty score,
vs market, KTC, KTC trend, projection, change since preseason, opportunity shift, signals, owner — the same on
every position pill, sorted by dynasty score. It renders through the same table as the four fact views, so
Market ends with one table instead of two, and about half of `Market.jsx` is deleted.

Leaves Market's foreground, and where it is now:

| Item | Where it can still be seen |
|---|---|
| Ceiling / floor (best/worst season finish) | **Added to the pop-up** — a line in the Floor-risk tile (§7). |
| ±SD / PPG ± SD | Pop-up Floor-risk tile and Distribution section (unchanged). |
| Projected games | Pop-up "Next season" tile note, off-season. In-season that tile shows the rest-of-season note instead — unchanged by design (in-season-evidence 2b-2 §8). |
| Snap / opportunity trend, position stat trends | Pop-up Usage & efficiency rows (level + delta), unchanged. |
| In-season G / PPG | Pop-up "SO FAR" tile, unchanged. |
| Prior, ROS, update weight, `starts` count | Hover on the Model **Δ preseason** value (§4.3); pop-up "Rest of season" tile note. |
| Opp/G baseline and Opp/G now | Hover on the Model **Opp shift** value (§4.3). **Not in the pop-up — see below.** |
| Role label (Every-down back, …) | **Added to the pop-up** — a chip in Usage & efficiency (§7.2). |
| Career PPG sparkline, Now PPG, Δ vs now | Pop-up career chart and Next tile, unchanged. |

One gap this slice does not close — its own later slice (split agreed with Anton 2026-11-01):

- **Opp/G before/after in the pop-up.** The in-season opportunity numbers come from `inSeasonEvidence.js`,
  which a guard lets only Market import. The pop-up already has the inputs (`careerStats` and the live season's
  Sleeper weekly rows, `liveWeeklyRows`), so the real choice is: widen that guard's allowlist to the pop-up and
  reuse the one definition, or write a second opportunity definition in the pop-up that could drift.
  Recommendation: widen the allowlist. That is a guard decision, so it gets its own plan. Until then both
  numbers are one hover away on Market.

Pop-up cost note: the ceiling/floor and role additions each do a whole-league pass when a pop-up opens, the
same kind of cost as the pop-up's existing two-year-rank memo. Accepted; each is memoised per open.

Also gone: the TREND sparkline column on Outlook/In-season (Model's KTC trend column is the same cell), the
Outlook position-stat triples (the same rates live on Usage/Efficiency now, without the trend arrow), and the
ceiling/floor points-vs-average delta (the pop-up line shows rank and season only).

## 1. Scope

In: `src/components/market/Market.jsx`, `factViews.js`, `FactTable.jsx`, `FilterBar.jsx` (one string),
delete `columnDescriptors.js`, `src/components/dp/PlayerDetailModal.jsx` (ceiling/floor line, one new prop on
`<UsageEfficiencySection>`), `src/components/dp/UsageEfficiencySection.jsx` (role chip),
`src/utils/marketFilters.js` (one comment), tests, docs and comments (§9).

Out (do not touch): any score/projection computation; `App.jsx` (the `<Market>` props and the
`scoringPosteriors` seam are unchanged); Portfolio; every util (`seasonRanks`, `outlookConsistency`,
`outlookUsage`, `outlookPositionStats`, `twoYearBaseline`, `inSeasonEvidence`, `dynastySignalBadges`,
`marketWindowStats`, `marketMetrics`, `marketAdvanced`, `blendWeights` — code untouched; only the comment
edits §9 names); `usePlayersTable.js` code (comment only, §9); `FilterPanel.jsx`;
`dp/MarketTable.jsx`; the view-only guard tests (`currentSeasonTotalsIsolation`, `inSeasonEvidenceViewOnly`,
`twoYearBaselineViewOnly`, `marketWindowStatsViewOnly` — **no edits**; §6 explains why none is needed); fact-view
behaviour (columns, sorts, captions, windows — unchanged).

Consumer check done for the brief's conditional deletes: `columnDescriptors.js` (`POSITION_STAT_COLUMNS`) is
imported only by `Market.jsx` → delete the file. `twoYearRanks` is still needed (Model's dynasty cell) → kept,
regated. `usageByPlayer`, `roleCohort`, `seasonRanksData`, `teamShareTotals`, `perSeasonTeamShares` have no
reader in Market after the deletes → removed (the role cohort is rebuilt in the pop-up, §7.2).

## 2. `src/components/market/factViews.js`

Still imports exactly `../../utils/marketMetrics`. `FACT_VIEWS` stays the four fact views (Model is not a fact
view: no window, no Performance filters). Header comment: add "and the Model view (row-level columns, no
window)".

### 2.1 Model descriptors

Value columns only (no `metricId`). Two new optional descriptor fields, both strings/booleans so the file stays
pure data:

- `cell` (existing field, so far only `'owner'`): when FactTable is passed a renderer under that key (§3), the
  renderer draws the cell; otherwise FactTable falls back to `format` as today. Every Model column therefore
  still carries `value` **and** `format` (the descriptor test requires both).
- `tdClass`: the `<td>` class for a custom-cell column (default in §3).
- `tooltip`: header tooltip text.
- `rosLabel` / `rosTooltip`: label and tooltip used instead of `label`/`tooltip` when `factColumns` is called
  with `ros: true` (§2.2).

```js
const TREND_TOOLTIP = 'KeepTradeCut value trend over the captured snapshot window — capture-only, view-only; never moves the projection.'
const MODEL_COLUMNS = [
  { id: 'dynastyScore', label: 'Dynasty score', value: row => row.dynastyScore?.score ?? null,
    format: v => String(Math.round(v)), defaultSortDir: 'desc', align: 'left', cell: 'dynasty', tdClass: 'px-3 py-3 w-[230px]' },
  { id: 'divergencePct', label: 'Vs market', value: row => row.divergencePct ?? null,
    format: v => `${Math.round(v)}%`, defaultSortDir: 'desc', align: 'left', cell: 'vsMarket' },
  { id: 'ktcValue', label: 'KTC', value: row => row.ktcValue ?? null, format: v => v.toLocaleString(),
    defaultSortDir: 'desc', tooltip: 'KeepTradeCut dynasty value — crowd-sourced from dynasty managers. Scale 0–10000.' },
  { id: 'ktcTrend', label: 'KTC trend', value: row => row._trend?.delta ?? null, format: v => String(v),
    defaultSortDir: 'desc', align: 'left', cell: 'ktcTrend', tooltip: TREND_TOOLTIP },
  { id: 'projectedPPG', label: 'Next', rosLabel: 'ROS', value: row => row.projectedPPG ?? null, format: v => v.toFixed(1),
    defaultSortDir: 'desc',
    rosTooltip: "Rest-of-season rate: the preseason projection updated with this season's games." },
  { id: 'rosDelta', label: 'Δ preseason', value: row => (row._post ? row._post.ros.value - row._post.ros.prior : null),
    format: v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`, defaultSortDir: 'asc', cell: 'rosDelta',
    tooltip: 'Rest-of-season estimate minus the preseason prior. Hover a value for both.' },
  { id: 'oppShift', label: 'Opp shift', value: row => row._is?.oppShiftSort ?? null,
    format: v => `${Math.round(v * 100)}%`, defaultSortDir: 'desc', cell: 'oppShift',
    tooltip: "Carries + targets per game (QB: pass attempts + carries): this season's evidence-weighted rate versus the baseline, as a percentage of it. Volume settles about twice as fast as points, so this moves first when a role changes." },
  { id: 'signals', label: 'Signals', value: row => (row._signals?.length > 0 ? row._signals.length : null),
    format: v => String(v), defaultSortDir: 'desc', align: 'left', cell: 'signals' },
  OWNER,
]
```

- `FACT_VIEW_COLUMNS.model = { ALL: MODEL_COLUMNS }` — `factColumns` already falls back to `byPos.ALL`, so every
  pill gets the same nine columns.
- `FACT_DEFAULT_SORT.model = { column: 'dynastyScore', direction: 'desc' }`; `factDefaultSort` needs no change
  (its non-efficiency arm returns `FACT_DEFAULT_SORT[view]`).
- `oppShiftSort` is `oppShiftRel` (a fraction) or null — a new-role row has `oppShiftSort === null` and sorts
  last, as on In-season today. `divergencePct` sorts on the raw value as Value did (a no-KTC row may carry one).
- The `_trend`, `_post`, `_is`, `_signals` row fields are built by Market (§4.2) — descriptors only read them.

### 2.2 `factColumns` — the `ros` option

Signature becomes `factColumns(view, pos, { windowKind = null, statsMode = 'totals', ros = false } = {})`. The
value-column arm becomes:

```js
return {
  align: 'right', ...c,
  label: ros && c.rosLabel ? c.rosLabel : c.label,
  tooltip: ros && c.rosTooltip ? c.rosTooltip : c.tooltip,
}
```

No existing column has `rosLabel`/`tooltip`, so the fact views' output is unchanged except a `tooltip: undefined`
key on value columns (asserted harmless by the existing suite). `factSortableKeys` passes `opts` through
unchanged. No other helper changes.

## 3. `src/components/market/FactTable.jsx`

**Imports unchanged** (the `marketWindowStatsViewOnly` guard pins them). Three new props, all optional, so the
fact views' call is unaffected:

- `ros` (boolean) → passed into `factColumns(view, posFilter, { windowKind, statsMode, ros })`; add to the
  memo's deps.
- `cells` (`{ [cellKey]: row => ReactNode }`). In `renderRow`, after the `c.cell === 'owner'` branch:
  ```jsx
  if (c.cell && cells?.[c.cell]) {
    return <td key={c.id} className={c.tdClass ?? `px-3 py-3 ${c.align === 'left' ? '' : 'text-right'}`}>{cells[c.cell](row)}</td>
  }
  ```
- `playerMarker` (`row => ReactNode | undefined`) → `<PlayerCell row={row} marker={playerMarker?.(row)} />`.

`tooltipFor(c)`: after the `prevFpPerGRank` arm, `if (c.tooltip) return c.tooltip`, then the existing muted
fallback. Sorting is untouched — it already sorts every column by `factCellValue`, i.e. the descriptor's
`value`. Header comment: "Market's fact views and Model view … custom cells arrive as the `cells` prop, keyed by
a descriptor's `cell`; this file still builds no data."

## 4. `src/components/market/Market.jsx`

### 4.1 Delete (with their comments)

`COLUMN_SETS`, `COLUMN_SET_LABELS`, `COLUMN_SET_GROUPS`, `DEFAULT_SORT`, `VALUE_SORTABLE_KEYS`,
`OUTLOOK_SORTABLE_KEYS`, `INSEASON_SORTABLE_KEYS`, `SORTABLE_KEYS`, `SORT_LABELS`, `ROLE_ORDER`, `lastNonNull`,
`CeilingFloorCell`, `ConsistencyCell`, `UsageTrendCell`, `PositionStatCell`, `inSeasonSortValue`, the
`teamShareTotals`/`perSeasonTeamShares`/`usageByPlayer`/`roleCohort`/`seasonRanksData` memos,
`valueRows`/`outlookRows`/`inSeasonRows`, `enrichedRows`, the three per-set sort branches in `displayRows`,
`activeColumnLabel`, the whole `let header, colSpan, renderRow` block and its three branches, the In-season
caption `<p>`, the `<MarketTable>` render arm. The two `PROVISIONAL(heuristic)` tags at the deleted
`computeConsistency` sites go with them (the pop-up's own tag at its `computeConsistency` site stays).

Imports that become unused and are removed: `MarketTable`; `SortTh`, `PlayerCell`, `ClickableRow`,
`CareerBars`, `DeltaCell` (the whole `../dp/cells` import); `compareNullsLast`; `computeConsistency`,
`MIN_POOLED_GAMES`; `buildSeasonPositionRanks`, `computeCeilingFloor`; the whole `outlookUsage` and
`outlookPositionStats` imports; `POSITION_STAT_COLUMNS`; `FACT_DEFAULT_SORT` from `./factViews` (its only
reader was the deleted `DEFAULT_SORT` spread). Lint is the check.

Kept: `VsMarketCell`, `SignalsCell`, `TONE_TEXT`, `NOT_FROZEN_TITLES`, `NOT_FROZEN_DEFAULT_TITLE`, `GROUP_CHIPS`,
`trendByPlayer`, `twoYearRanks`, `inSeason`, and the imports `TrendCell`, `buildTwoYearRanks`/`ageCaution`/
`cautionAge`, `TwoYearRankCell`/`AgeCautionMarker`, `computeDynastySignalBadges`, `buildInSeasonPosteriors`.

### 4.2 View state, persistence, rows

```js
const VIEWS = [...FACT_VIEWS, 'model']
const VIEW_LABELS = { overview: 'Overview', stats: 'Stats', usage: 'Usage', efficiency: 'Efficiency', model: 'Model' }
// Retired views and what they open now; written back once.
const RETIRED_VIEWS = { volume: 'stats', production: 'stats', value: 'model', outlook: 'model', inseason: 'model' }

function loadColumnSet() {
  // The retired Volume season selector's key: nothing reads it; remove it once on load.
  try { localStorage.removeItem('market-production-season') } catch { /* ignore */ }
  try {
    const raw = localStorage.getItem('market-column-set')
    const migrated = raw != null && Object.hasOwn(RETIRED_VIEWS, raw) ? RETIRED_VIEWS[raw] : raw
    if (VIEWS.includes(migrated)) {
      if (migrated !== raw) {
        try { localStorage.setItem('market-column-set', migrated) } catch { /* ignore */ }
        // A retired model view's sort may name a column Model shares (Outlook's projectedPPG), which
        // would survive the validity check; Model opens on its own default instead.
        if (migrated === 'model') {
          try { localStorage.removeItem('market-sort') } catch { /* ignore */ }
        }
      }
      return migrated
    }
  } catch { /* fall through */ }
  return 'overview'
}
```

`Object.hasOwn` is hygiene (a prototype key such as `'toString'` would fall to Overview either way; no test for
it). The state keeps its `columnSet` name and the `market-column-set` key. **Order is load-bearing:** the
`useState(loadColumnSet)` call must stay above the `usePlayersTable` call (it is today, `Market.jsx:324` vs
`:330`), so the sort key is gone before the hook reads it; say so in a one-line comment at the hook call.
Volume/Production → Stats keep their sort (fact-view behaviour unchanged).

- `usePlayersTable({ storageKey: 'market-sort', defaultSort: factDefaultSort(columnSet, 'ALL') })` — identical to
  today for every fact view (`DEFAULT_SORT[efficiency]` was the ALL default), Model's for Model.
- `handleSelectColumnSet`: `setSortState(factDefaultSort(next, posFilter))` for every view (drop the
  `FACT_VIEWS.includes` ternary).
- Sort-validity effect: one branch for every view —
  `const valid = factSortableKeys(columnSet, posFilter, { windowKind: activeWindow?.kind ?? null, statsMode, ros: scoringPosteriors != null })`;
  `if (!valid.has(sortState.column)) setSortState(factDefaultSort(columnSet, posFilter))`. Add `scoringPosteriors`
  to its deps. A `market-sort` naming no Model column (`dynastyScoreValue`, `_trend`, `delta`, `ceilingRank`, …)
  falls back to `dynastyScore` desc. A key Model shares (`projectedPPG`, `divergencePct`, `ktcValue`,
  `ownerTeamName`, `full_name`) stays valid and is kept — except on the migration mount, where `loadColumnSet`
  has already removed it.
- `isFactView` keeps meaning the four fact views: the window memos, Window `<select>`, `performanceApplies`,
  `windowStats` for filters and the window caption are unchanged and stay off on Model.
- `const isModel = columnSet === 'model'`. Regate to Model (each returns its empty value otherwise):
  `trendByPlayer` (`new Map()`), `twoYearRanks` (`null`), `inSeason` (`null`).
- New memo:

```js
// Model rows (market-model-view.md §4.2) — the row-level fields Model's descriptors and cells read.
const modelRows = useMemo(() => {
  if (!isModel) return []
  return (playerRows ?? []).map(r => ({
    ...r,
    twoYearRank: twoYearRanks?.get(r.player_id) ?? null,
    ageCaution: ageCaution(r, playerMap?.[r.player_id], careerStats),
    _ageSource: cautionAge(playerMap?.[r.player_id], careerStats)?.source ?? null,
    _trend: trendByPlayer.get(r.player_id) ?? null,
    _signals: modelSignals(r),
    _is: inSeason?.byId.get(r.player_id) ?? null,
    _post: scoringPosteriors?.get(r.player_id) ?? null,
  }))
}, [isModel, playerRows, twoYearRanks, playerMap, careerStats, trendByPlayer, inSeason, scoringPosteriors])
```

  `modelSignals(row)` is a module-level function holding Outlook's filter verbatim: `computeDynastySignalBadges(
  row.dynastyScore?.signals ?? null, row)` minus the `agecurve` badge unless `ageCurveFactor >= 1.05 ||
  ageCurveFactor <= 0.95` (comment: the pop-up shows every badge; Market keeps OutlookTab's gate — do not move
  it into the shared helper).
- `displayRows`: input is `isModel ? modelRows : factRows`; position pill and `applyMarketFilters` exactly as
  today; returns `rows` unsorted (FactTable sorts). Drop the dead sort deps.

### 4.3 Model cells

Module-level `MODEL_CELLS = { dynasty, vsMarket, ktcTrend, rosDelta, oppShift, signals }`, each `row => node`,
and `modelPlayerMarker = row => (row.ageCaution ? <AgeCautionMarker kind={row.ageCaution} ageSource={row._ageSource} /> : undefined)`.

- `dynasty` — Value's dynasty cell body (score, meter, label, `<TwoYearRankCell entry={row.twoYearRank} position={row.position} />`;
  `—` when the score is null), with every `row.dynastyScoreValue` read replaced by `row.dynastyScore?.score`
  (Model rows do not carry `dynastyScoreValue`; a verbatim copy would read `—` everywhere).
- `vsMarket` — `<VsMarketCell row={row} />`.
- `ktcTrend` — `<TrendCell values={row._trend?.values} delta={row._trend?.delta} window={row._trend?.window} band={row._trend?.band} scale="cell" />`.
- `rosDelta` — `post = row._post`; null → `—` (`text-dp-muted text-xs`). Else the signed, coloured value as
  In-season's Δ cell rendered it, wrapped in a span whose `title` is
  `` `Prior ${prior.toFixed(1)} → ROS ${value.toFixed(1)} · ${Math.round(weight * 100)}% this season${post.start ? ` · ${post.start.starts} starts` : ''}` ``,
  followed by today's chips, in this order: `live` when `!post.frozen` (title from `NOT_FROZEN_TITLES`, default
  `NOT_FROZEN_DEFAULT_TITLE`); `GROUP_CHIPS[post.population]` (title 'Own measured update weight for this
  group'); `QB n%` when `post.start` (In-season's ROS-cell title, verbatim). `chip()` moves to module level
  unchanged. The cell is `whitespace-nowrap`.
- `oppShift` — In-season's Opp-shift cell logic verbatim (relative %, `new role` chip with `NEW_ROLE_TITLE`,
  else `—`; `NEW_ROLE_TITLE` moves to module level). Hover only where the cell shows a value: the relative-%
  span gets `title` = `` `Opp/G ${r.oppPrior.toFixed(1)} (${r.baselineSeason} season) → ${r.oppNow.toFixed(1)} this season` ``;
  the new-role span keeps its chip title and gains no other; a `—` cell has no title (an ineligible
  basis-mismatch row carries `oppPrior`/`oppNow` but shows `—`, so it must not leak them on hover).
- `signals` — `<SignalsCell signals={row._signals} />`.

### 4.4 Render

```jsx
<FactTable
  view={columnSet} ...existing props unchanged...
  ros={isModel && scoringPosteriors != null}
  cells={isModel ? MODEL_CELLS : undefined}
  playerMarker={isModel ? modelPlayerMarker : undefined}
/>
```

`windowStats={factStats}`/`ranks`/`prevRanks` are already null on Model (no window). The `isFactView ?
<FactTable> : <MarketTable>` ternary goes; FactTable is the only path.

**View control.** Two groups, same markup as today's group loop:
`[{ label: 'FACTS', views: FACT_VIEWS }, { label: null, views: ['model'] }]` — the second group's label slot
renders `<span aria-hidden="true" className="... invisible">MODEL</span>` (same classes as the FACTS label) so
the Model button sits level with the FACTS buttons in its own bordered container. Button text from
`VIEW_LABELS`. The comment above the loop: "Facts (what happened) and, separated, the Model view."

**Model caption** (replaces the In-season `<p>`; same element classes; only when `isModel`):

- `inSeason == null` → `No in-progress season data is loaded — the in-season columns read —.`
- else, in order: `` `${inSeason.liveSeason} season to date — up to ${inSeason.maxGames} games played. ` ``; the
  frozen-prior sentence exactly as today (three branches); then
  `<span title={EARLY_SEASON_DETAIL} className="underline decoration-dotted cursor-help">Early-season drops below the prior mostly reflect the projection running about 15–20% high.</span>`
  then `' '` and the scoring-basis sentence exactly as today (`inSeason.leagueScored` → "Scored on this
  league's settings." else "Half-PPR basis (Sleeper's own scoring, not necessarily this league's).").
- `EARLY_SEASON_DETAIL` (module const) = today's two sentences, verbatim: "Early-season drift below the prior
  mostly reflects the projection's known optimism — it runs roughly 15–20% high — not player performance.
  Since 2026-10-02, rookie and second-year dynasty scores start from their season projection without its
  market-value and college adjustments (second-year WRs keep the position baseline), so they moved once before
  any game counted; all of them now update with this season's games."

Market's header comment and the props note (lines ~33–45, ~281–295): rewrite to describe FACTS + Model on the one
FactTable path; keep the props-only rationale; `currentSeasonTotals` and `scoringPosteriors`/`frozenPriorStatus`
now feed "the Model view's in-season columns".

## 5. Other source

- `FilterBar.jsx:145` title → `'Not applied on Model'`.
- `marketFilters.js:163` comment → "…so a stored value never filters the Model view."
- `columnDescriptors.js` — delete.

## 6. Guards — why none needs an edit

- `inSeasonEvidenceViewOnly`: `buildInSeasonPosteriors` is still called only in `Market.jsx`; FactTable and
  factViews receive its output as row data (`_is`). Allowlist unedited.
- `marketWindowStatsViewOnly`: `factViews.js` imports stay `['../../utils/marketMetrics']`; `FactTable.jsx` imports
  stay exactly the pinned five — renderers arrive as props.
- `twoYearBaselineViewOnly`: Market and PlayerDetailModal are not on its pipeline list; unchanged.
- `currentSeasonTotalsIsolation`: Market still never names `dynastyScoreBase`; App untouched.

All four must stay green **without edits**. If any goes red, stop and report.

## 7. Pop-up

Gap check (live source, 2026-11-01): consistency ±SD present (Floor-risk tile, Distribution); projected games
present off-season (Next tile note); snap/opportunity trend present (Usage & efficiency rows with delta);
in-season G/PPG present (SO FAR tile). **Missing:** ceiling/floor ranks (§7.1) and role label (§7.2), both added
here; opp/G before/after — its own later slice (§0).

### 7.1 Ceiling/floor — `src/components/dp/PlayerDetailModal.jsx`

Add, beside the `consistency` memo (top of the component, above any early return):

```js
// Best/worst single-season positional finish — moved from Market's retired Value set (market-model-view.md §7).
const ceilingFloor = useMemo(() => {
  const { ranksByPlayer, refByPosRank } = buildSeasonPositionRanks(careerStats, playersMap)
  return computeCeilingFloor(ranksByPlayer.get(playerId), player.position, refByPosRank)
}, [careerStats, playersMap, playerId, player.position])
```

Import `{ buildSeasonPositionRanks, computeCeilingFloor }` from `../../utils/seasonRanks`. The Floor-risk tile's
`note` becomes:

```jsx
<>
  SD of per-game points
  {ceilingFloor && (
    <div data-testid="ceiling-floor" title={`Best and worst single-season finish by points per game among all ${player.position}s who played that season`}>
      Best {player.position}{ceilingFloor.ceiling.rank} ({ceilingFloor.ceiling.season}) · worst {player.position}{ceilingFloor.floor.rank} ({ceilingFloor.floor.season})
    </div>
  )}
</>
```

`player` is in scope there (destructured from `usePlayerProfile` at `PlayerDetailModal.jsx:66-81`).

### 7.2 Role label — `src/components/dp/UsageEfficiencySection.jsx`

The cohort is the same one Market built for Outlook: `buildRoleCohort` over the pop-up context's `playerRows`
(App's `playerRowsWithProj`, the array Market receives), each row's `buildUsageHistory` against the same
`perSeasonTeamShares` this component already computes.

- `PlayerDetailModal.jsx`: pass `playerRows={playerRows}` to `<UsageEfficiencySection>` (already destructured from
  `useProfileData()`). Nothing else in the modal changes.
- `UsageEfficiencySection.jsx`: new explicit prop `playerRows` (the header comment's "fixed list, never a spread"
  rule holds — add it to the list). Import `buildRoleCohort`, `classifyRole` beside `buildUsageHistory`. Move
  Market's `lastNonNull(history)` helper here, verbatim, as a module-level function. After the `usageHistory`
  memo and **above the early returns** (hook order):

```js
// Role label (cohort tertiles over every RB/WR/TE row) — moved from Market's retired Outlook set
// (market-model-view.md §7.2). A whole-league pass per open, memoised; same cost class as the shares above.
const role = useMemo(() => {
  if (!['RB', 'WR', 'TE'].includes(position)) return null
  const usageByPlayer = new Map()
  for (const r of (playerRows ?? [])) {
    if (['RB', 'WR', 'TE'].includes(r.position)) {
      usageByPlayer.set(r.player_id, buildUsageHistory(r.player_id, r.position, careerStats, perSeasonTeamShares))
    }
  }
  const latest = lastNonNull(usageHistory)
  return classifyRole({ position, snapPct: latest?.snapPct ?? null, share: latest?.share ?? null },
    buildRoleCohort(playerRows ?? [], usageByPlayer))
}, [position, playerRows, careerStats, perSeasonTeamShares, usageHistory])
```

  (Restricting the map to RB/WR/TE matches Market's cohort exactly: `buildRoleCohort` skips every other
  position.) Render, in the main return only, inside the existing "DISPLAY ONLY" header row after its text span:
  `{role && <DefinitionPopover term="Role" gloss="From the latest season's opportunity share (and snap share for the top band), banded against every player at this position in the league's player list."><span data-testid="usage-role" className="text-xs px-1.5 py-0.5 rounded bg-dp-chip text-dp-text-2">{role}</span></DefinitionPopover>}`.
  QB, and any player `classifyRole` returns null for, shows nothing.

## 8. Tests

Each test names the defect it catches; Session 2 shows each one failing with that defect temporarily
reintroduced, then reverted, and reports it.

### 8.1 `Market.test.jsx`

- `beforeEach` stores `'model'` (not `'value'`); comment: "The shared cases run on Model, the view-level
  successor of Value." `afterEach` keeps its `removeItem` list.
- **Remove** (replaced below, not edited green): 'renders the Value, Outlook and Efficiency sets…'; 'Value/Outlook
  "Next"/"Proj" headers…'; 'Value default sort…'; the Ceiling/Floor tests inside 'Ceiling/Floor + KTC'; the ±SD
  test; 'sort behaviours' 1 and 3; 'TREND gutter' test 'renders under Value, Outlook…' (:603); the whole
  'UsageTrendCell rename' describe; the In-season tests not ported below; 'Value set — two-year-average rank and
  age caution'.
- **Keep unchanged:** position pills (:179), row click/keyboard, loading, zero rows, pagination, filters, search,
  presets, Environment filters, the KTC locale test (it now runs on Model). These are view-agnostic; if any goes
  red on Model, **stop and report** — do not edit its assertions.
- **Port to Model** (move into the Model describe; the assertions keep their meaning, only the view that renders
  them and its header names change — record each in the hand-back): VS MARKET four states (:200); TREND
  rendering (:615 healthy/short/no-signal, `.value` mapping with the `.bg-dp-slate-2` count, the `13w` window,
  low-band sparkline suppression; :647 `ktcHistory` null; :654 `{series:{}}`) against the **KTC trend** column;
  In-season (:952) every not-frozen reason's chip title, (:1004) a baselined player with 0 live games reads `—`
  in Opp shift, (:1047) the league-scored basis sentence and not otherwise, (:1078) the relative Opp-shift sort
  with the new role last in both directions — against the Model columns.
- **New `describe('Model view')`** — reuse the In-season describe's fixture builders (`isCareer`, `isMap`, `mk`,
  `usable`, `rec`, `posteriors`) by lifting them to file scope:
  1. *Nine columns on every pill, dynasty default.* Headers are exactly Player, `Dynasty score ↓`, Vs market,
     KTC, KTC trend, Next, Δ preseason, Opp shift, Signals, Owner — on ALL and again after clicking each of QB,
     RB, WR, TE; first row is the highest score (p1). *Catches:* per-pill column variation or a wrong default.
  2. *Projection header.* `scoringPosteriors` null → `Next` with no title; a Map → `ROS` with the rosTooltip
     title. *Catches:* the label not following the seam.
  3. *In-season columns, no live season.* `currentSeasonTotals: null, scoringPosteriors: null` → every Δ
     preseason and Opp shift cell reads `—`, no `NaN`/`null` text, caption reads the no-data sentence.
     *Catches:* stale or fabricated in-season values.
  4. *In-season columns, live season.* The In-season fixture: `v1` Δ `+0.9` coloured up, title
     `Prior 12.0 → ROS 12.9 · 29% this season`, no chip; `rk` `-1.6` with the `live` chip titled with the
     model-changed reason and the `rookie` chip; a start-chain record (`start: { starts: 3, fraction: 0.6 }`)
     shows the `QB 60%` chip and `· 3 starts` in the title; Opp shift `+10%` for the baselined vet with title
     `Opp/G … (2025 season) → … this season`, the new-role row's chip, `—` for the basis-mismatch row (`mm`) and
     **no element in that cell carries a `title` containing `Opp/G`**. *Catches:* a dropped chip, a missing
     hover, or the mismatch row leaking its numbers on hover.
  5. *Sorts.* Click KTC trend: rows order by `_trend.delta` desc, nulls last (ktcHistory fixture from the old
     TREND describe). Click Vs market: order by `divergencePct` desc (p1 30, p5 8, p4 5, p2 −30, p3 null last).
     Δ preseason first click is ascending. *Catches:* sorting on the cell's object/label instead of the scalar,
     or the wrong first direction.
  6. *Signals gate.* A row with `dynastyScore.signals.ageCurveFactor: 1.02` shows no `Age curve` text and sorts
     as null; `1.08` shows `Age curve ×1.08`; a row with `isBreakout` + `ageCurveFactor: 1.0` shows Breakout only
     (count 1). *Catches:* the 0.95–1.05 gate removed or inverted.
  7. *Dynasty cell.* p1 with a 1993 birth date: `2-yr avg WR1` sub-line and the age marker (port of the old
     Value describe); clicking the sub-line does not open the player. *Catches:* marker/sub-line lost on the
     shared table, or click propagation.
  8. *Stale sort.* `market-sort` = `{ column: 'dynastyScoreValue' }`, then `{ column: '_trend' }`, then
     `{ column: 'delta' }` → each opens Model sorted `Dynasty score ↓`. *Catches:* a retired key sorting
     every row as null.
  9. *Caption.* With `frozenPriorStatus` ok: season line, `Priors frozen from the 2026-09-08 preseason capture.`,
     the one early-season sentence visible with `title` containing `2026-10-02`, and the basis sentence; the old
     long paragraph text is not visible as text. *Catches:* the paragraph left inline or the detail dropped.
  10. *Switching away and back.* Change sort on Model, click Overview → Overview's default; click Model →
      `Dynasty score ↓`. *Catches:* a Model sort leaking into a fact view or vice versa.

### 8.2 `Market.factViews.test.jsx`

- Test 2 gains: `value`, `outlook`, `inseason` each open Model (`Dynasty score ↓` header) and
  `market-column-set` reads `'model'` afterwards. *Catches:* a missing migration or no write-back.
- New: stored `outlook` with `market-sort` `{ column: 'projectedPPG', direction: 'desc' }` opens Model sorted
  `Dynasty score ↓` (not `Next ↓`), first row the highest score. *Catches:* a shared key surviving the
  migration (no `removeItem` in `loadColumnSet`, or the hook reading the sort first).
- New: stored `stats` with `market-sort` `{ column: 'passYd', direction: 'desc' }` keeps that sort.
  *Catches:* the migration reset firing for a non-Model view.
- New: `market-production-season` set before mount is `null` after mount. *Catches:* the key left behind.
- Test 15 replaced: no `Value`, `Outlook`, `In-season`, `Volume` buttons; the `Model` button exists; on Model
  there is no Window combobox and no Totals/Per game toggle. *Catches:* an old button left wired.
- Tests 6, 6b, 8: `pill('Value')` / stored `'value'` → Model; 6b's title assertion → `'Not applied on Model'`
  (changed behaviour, not a bend).

### 8.3 `factViews.test.js`

- `factColumns('model', pos)` returns the same nine ids for each of QB/RB/WR/TE/ALL; every column has `value`
  and `format`; `factDefaultSort('model', 'QB')` is `{ column: 'dynastyScore', direction: 'desc' }`.
  *Catches:* a per-pill Model list or a missing format fallback.
- `factColumns('model', 'ALL', { ros: true })` labels `projectedPPG` `ROS`; without, `Next`; the fact views'
  labels are identical with and without `ros: true`. *Catches:* `ros` leaking into fact views.

### 8.4 `PlayerDetailModal.test.jsx`

- New: a fixture player with two seasons ranked 1 and 3 among their position → `getByTestId('ceiling-floor')`
  reads `Best WR1 (YYYY) · worst WR3 (YYYY)`; a player with no `careerStats` has no `ceiling-floor` element.
  *Catches:* the line missing, ceiling/floor swapped, or a fabricated line for a player with no seasons.
- New (in `PlayerDetailModal.usageAvailability.test.jsx`, which already mounts the Usage & efficiency section):
  a context whose `playerRows`/`careerStats` hold six WRs on **one** team in one season (gp ≥ 8 each, `rec_tgt`
  100/80/60/40/20/10, no `off_snp` so snap share is null and no one can be Every-down) → the 100-target WR shows
  `usage-role` reading `Primary target`; the 10-target WR reads `Rotational`; a QB has no `usage-role`;
  a WR in a pool of fewer than six WRs has no `usage-role`. *Catches:* the chip missing, the cohort built from
  the wrong rows (e.g. only the open player — a pool of one never bands), or a label for a thin cohort.

### 8.5 Unchanged guards

The four guards in §6 plus `factorsSchema`, `statKeysContract`, `crossRepoIndex` pass unedited.

## 9. Docs

Mechanism wording only (`docsAvailabilityClaims` scope).

- `docs/ui.md` Market section: the control line (FACTS [Overview/Stats/Usage/Efficiency] · Model); replace the
  TREND-gutter paragraph, the Value/Outlook/In-season bullets and the start-chain bullet with one **Model**
  bullet (nine columns, same on every pill, default dynasty score desc, no window, Performance filters
  disabled, in-season columns `—` without `scoringPosteriors`/a usable live season, ROS/Next header, hovers,
  caption); rewrite "Sort mechanics" 1–4 to the single `factDefaultSort`/`factSortableKeys` path; note the
  `market-column-set` migration and the `market-production-season` removal. Pop-up section: the Floor-risk
  tile's ceiling/floor line.
- `docs/nav/components.md`: rewrite the `market/Market.jsx` row to match (drop TREND gutter, `UsageTrendCell`,
  `CeilingFloorCell`, `columnDescriptors`, "left in place"); `factViews.js` row gains the Model descriptors and
  `ros`; `FactTable.jsx` row gains `cells`/`playerMarker`/`ros`; `dp/PlayerDetailModal.jsx` row gains the
  ceiling/floor line.
- `docs/navigation.md:24` routing row and `:36-37` (`POSITION_STAT_COLUMNS` / `columnDescriptors.js`);
  `docs/nav/utils.md` rows for `inSeasonEvidence.js` ("Market's Model view"), `outlookUsage.js` (role now
  rendered by the pop-up's Usage & efficiency), `seasonRanks.js` (ceiling/floor now in the pop-up),
  `outlookPositionStats.js`, `outlookConsistency.js` wherever they name Market's Value/Outlook/In-season as a
  consumer.
- `docs/nav/components.md` also: `portfolio/Portfolio.jsx` (:15, "the same call Market's Outlook set … make"),
  `dp/TrendCell.jsx` (:32, the gutter → Model's KTC trend column), `dp/TwoYearRank.jsx` (:34, "rendered by
  Market's Value set" → Model), and `dp/UsageEfficiencySection.jsx` (new `playerRows` prop, role chip).
- `docs/architecture.md:76` ("Market's In-season set" → Model view) and `:165` ("Market's Outlook column set …
  memoized inside Market.jsx" → the pop-up's Usage & efficiency section computes them).
- `docs/signal-registry.md` (self-maintenance rule — display status changes): row 120 Ceiling/Floor → displayed
  in the pop-up's Floor-risk tile (rank + season; the points-vs-average delta is no longer rendered); 122
  consistency, 123 snap trend, 124 opportunity trend → displayed in the pop-up only; 125 role note → displayed in
  the pop-up's Usage & efficiency; 117 KTC history → Market's Model KTC trend column, not a gutter; and the
  Outlook/In-season display mentions at rows 45–56 and 68 → Model view / pop-up, as each actually is after this
  slice.
- `CLAUDE.md` `src/components/market/` row: drop "column descriptors". `README.md` lines naming
  `Value/Outlook/Production` and `columnDescriptors.js`: update.
- Source comments (text only): `factViews.js:28-31` descriptor-shape comment (add `cell`, `tdClass`, `tooltip`,
  `rosLabel`, `rosTooltip`); `factViews.js:52-55` Prev-rk divergence note (it now diverges from the pop-up's
  ceiling/floor line, not Value's); `dp/TrendCell.jsx:3`; `blendWeights.js:14`; `inSeasonEvidence.js:1`;
  `usePlayersTable.js:40-43` (the `ceilingRank`/`floorRank` ascending-first special case stays in code — Market
  no longer uses it; say so, do not delete the keys); `outlookUsage.js` and `dynastySignalBadges.js` headers.

## 10. Done-definition and hand-back

Repo done-definition in full. Smoke (app from `.claude/launch.json`): Model on ALL and one position pill, with
and without a stored `'value'`; the caption tooltip; hover a Δ preseason and an Opp shift value; switch to a fact
view and back; with a stored `'outlook'` + `projectedPPG` sort, confirm Model opens on dynasty score; open a WR's
pop-up and find the ceiling/floor line and the role chip. Paste `grep -rn "PROVISIONAL(" src/` (two Market lines
gone). Hand-back as `../CLAUDE.md` requires, plus every ported test (old line → new name), and the measured size
of `Market.jsx` before/after.

---

## Verification record (Session 1, 2026-11-01)

Implementation: **5b6f3b0** (`42491b5..5b6f3b0`), Session 2 on sonnet/medium. implementation-reviewer at **full**
depth (opus/high) on the diff.

Session 2's declared deviations, all accepted by the reviewer: (1) `playerPosition = player?.position` for the
ceiling/floor memo deps (lint) — `usePlayerProfile` never returns a null `player`, so identical; (2) `sortProps`
no longer destructured (unused); (3) `whitespace-nowrap` on an inner span (FactTable owns the `<td>`); (4) the
Opp-shift hover sits only on the relative-% span — meets §4.3, and test 4's `mm` row (non-null `oppPrior`/`oppNow`,
`oppShiftRel` null) would catch a leak; (5) extra tests assert real behaviour (2b uses stored `volume`, the
stronger check).

Build warning: the 500 kB chunk-size warning predates this slice (reproduced on `42d1e71`,
`market-window-stats-b-fact-views.md:620`; recorded pre-existing in `market-efficiency-fact-view.md:496,556`).
This diff touches no build config or dependency. Accepted as pre-existing.

Reviewer flags and triage:
1. signal-registry rows 51 and 55 still name Market's Outlook / In-season sets → **Fix pass 1, item 1.**
2. Model caption's no-data state still renders the early-season span and the "Half-PPR basis…" sentence; §4.4
   puts both under the live-season arm only. With no live season the basis sentence is a claim about data that
   is not there → **Fix pass 1, item 2.**
3. `UsageEfficiencySection.jsx` comments still say Market computes / passes the share denominators →
   **Fix pass 1, item 3.**
4. CLAUDE.md Advstats paragraph reworded "Efficiency column set" → "Efficiency view" beyond the requested edit →
   **accepted, no change** (accurate after C1/C2; meaning unchanged).
Scope note: the task file was committed inside 5b6f3b0 rather than separately — accepted.

## Fix pass 1

Review depth for the re-run: **light** (docs, comments, one caption branch; no `full` trigger).
fix-applier implements exactly this section; nothing else.

1. **`docs/signal-registry.md`** — row 51 (`tm_off_snp`): replace "Market's Outlook column set and" in the
   `buildUsageHistory` display-consumer list with "the pop-up's role label (cohort usage history)", keeping the pop-up `§usage`
   and Portfolio mentions as they are. Row 55 (rushing volume): replace "Market's In-season set via
   `inSeasonEvidence.js`" with "Market's Model view (Opp shift) via `inSeasonEvidence.js`". Change no other row.
2. **`src/components/market/Market.jsx`, Model caption `<p>`** — render the early-season `<span>`, the `' '`
   and the scoring-basis sentence only when `inSeason != null` (one `inSeason != null && (<>…</>)` wrapper
   around those three). The `inSeason == null` state renders only
   `No in-progress season data is loaded — the in-season columns read —.` (drop the trailing space from that
   string). Nothing else in the caption changes.
   **Test** — `Market.test.jsx`, Model test 3 (no live season): add assertions that the caption contains no
   `Early-season` text, no element with a `title` containing `2026-10-02`, and no `Half-PPR` / `Scored on this
   league` text. *Catches:* in-season caption copy rendered with no in-season data. Show it red with the wrapper
   removed, then restore.
3. **`src/components/dp/UsageEfficiencySection.jsx`** — the comment above `teamShareTotals` (line ~34): replace
   "recomputes the whole-corpus share denominators Market.jsx already computes independently. Hoisting to
   App.jsx is 4c's call." with "computes the whole-corpus share denominators itself, per pop-up open; hoisting
   to App.jsx was considered and not done." The comment above `usageHistory` (line ~48): replace "sourced from
   the same view-only perSeasonTeamShares Market.jsx already passes it — never recomputed (§3.1)" with
   "sourced from the view-only perSeasonTeamShares computed above (§3.1)". Comments only.

Leave alone: every other file, the CLAUDE.md wording (flag 4), the build warning. Run the done-definition, commit
on `main` (do not push), hand back the SHA and the red/green evidence for item 2's test.

### Fix pass 1 — outcome

Applied as **19df672** (`5b6f3b0..19df672`) by fix-applier; item 2's test seen red with the wrapper removed.
implementation-reviewer re-run once at **light** depth: **no flags** (row 51's double mention of the pop-up is
cosmetic, accepted). Verification clean. **Signed off by Anton 2026-11-02; pushed.**
