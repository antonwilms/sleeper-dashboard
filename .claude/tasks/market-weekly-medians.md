# Market round 2 · D2a — weekly layer and per-game medians

**Review depth: full** — a new consumer of the season-totals `weeklyStats` / `weeklyStatus` / league-basis
`weeklyPoints` fields (CR-02 rows, CR-14 scoring via `rescoreSeasonTotals`); moves a function out of
`marketWindowStats.js`; adds two `PROVISIONAL` sites; adds cross-repo index entry **CR-34** (weekly stat keys).
No `App.jsx` change, no `factors`/projection/scoring change, no new state.

**Revision 1 (2026-11-06): plan-reviewer (full) flags 1–7 folded in** (Anton: "fold all flags in"). 1, 2 → §7
caption gated on a median actually shown (`medianShown`), so tests 14/14b stay unchanged; 3 → W9 drops the pill;
4 → `weekValue` exported and used by W6, new W6b, distinct per-key totals; 5 → decision 10, CR-34, `WEEKLY_KEYS`,
the sum-check guard, W12/W13, D-90 rewritten; 6 → render-site tag in `FactTable.jsx`, tag text names both scaled
cases; 7 → decision 7 lists `isPlain` with its justification.

**Revision 2 (2026-11-06): re-review (full) flags 1–2 folded in** (Anton: "fold in and commit"). 1 → W2's row
carries `stats`, §2 says the sum check runs over played weeks only, W3–W5 rows carry matching `stats`; 2 →
decision 9 words the caption gate as "some player in the window". **Plan approved by Anton 2026-11-06 — ready
for Session 2 (sonnet, medium).**

Session 1: opus, high. Session 2: **sonnet**, medium. Visual change — Session 2 runs the app from
`.claude/launch.json` and smokes every fact view; Anton judges the result.

Planned at app `c738112`. Split from brief D2: **D2b** (`market-games-played-shares.md`) builds on this file's
`marketWeekly.js` and must start only after D2a is signed off.

Builds on `market-usage-stats-columns.md` (D1, signed off `e47957a`). Live source wins over every task file.

---

## 0. What this is, for Anton

Every per-game column in Market's fact views (FP/G, Looks/G, Tgt/G, Rec Yd/G, … and the Stats view's Per game
mode) shows the **median game** next to the average: `14.2 · 12.8`. A big average built on two monster weeks
now shows as such. Sorting and the `#rank` stay on the average, so nothing reorders. Rates and shares get no
median. Cost/risk: view-only; nothing reaches the projection or the dynasty score.

---

## 1. Decisions (Session 2 does not revisit)

1. **A played week is `weeklyStatus[i] === 'P'` → week `i + 1`.** Its stat line is `weeklyStats[week]`; a
   played week absent from a row that carries `weeklyStats` is all-zero (data-catalog `weeklyStats`: "a played
   week with no kept value is omitted"). `B`/`D`/`X` weeks are never games. Measured at `c738112` on
   `nfl/season-totals/2024.json`: on all 2,221 played non-`TEAM_*` rows the `'P'` count equals `gamesPlayed`
   and `weeklyPoints`' keys equal the `'P'` weeks.
2. **A row with no `weeklyStats` object is not covered** — its weeks are *not* read as zeros (that would make
   every median 0 in API-only mode, where `getSeasonTotals`' live path builds no `weeklyStats`). Coverage is
   per player across the window: one uncovered season → that player's stat medians are `null`.
3. **Weekly FP is the row's own `weeklyPoints[week]`** — the league-basis series `rescoreSeasonTotals`
   (`src/api/sleeperStats.js:329`) already scored week by week through `scoreSeasonStats` (exact) or
   ratio-scaled (fallback), the same series `outlookConsistency.extractGamePoints` reads. No scoring call is
   made here (no re-implementation, no `scoringSettings` needed). Never `sourceWeeklyPoints` (half-PPR).
   An array-shaped or missing `weeklyPoints`, or a non-finite week, → that player's FP median is `null`.
4. **A season whose `'P'` count differs from its `gamesPlayed` makes every median of that player `null`.**
   The average divides by `gamesPlayed`; the median must describe the same games or none.
5. **Medians and the tracked-key rule.** `perG` divides a key's tracked-season total by *all* window games
   (`marketMetrics.js:24`), i.e. a season where the key is untracked counts as zero games' worth. The median
   mirrors it: that season's weeks read 0 for the key. The median renders only when the average is finite, so
   a key untracked in every window season shows `—` as today.
6. **Which columns, and the D1 per-game toggle.** A metric column renders `avg · median` exactly when the
   metric it resolves to — after `factColumns`' Stats-view `PER_GAME_TWIN` swap — has `kind: 'perGame'`. So:
   Overview `FP/G`; Usage `Looks/G`, `Tgt/G`, `Pass Att/G`, `Cmp/G`; Efficiency ALL `FP/G`, `Looks/G`,
   `Scrim Yd/G`; Stats only in **Per game** mode (every twin). Totals mode, rates and shares: unchanged. The
   column id stays the total metric id (D1's rule). **Sort, `#rank`, filters and `minGamesSliderMax` read the
   average only**; medians never enter `rankWindow`, `factCellValue` or `applyMarketFilters`.
7. **The per-week definition sits on the metric, beside its average** — a new `week` field on every `perGame`
   metric: an array of stat keys summed per week, or `'fp'`. One registry entry holds both definitions; the
   equality test (T6) pins them together. Copied definitions this creates: `looksPerG.week` restates
   `marketWindowStats.js`'s `usage.looksPerG` formula (`:196`); `fpPerG.week: 'fp'` restates `ws.fpPerG`
   (`:223`, season `fantasyPoints`). Both are covered by W6. `isPlain` restates the plain-object check in
   `rescoreSeasonTotals` (`sleeperStats.js:352`): **not tested as a copy** — it is a generic type predicate, not
   a domain definition, and the two "covered" decisions differ on purpose (rescoring needs `weeklyStats` *and*
   `weeklyPoints` plain; this layer judges stat lines and points separately). `WEEKLY_KEYS`' literal is copied
   into the data repo's future key-survival test (decision 10) — the app test pins it (W13).
8. **`rowsFor` moves to the new util** as `windowSeasonRows` (body unchanged) and `marketWindowStats.js` imports
   it — one definition of "which rows a window season reads", not a copy.
9. **No median when null** — the cell shows the average alone (no `· —`), so a degraded source looks as today.
   The caption clause appears only when some player in the window has a median in one of the current pill's
   columns (§7) — the whole window pool, not only the rows a filter or search leaves on screen.
10. **New coupling, CR-34.** Medians read non-scoring keys (`rec_tgt`, `pass_att`, `pass_sack`, `rush_btkl`,
   `rush_fd`, …) from served `weeklyStats`; CR-02 guarantees only scoring keys, and the data side keeps the rest
   only because its exclusion is a denylist (`isWeeklyStatsExcluded`, `lib/sleeper.mjs:219`; none of these keys
   is excluded at `c738112`). An absent key reads 0 (decision 1), so a future exclusion would show a silent
   median of 0. Therefore: (a) `marketWeekly.js` exports `WEEKLY_KEYS`, the frozen union of every `week` key;
   (b) **app-side guard** — a key whose weeks do not sum to the row's season `stats` value (|diff| > 1e-6) in any
   counted season is *mismatched* for that player, and any median reading it is `null` (data-catalog: "every
   kept key's weeks sum to the season `stats` value", so this fires only on a data-side change); (c) index entry
   CR-34 with an app test (W13) and a data-side backlog item for the mirror test (§10). D2b extends `WEEKLY_KEYS`.

---

## 2. `src/utils/marketWeekly.js` (new)

Header comment (verbatim):
```js
// View-only, pure. Never feeds projectedPPG, the dynasty score, any `factors` entry or a snapshot, and never
// writes into `careerStats`, `currentSeasonTotals` or any row (guarded by marketWindowStatsViewOnly.test.js).
//
// Market's weekly layer: per player, per window season, the played weeks (weeklyStatus 'P') with that week's
// stat line (weeklyStats; a played week absent from it is all-zero, D-47) and league-basis FP (the row's own
// weeklyPoints, already scored by rescoreSeasonTotals — no scoring here). Live rows are read from
// currentSeasonTotals beside careerStats, never merged into it.
```
Imports: none.

```js
const EMPTY = Object.freeze({})
const isPlain = o => o != null && typeof o === 'object' && !Array.isArray(o)

// CR-34: every served weeklyStats key Market reads. The data repo must keep each one (not denylisted) with its
// weeks summing to the season stats value. Extend this list whenever a new weekly reader is added.
export const WEEKLY_KEYS = Object.freeze([
  'pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_sack',
  'rush_att', 'rush_yd', 'rush_td', 'rush_btkl', 'rush_fd',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rec_fd',
])

// moved verbatim from marketWindowStats.js `rowsFor` (only the name and `export` change)
export function windowSeasonRows(y, careerStats, currentSeasonTotals) { …same body… }

// One row's played weeks, in week order. `s` is null when the row carries no weeklyStats (not covered);
// `fp` is null when the week's league-basis points are missing or non-finite.
export function playedWeeks(row) {
  const status = Array.isArray(row?.weeklyStatus) ? row.weeklyStatus : []
  const stats = isPlain(row?.weeklyStats) ? row.weeklyStats : null
  const pts = isPlain(row?.weeklyPoints) ? row.weeklyPoints : null
  const out = []
  for (let i = 0; i < status.length; i++) {
    if (status[i] !== 'P') continue
    const w = i + 1
    // PROVISIONAL(heuristic): a week's points are ratio-scaled when the row's weeklyPointsMethod is 'scaled' · the row has no served weeklyStats, or they did not sum to the season · weeklyStats on every played row (D-47)
    const fp = pts && Number.isFinite(pts[w]) ? pts[w] : null
    out.push({ w, s: stats ? (stats[w] ?? EMPTY) : null, fp })
  }
  return out
}

// Per pid in `pids`: { weeks: [{ y, w, s, fp }], statsCovered, fpCovered, mismatched }. A season counts when
// the pid's row has gamesPlayed >= 1 (buildWindowStats' entry rule). statsCovered: every counted season's 'P'
// count equals its gamesPlayed and every week's `s` is non-null; fpCovered: the same count check and every `fp`
// non-null. mismatched: a Set of the WEEKLY_KEYS whose PLAYED weeks' stat lines (`playedWeeks`' `s`, never a
// weeklyStats entry for a non-'P' week), in some counted season with weeklyStats, do not sum to that row's stats
// value (|Σ s[k] − (row.stats?.[k] ?? 0)| > 1e-6; an absent key on both sides is 0 = 0).
// A pid with no counted season gets no entry.
export function buildWindowWeeks({ window, careerStats, currentSeasonTotals, pids } = {})

// Lower/upper middle averaged for an even count; null for an empty list. Does not mutate its input.
export function median(xs)

// One week's value for a perGame metric: the week's fp for week 'fp', else Σ over metric.week of (s[k] ?? 0).
// The single per-week rule — weeklyMedians and W6 both call it.
export function weekValue(metric, week)

// { [metric.id]: number|null } for every metric with kind 'perGame' in `metrics`: the median of weekValue over
// entry.weeks. null when entry.weeks is empty; for week 'fp' when !entry.fpCovered; for a key list when
// !entry.statsCovered or any of its keys is in entry.mismatched.
export function weeklyMedians(entry, metrics)
```
Iterate `window.seasons` in order; `pids` is any iterable (Market passes `windowStats.keys()`).

## 3. `src/utils/marketWindowStats.js`

- Delete `rowsFor`; add `import { windowSeasonRows } from './marketWeekly'`; the `sources` loop calls
  `windowSeasonRows(y, careerStats, currentSeasonTotals)`. Nothing else changes (D2b edits this file further).

## 4. `src/utils/marketMetrics.js`

- `perGame` gains a sixth parameter `week` and sets `m.week = week`:
  `const perGame = (id, label, positions, value, format, week) => ({ id, label, positions, kind: 'perGame', value, format, better: 'high', week })`
- Every `perGame(...)` call passes its `week`; `value` is unchanged everywhere:

| id | week | | id | week |
|---|---|---|---|---|
| `fpPerG` | `'fp'` | | `rushTdPerG` | `['rush_td']` |
| `passYdPerG` | `['pass_yd']` | | `btklPerG` | `['rush_btkl']` |
| `passTdPerG` | `['pass_td']` | | `tgtPerG` | `['rec_tgt']` |
| `passAttPerG` | `['pass_att']` | | `recPerG` | `['rec']` |
| `passCmpPerG` | `['pass_cmp']` | | `recYdPerG` | `['rec_yd']` |
| `sacksPerG` | `['pass_sack']` | | `recTdPerG` | `['rec_td']` |
| `rushAttPerG` | `['rush_att']` | | `scrimYdPerG` | `['rush_yd', 'rec_yd']` |
| `rushYdPerG` | `['rush_yd']` | | `totalTdPerG` | `['pass_td', 'rush_td', 'rec_td']` |
| `looksPerG` | `['pass_att', 'rush_att', 'rec_tgt']` | | `firstDownsPerG` | `['rush_fd', 'rec_fd']` |

  `rank: false` and `tooltip` spreads stay as they are.
- `total`, `rate`, `advRate` and every rate/total entry: unchanged (no `week`).

## 5. `src/components/market/factViews.js`

Add two exports (no new import):
```js
// The median shown beside a per-game cell: the metric's own median when the column resolves to a perGame
// metric and its average is finite; null otherwise. Display only — never a sort, rank or filter value.
export function factCellMedian(col, ws, medians) {
  if (!col.metric || col.metric.kind !== 'perGame' || !ws) return null
  if (factCellValue(col, null, ws) == null) return null
  const v = medians?.[col.metric.id]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

// True when some (player, column) pair would render a median — the caption clause's gate.
// `columns` is factColumns' output; `stats` a Map pid → window stats; `medians` a Map pid → weeklyMedians result.
export function medianShown(columns, stats, medians) {
  if (!stats || !medians) return false
  for (const [pid, ws] of stats) {
    const med = medians.get(pid)
    if (med && columns.some(c => factCellMedian(c, ws, med) != null)) return true
  }
  return false
}
```

## 6. `src/components/market/FactTable.jsx`

- New prop `medians` (a `Map` pid → `weeklyMedians` result, or null/undefined).
- `ctx` adds `med: medians?.get(row.player_id) ?? null` (dependency list gains `medians`). The header `useMemo`,
  sort and `handleSort` are unchanged — sort keeps `factCellValue`.
- Metric cell: `const md = v == null ? null : factCellMedian(c, ws, med)`, directly preceded by the render-site
  tag (one line, verbatim):
  `// PROVISIONAL(heuristic): an FP/G median can rest on ratio-scaled weekly points · the row has no served weeklyStats, or they did not sum to the season · weeklyStats on every played row (D-47)`
  and render, between the value and the rank span:
  `{md != null && <span className="text-dp-muted">{` · ${c.metric.format(md)}`}</span>}`
  so a cell's text reads `14.2 · 12.8#3`. Value columns (non-metric) never call it.
- Import `factCellMedian` from `./factViews` (the guard's import list is unchanged — same module).

## 7. `src/components/market/Market.jsx`

- Import `buildWindowWeeks, weeklyMedians` from `../../utils/marketWeekly`.
- After `windowStats`:
```js
  // Per-game medians (display only): the weekly layer over the same window and pool as windowStats.
  const windowMedians = useMemo(() => {
    if (!windowStats) return null
    const weeks = buildWindowWeeks({ window: activeWindow, careerStats, currentSeasonTotals, pids: windowStats.keys() })
    const perGame = MARKET_METRICS.filter(m => m.kind === 'perGame')
    const out = new Map()
    for (const [pid, entry] of weeks) out.set(pid, weeklyMedians(entry, perGame))
    return out
  }, [windowStats, activeWindow, careerStats, currentSeasonTotals])
```
- Pass `medians={isFactView ? windowMedians : null}` to `FactTable`.
- Caption: after the snap clause, append `' · Per-game columns: average · median'` when
  `medianShown(factColumns(columnSet, posFilter, { windowKind: activeWindow?.kind ?? null, statsMode }), factStats, windowMedians)`
  (fact views only — the caption line already renders only for them; import `factColumns`, `medianShown` from
  `./factViews`). An empty pool, API-only mode, or a window with no covered player shows no clause, so the
  existing exact-text caption tests 14 and 14b (`Market.factViews.test.jsx:262`, `:282–285`) stay unchanged.

**Not touched:** `rankWindow`, `marketFilters.js`, `marketAdvanced.js`, `App.jsx`, `outlookConsistency.js`,
`sleeperStats.js`, `fantasyPoints.js`, the Model view, the pop-up.

---

## 8. Tests

Each new test is shown failing with its defect temporarily reintroduced, then reverted (done-definition 1).
New file `src/utils/marketWeekly.test.js` holds W1–W6 (deep-freeze inputs as `marketWindowStats.test.js`'s
`freeze` does; `run`-style JSON before/after check where a builder is called).

| # | File | Asserts | Fails if |
|---|---|---|---|
| W1 | `marketWeekly.test.js` | `median([3, 1, 2])` 2; `median([4, 1, 3, 2])` 2.5; `median([7])` 7; `median([])` null; the input array is unchanged after the call | an even count takes one middle (2 or 3), the list is not sorted first, or the input is sorted in place |
| W2 | `marketWeekly.test.js` | row `{ gamesPlayed: 3, stats: { rec_yd: 150 }, weeklyStatus: ['P','P','D','P','B', 'X'×13], weeklyStats: { 1: { rec_yd: 50 }, 3: { rec_yd: 999 }, 4: { rec_yd: 100 } }, weeklyPoints: { 1: 8, 2: 1, 4: 15 } }` → `playedWeeks` weeks `[1, 2, 4]`, week 2's `s` deep-equals `{}`; `mismatched` empty (the `'D'` week's 999 is not summed); `weeklyMedians` `recYdPerG` 50 | a played week missing from weeklyStats is dropped (75), the `'D'` week 3 is read (75), or the sum check counts a non-played week (mismatched → null) |
| W3 | `marketWeekly.test.js` | a row without `weeklyStats` (same status/points) → `statsCovered` false, `recYdPerG` null, `fpPerG` median 8; a row whose `'P'` count is 3 but `gamesPlayed` 4 → both null | a missing `weeklyStats` reads as all-zero weeks (median 0), or a count mismatch is ignored |
| W4 | `marketWeekly.test.js` | `weeklyPoints { 1: 10, 2: 20, 3: 30 }`, `sourceWeeklyPoints { 1: 5, 2: 8, 3: 12 }`, `scoringBasis: 'league'` → `fpPerG` median 20 | the FP median reads the half-PPR `sourceWeeklyPoints` (8) |
| W5 | `marketWeekly.test.js` | window `[2026, 2025]`, `careerStats { 2025: { p: … 2 'P' weeks } }`, `currentSeasonTotals { season: 2026, complete: true, players: { p: … 3 'P' weeks } }` → `weeks.map(x => x.y)` `[2026, 2026, 2026, 2025, 2025]`; inputs deep-frozen; `careerStats` JSON unchanged and its keys lack `2026`; window `[2025]` → 2 weeks | live rows are merged into `careerStats` (frozen write throws / key appears) or the live season is skipped |
| W6 | `marketWeekly.test.js` | **copied-definition equality (originals: each perGame metric's `value`; `usage.looksPerG` `marketWindowStats.js:196`; `ws.fpPerG` `:223`).** One season, a QB, an RB and a WR, 3 played weeks each, every `weeklyStats` key summing to `stats`; every `WEEKLY_KEYS` key present on each row with **pairwise-distinct** season totals (e.g. 11, 13, 17, 19, …); `weeklyPoints` summing to `fantasyPoints`. For every `perGame` metric whose `positions` include the row's position: mean over the weeks of the module's own `weekValue(metric, week)` `toBeCloseTo(metric.value(ws))`, `ws` from `buildWindowStats` | any `week` list disagrees with its average (e.g. `scrimYdPerG.week` drops `rec_yd`, `looksPerG.week` drops `pass_att`, a list names the wrong key), or `weekValue` sums only the first key |
| W6b | `marketWeekly.test.js` | three covered weeks `{ rush_yd: 10, rec_yd: 50 }`, `{ rush_yd: 40, rec_yd: 0 }`, `{ rush_yd: 20, rec_yd: 5 }` (stats `rush_yd` 70, `rec_yd` 55) → `weeklyMedians` `scrimYdPerG` 40 | `weeklyMedians` sums only a list's first key (20) or bypasses `weekValue` |
| W7 | `marketMetrics.test.js` "shape" | `kind === 'perGame'` ⇔ `'week' in m`; `week` is `'fp'` or a non-empty array whose keys are all in `WINDOW_TOTAL_KEYS`; only `fpPerG` has `'fp'` | a perGame metric lacks `week`, or a rate/total gains one |
| W8 | `factViews.test.js` | `factCellMedian`: `recYd` column in Stats perGame mode with `medians { recYdPerG: 40 }` → 40; same column in totals mode → null; a `catchPct` column → null; a perGame column whose average is null → null. `medianShown`: false with `medians` null, with an empty `stats` Map, and when every median is null; true when one perGame column has a finite median; false when the only finite median belongs to a metric not among `columns` | a median shows on a total, a rate, or beside a `—` average; or the caption gate ignores whether a median is shown |
| W9 | `Market.factViews.test.jsx` | override `careerStats` with 2024 only: `w1` 3 'P' weeks `rec_yd` 100/0/0 (stats 100), FP 30; `w2` 20/20/20 (stats 60), FP 90; both gp 3, league-scored, `weeklyPoints` summing to FP; `currentSeasonTotals: null`; `market-column-set` `stats`, `market-stats-mode` `perGame`, `market-window` `2024`, `market-sort` `{ column: 'recYd', direction: 'desc' }`; **no pill click** (ALL pill — `handlePosFilter` would reset the sort to `fp`; Stats ALL has `recYd`, `factViews.js:106`) → row order w1 then w2 (FP order would put w2 first); `Rec Yd/G` cells `33.3 · 0.0#1` and `20.0 · 20.0#2` (ranks are per position) | sort or rank keyed on the median (w2 would lead), or the stored sort was silently replaced |
| W10 | `Market.factViews.test.jsx` | with W9's fixture: caption contains `Per-game columns: average · median` on Overview and Stats per-game; absent on Stats totals. With the shared fixture (no `weeklyStatus`): absent on Overview | the clause ignores the toggle, or shows when no cell has a median |
| W12 | `marketWeekly.test.js` | a covered row whose `stats.rec_yd` is 150 while its weeks sum to 100 (`rec` sums correctly) → `mismatched` has `rec_yd` only; `recYdPerG` median null, `recPerG` median finite | a key dropped or altered on the data side yields a silent median instead of `—` |
| W13 | `src/__tests__/marketWeeklyKeys.test.js` (new; CR-34's app test) | `WEEKLY_KEYS` equals a literal list in the test (the same 15 keys — the copy the data-side test mirrors; comment names `marketWeekly.js` as the original); every `week` key of every `perGame` metric is in `WEEKLY_KEYS`; every `WEEKLY_KEYS` key is in `WINDOW_TOTAL_KEYS` | a `week` list reads a key the contract does not cover, or the list changes without the index/data side |
| W11 | `marketWindowStatsViewOnly.test.js` | `marketWeekly.js` joins the "neither module" PIPELINE checks (regex gains `marketWeekly`); `marketWeekly.js` imports nothing; it never imports the in-season modules or the api layer | a projection/scoring file imports the weekly layer, or the layer grows an api/in-season import |

Every W-fixture row that carries `weeklyStats` (W3–W6b, W9, W10) also carries a `stats` whose values equal its
played weeks' sums, so the sum check (decision 10) does not null it — W12 is the only deliberate mismatch.

Existing tests: `marketWindowStatsViewOnly.test.js` "marketWindowStats.js imports exactly its four utils" →
five, adding `./marketWeekly` (rename the test accordingly). Every other existing test must pass unchanged —
the Market fixtures carry no `weeklyStatus`, so their medians are null, their cell texts do not move and the
caption clause stays off (tests 14 and 14b included); if one moves, stop and report.

---

## 9. Docs (same change)

- `docs/ui.md` → *Fact views* bullet: one sentence — every per-game column (after the Stats toggle) shows
  `average · median`, the median over the window's played weeks (`weeklyStatus 'P'`; a played week missing from
  `weeklyStats` reads 0; FP from the row's league-basis `weeklyPoints`); sort, rank and filters use the average;
  rates and shares have none; a player whose window rows lack `weeklyStats` shows the average alone; the
  caption clause.
- `docs/nav/utils.md`: new `marketWeekly.js` row (exports, rules 1–5, the sum-check guard, `WEEKLY_KEYS` as
  CR-34's app site, view-only, guard). `marketWindowStats.js`
  row: season rows come from `marketWeekly.windowSeasonRows`. `marketMetrics.js` row: every `perGame` metric
  carries `week`.
- `docs/nav/components.md`: `market/factViews.js` (`factCellMedian`, `medianShown`),
  `market/FactTable.jsx` (`medians` prop), `market/Market.jsx` (`windowMedians` memo, caption clause).
- `docs/signal-registry.md` row 46 (`weeklyStats`) consumers: add Market's per-game medians (view-only). Row 45
  (`weeklyPoints`/`weeklyStatus`): add the same.
- `docs/cross-repo-registry.md`: append, verbatim (348 bytes; the index is 12,537 at `c738112`, cap 13,000):
  ```
  #### CR-34 · Market weekly stat keys
  - **Invariant:** Every `WEEKLY_KEYS` key survives in served `weeklyStats`, its weeks summing to the season `stats` value.
  - **App:** `src/utils/marketWeekly.js` (`WEEKLY_KEYS`)
  - **Data:** `lib/sleeper.mjs` (`isWeeklyStatsExcluded`, `weeklyScoringStats`)
  - **Tests:** `src/__tests__/marketWeeklyKeys.test.js`
  ```
  Both Data symbols exist at data `lib/sleeper.mjs:219` / `:229`. CR-02/CR-14 entries unchanged.
- Capability-not-availability wording (`docsAvailabilityClaims.test.js`).

## 10. Data-repo backlog (done-definition 7)

Append to `.claude/tasks/data-repo-backlog.md`: `### D-90 · CR-34: mirror test for Market's weekly stat keys`
— **Found:** D2a (this commit) · **Blocking:** no (the app nulls a median whose weeks stop summing to the
season) · **Size:** small. (1) Add a data test (e.g. in `test/sleeper.test.mjs`) holding a literal copy of
`WEEKLY_KEYS` (original: app `src/utils/marketWeekly.js`) asserting `!isWeeklyStatsExcluded(k)` for each and
that `weeklyScoringStats` keeps a non-zero value of each; then add it to CR-34's **Tests** line. (2) data-catalog
`nfl/season-totals` Grain line ("View-only: displayed weeks and ±SD"): add Market's per-game medians as a
view-only consumer.

## 11. Done-definition notes

- Full `npm test`, `npm run lint` (0), `npm run build` (clean). `statKeysContract.test.js`,
  `crossRepoIndex.test.js` and `claudeMdSize.test.js` pass unchanged.
- Smoke: Overview, Stats (Totals and Per game), Usage, Efficiency on QB/RB/WR/TE/ALL, for the live window, a
  completed season and Career. Check `avg · median` on every per-game column, none on totals/rates/shares, no
  `NaN`, sort order unchanged versus the average, the caption clause.
- `grep -rn "PROVISIONAL(" src/` — two new sites (`marketWeekly.js` `playedWeeks`, `FactTable.jsx` median
  cell); paste the count before/after.
- `crossRepoIndex.test.js` must pass with CR-34 (size, contiguous ids, App site resolves, test exists).
- Hand-back per `../CLAUDE.md` → Session 2.

## Out of scope
Games-played shares and the weekly team (D2b), Efficiency trimming, route data, new data capture, any
scoring/model change, medians for rates or shares, a median column of its own, the pop-up.

---

## Verification — implementation-reviewer (full) on `816ff7b..ffc2e9e`

No source defect. Scope, the `rowsFor` move, every perGame `value`, both PROVISIONAL tags, the CR-34 entry (12,885
bytes) and W1–W13 all match the plan. The >500 kB chunk-size build warning predates D2a (named in the `776dd15`
and `42491b5` verification records; single bundle, no `manualChunks`). Two flags:
1. [backlog] D-90's **Found** says "D2a (this commit; …)" with no SHA (§10's own wording).
2. [fidelity] §8's deep-freeze + JSON before/after is applied only in W5 (W2 and W6 freeze; W3, W4, W6b, W12
   neither).

Triage: both accepted (Anton, 2026-11-06: "Run the fix pass").

## Fix pass 1

Test and backlog files only. **No source file changes.**

1. `.claude/tasks/data-repo-backlog.md` D-90 **Found** line: `D2a (this commit; ` → `` D2a (`ffc2e9e`; ``. Nothing
   else in the entry. (If a later push rebases `ffc2e9e`, the citation is corrected at push time per CLAUDE.md
   done-definition 9 — not here.)
2. `src/utils/marketWeekly.test.js`, helper `weeksOf` (`:20–21`): deep-freeze `careerStats` with the file's
   `freeze`, take `const before = JSON.stringify(careerStats)` before calling `buildWindowWeeks`, and
   `expect(JSON.stringify(careerStats)).toBe(before)` after; return the same entry as today. This covers W2, W3,
   W4, W6b and W12, which all call `weeksOf`. W2's explicit `freeze(...)` may stay (freezing is idempotent).
3. Same file, W6 (`:107–`): `const before = JSON.stringify(careerStats)` before its `buildWindowWeeks` call and
   `expect(JSON.stringify(careerStats)).toBe(before)` after the assertions.
4. Mutation check: temporarily make `buildWindowWeeks` write to a row it reads (e.g. `row.seen = true` inside the
   season loop) → W2, W3, W4, W6, W6b and W12 go red; revert. State in the hand-back which tests went red.

Leave alone: every other test, every source file, docs, the task file's other sections. Done-definition: full
`npm test`, `npm run lint` (0), `npm run build` (only the pre-existing chunk-size warning). Commit on `main`, do
not push. Hand back the SHA and the files touched.
