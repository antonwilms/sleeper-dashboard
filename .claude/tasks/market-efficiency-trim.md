# Market Efficiency trim — remove columns duplicated in Stats

Repo: `sleeper-dashboard` (app). Session 1: opus, medium. Session 2: **sonnet**, medium.
Review depth: light — view descriptors only; no data, state, scoring, projection or cross-repo change.
Size: small. Visual change: Session 2 runs the app from `.claude/launch.json`; Anton judges.

## Goal

Efficiency carries only what Stats does not. Rule: **for every position pill, no metric id appears in
both `FACT_VIEW_COLUMNS.stats[pos]` and `FACT_VIEW_COLUMNS.efficiency[pos]`** (compared on the
descriptors' `metricId`; the value column `G` is not a metric and is exempt). Every metric stays
registered in `MARKET_METRICS` — nothing in `src/utils/marketMetrics.js` changes.

## Changes

### 1. `src/components/market/factViews.js`

- Line 90, `EFFICIENCY_REC` (WR and TE) →
  `[G, ...['ypt', 'epaPerTgt', 'racr'].map(m)]`
  (removes `catchPct`, `ypr`, `aDOT`, `dropRate` — all in `STATS_REC_COLS`, line 88).
- Line 116, `efficiency.QB` →
  `[G, ...['ypa', 'passTdRate', 'intRate', 'passerRating', 'passAdot', 'ypc', 'epaPerAtt', 'cpoe', 'rushEpaTotal'].map(m)]`
  (removes `cmpPct`, `sackRate` — both in `stats.QB`, line 101).
- Line 117, `efficiency.RB` →
  `[G, ...['btklRate', 'catchPct', 'ypr', 'dropRate', 'rushEpaPerAtt'].map(m)]`
  (removes `ypc`, `yacoPerAtt` — both in `stats.RB`, line 102).
- `efficiency.ALL` (line 121): unchanged.
- Line 18, `EFFICIENCY_DEFAULT_SORT.RB` → `{ column: 'btklRate', direction: 'desc' }`.
  QB `passerRating`, WR/TE `ypt`, ALL `FACT_DEFAULT_SORT.efficiency` stay.
- Add one comment line above `FACT_VIEW_COLUMNS` (or above the `efficiency:` key) stating the rule:
  `// Efficiency never repeats a Stats metric on the same pill — factViews.test.js enforces it.`

Do **not** touch: any `stats`/`usage`/`overview`/`model` list, `STATS_REC_COLS`, `USAGE_REC_COLS`,
`advancedCaption`, `factColumns`, `factSortableKeys`, `PER_GAME_TWIN`, or `Market.jsx`.

No caption text names a removed column: `advancedCaption` derives its labels from the advanced (`adv:
true`) columns, and every advanced column survives (QB `epaPerAtt`/`cpoe`/`rushEpaTotal`, RB
`rushEpaPerAtt`, WR/TE `epaPerTgt`/`racr`). So no caption edit and the existing `advancedCaption`
`it.each` rows must stay green unedited.

### 2. Stale-sort fallback — confirm, no code change

`Market.jsx:365-370`: the validity effect checks `factSortableKeys(columnSet, posFilter, …)` and, on a
miss, calls `setSortState(factDefaultSort(columnSet, posFilter))`. With `catchPct` gone from
`efficiency.WR`, a `catchPct` sort on WR Efficiency misses and resets to `ypt`. Nothing to change;
the tests below pin it.

Note on reachability (for the hand-back, not a code change): pills are not persisted
(`usePlayersTable` starts at `'ALL'`) and both a pill click and a view switch reset sort before the
effect runs, so a stored key reaches the effect on the ALL pill at mount. The WR case is therefore
pinned at the decision seam (pure test 3a) plus the mount path (test 3b).

### 3. `docs/ui.md` line 203 (Market → Efficiency bullet)

- Replace the per-pill column list with:
  QB `Y/A`/`TD%`/`INT%`/`Rating`/`aDOT`/`Y/C`/`EPA/att`/`CPOE`/`Rush EPA`; RB
  `Brk Tkl%`/`Catch%`/`Y/R`/`Drop%`/`Rush EPA/att`; WR and TE `Y/Tgt`/`EPA/tgt`/`RACR`.
- Add after the list: "No pill repeats a metric its Stats view shows (enforced in `factViews.test.js`)."
- Default-sort clause: `RB \`Y/C\`` → `RB \`Brk Tkl%\``.
- Labels must match `METRIC_BY_ID[id].label` — Session 2 checks each against `marketMetrics.js`.

`docs/nav/components.md` names no Efficiency column list or per-pill default — leave it.
CLAUDE.md, `docs/signal-registry.md`, `docs/cross-repo-registry.md`: no change (no module, factor,
signal or contract changes).

## Tests

### `src/components/market/factViews.test.js` — `describe('Efficiency fact view')`

1. **No Stats/Efficiency overlap.** For each of `QB`, `RB`, `WR`, `TE`, `ALL`: the set of
   `metricId`s in `FACT_VIEW_COLUMNS.stats[pos]` intersected with those in
   `FACT_VIEW_COLUMNS.efficiency[pos]` is `[]` (assert `toEqual([])` with `pos` as the message so a
   failure names the pill and the duplicate ids). Fails if a duplicate (e.g. `catchPct` on WR) is
   re-added. Show red: temporarily re-add `'catchPct'` to `EFFICIENCY_REC`.
2. **RB default is Brk Tkl%.** `factDefaultSort('efficiency', 'RB')` `toEqual({ column: 'btklRate',
   direction: 'desc' })`. Fails if the default still points at the removed `ypc` (the existing
   "default names a column that pill has" test would also go red then, but this one names the
   intended column). Show red: revert line 18 to `ypc`.
3a. **Stale WR sort falls back to Y/Tgt (decision seam).** `factSortableKeys('efficiency',
   'WR').has('catchPct')` is `false` and `factDefaultSort('efficiency', 'WR').column` is `'ypt'` — the
   two inputs `Market.jsx`'s validity effect uses. Fails if the sort would stick to a hidden column
   (catchPct still sortable on WR Efficiency). Show red: re-add `'catchPct'` to `EFFICIENCY_REC`.
4a. **Advanced columns survive the trim.** For each pill, the `metricId`s of `efficiency[pos]` whose
   `METRIC_BY_ID[id].adv` is truthy equal exactly: QB `['epaPerAtt', 'cpoe', 'rushEpaTotal']`, RB
   `['rushEpaPerAtt']`, WR/TE `['epaPerTgt', 'racr']`, ALL `[]`. Fails if the trim drops an EPA/CPOE/RACR
   column. Show red: remove `'cpoe'` from `efficiency.QB`.

### `src/components/market/Market.factViews.test.jsx` — `describe('Efficiency fact view')`

These existing tests break on the trim and must be updated to the new behaviour (not merely greened):

- **Test 1** (line 331) reads `Catch%` on WR Efficiency, which no longer exists. Rewrite it to read
  `Y/Tgt` with the same fixture overrides and rename it to
  `"1. follows the window: a WR's Y/Tgt and rank change with it"`. Expected from the fixture
  (`rec_tgt: 100` everywhere): 2023 — w1 800/100 = `8.0`, w3 7.0, w2 unranked (3 gp) → `'8.0#1'`;
  2024 — w2 10.0, w1 9.0, w3 8.0, w4 unranked (5 gp) → `'9.0#2'`. If the rendered values differ,
  stop and report rather than adjusting the expectation. Asserts the Efficiency cell follows the
  window; fails if the cell ignores the window.
- **Test 5** (line 382) → becomes **test 3b**: change the stored key from `'aySh'` to `'catchPct'`
  (now a retired Efficiency column) and the RB header assertion from `'Y/C ↓'` to `'Brk Tkl% ↓'`;
  update the title to `'5. a stale Efficiency sort key (catchPct) falls back to FP/G, and each pill
  resets to its own default'`. Keeps QB `'Rating ↓'` and WR `'Y/Tgt ↓'`. Fails if a stored retired
  column survives mount, or if RB still resets to `Y/C`. Show red: revert line 18 to `ypc` (RB header
  assertion fails).
- **Test 3** (line 353, "advanced columns show only on the window their source covers") is **4b**:
  unchanged, must stay green — it proves `EPA/tgt` and `RACR` still populate on the `dataSeason`
  (2024) window after the trim.

Every other existing test stays unedited and green. If any other test pins a removed Efficiency
column, stop and report it.

## Copies

None created.

## Done-definition

Per `CLAUDE.md` → Done-definition: tests above shown red then restored; `npm test`; `npm run lint`
(0 problems); `npm run build` (clean); smoke `/market` → Efficiency on each of QB/RB/WR/TE/ALL —
report the headers seen per pill, the RB default sort header (`Brk Tkl% ↓`), and that EPA/CPOE/RACR
cells render values (not `—`/`NaN`) on the `dataSeason` window. `grep -rn "PROVISIONAL(" src/`
output in the hand-back (expected unchanged). No data-repo backlog entry. Commit; hand back SHA, files
touched, deviations, and per test: assertion, defect caught, red confirmation.

## Out of scope

Stats / Usage / Overview changes; new metrics; EPA coverage; the per-game-mode overlap noted below.

## Observation (not in this slice)

In Stats **Per game** mode the ALL pill's `fp` column becomes `fpPerG` (`PER_GAME_TWIN`), which
Efficiency ALL also shows. The rule above is defined on descriptor ids (totals mode) and ALL is
explicitly unchanged, so this slice leaves it.

## Verification (Session 1, 2026-11-08)

Implementation: `9496c46` on `main` (touches `docs/ui.md`, `factViews.js`, `factViews.test.js`,
`Market.factViews.test.jsx`). Plan-reviewer and implementation-reviewer (light): no flags.
`npm test` 3430 green, lint 0, build clean (pre-existing chunk-size warning only).

**Test 1 red check (Session 2 could not show it; done here).** Defect reintroduced: in
`src/components/market/Market.jsx` the `windowStats` memo's dependency list had `activeWindow`
removed, so the table keeps the stats of the window it first rendered and ignores the Window
`<select>`. Ran
`npx vitest run src/components/market/Market.factViews.test.jsx -t "follows the window: a WR"` →
**red**: `1. follows the window: a WR's Y/Tgt and rank change with it` failed with
`Expected: "8.0#1"`, `Received: "9.0#2"` (the 2024 cell persisted after picking 2023). Reverted
with `git checkout -- src/components/market/Market.jsx`; the file re-ran 38/38 green; working tree
clean apart from this task file.

Status: verification clean. Awaiting Anton's visual sign-off and push approval.
