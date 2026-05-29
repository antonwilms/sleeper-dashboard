# Projection C2 — Historical KTC signals

## Goal

Build the data infrastructure to fetch *multiple* KTC snapshots from the data
repo, match players across them, and assemble per-player KTC value time-series.
Derive four historical KTC signals (delta, volatility, trajectory, rank-vs-median
trend) and record them into the projection's `factors` object for backtesting.

**The signals are capture-only in C2 — they do NOT move `projectedPPG`.** See
Architectural Decision 3 below for the rationale. This keeps C2 low-risk and
defers the "does the market improve projection accuracy?" question to a future
batch once backtest data exists.

---

## Architectural decisions

### Decision 1 — Data access pattern: **Option A (eager fetch + IndexedDB cache)**

Confirmed. The projection runs in bulk over every player in one App.jsx
`useMemo`; the snapshot time-series is shared across all players. Per-player lazy
fetch (Option B) would re-fetch the same ~8 snapshot files once per player —
hundreds of redundant CDN round-trips. Option A fetches each snapshot exactly
once, assembles a per-player structure, and caches the assembled result.

### Decision 2 — Window size: **8 most-recent snapshots, ≥5-day spacing**

The data repo ships KTC snapshots on a roughly weekly cadence. 8 snapshots:

- Long enough for a meaningful regression slope (signal 3) and a stable stdev
  (signal 2).
- Short enough to represent *recent* market sentiment, not a stale long arc.
- 8 parallel CDN fetches is cheap (~1 round-trip, ~50 KB each).
- 13/26-week windows risk including snapshots from before a player was ranked
  (rookies, deep prospects), inflating volatility with spurious zero-to-value
  jumps. 4 weeks is too noisy for a slope.

**Selection rule (handles cadence drift / same-week doubles):** enumerate all
`ktc/snapshot-YYYY-MM-DD.json` entries, sort by date descending, then walk from
newest: select a snapshot, skip any subsequent snapshot dated within 5 days of
the last selected one, repeat until 8 are selected or the list is exhausted.
This dedupes weeks where CI happened to land two snapshots and tolerates missed
weeks.

**Fallback when fewer than 8 exist:** use whatever is available. The window is
"most recent N available", never "N within the last N weeks". During the NFL
off-season the cadence may slow — the 8 snapshots simply span more calendar
time. `ktcHistWindowSpanDays` is recorded so a future backtest can down-weight
stale windows. With 0–1 usable snapshots every player's signals degrade to
neutral null sentinels (see Edge cases).

### Decision 3 — Does it move the projection? **No — capture-only in C2**

The signals are recorded into `factors` and nothing else. Rationale:

1. **The projection's value is being an independent, stats-based estimate.** Every
   existing factor traces to production data. "Market divergence"
   (`computeMarketDivergence`) is a deliberate, surfaced concept — the projection
   is *supposed* to be able to disagree with the market. Folding KTC sentiment
   into `projectedPPG` makes divergence tautologically smaller.
2. **There is no evidence yet that it helps.** Whether KTC momentum improves
   projection accuracy is genuinely unknown without a backtest. Capture-only
   records the signals into every daily projection snapshot
   (`projectionSnapshot.js` already serialises the full `factors` object), so the
   question becomes answerable with real before-the-fact data.
3. **Right now it would be a no-op anyway.** The data repo currently holds a
   single KTC snapshot, and that entry is `inProgress: true` (so `tryDataStore`
   skips it). Until several `inProgress: false` snapshots accumulate, *every*
   player's historical signals are neutral. Wiring a multiplier that does nothing
   for weeks — while adding clamp-stacking risk for when data does arrive — buys
   nothing.

Capture-only also means **no `adjustmentSummary` lines** for KTC signals (a
summary line implies the number moved — it didn't) and **no change to
`combinedNewFactor` or any clamp**.

This is **Open Question Q1** — flagged for user confirmation. The plan commits to
capture-only so a sonnet session has an unambiguous spec; if the user wants
movement, that is a separate future batch (design sketched under "Pipeline
location — deferred").

### Decision 4 — Signal selection: **all 4 ship**

Signals 1–3 derive from the same per-player value series at near-identical cost.
Signal 4 needs per-snapshot position medians — computed once per snapshot in the
loader (8 × ~499 players ≈ 4 k ops, trivial). All four are recorded; capture-only
makes the marginal cost of shipping all of them negligible.

---

## Files to create

| Path | Purpose |
|---|---|
| `src/utils/ktcHistory.js` | KTC snapshot history: async loader (`loadKtcHistory`) that fetches + matches + assembles the time-series; pure signal extractor (`computeKtcSignals`); local stats helpers. |

## Files to modify

| Path | Change |
|---|---|
| `src/utils/seasonProjection.js` | Import `computeKtcSignals`; add trailing `ktcHistory = null` param to `computeNextSeasonProjection`; compute signals once; spread the 13 `ktcHist*` keys into both the veteran and rookie `factors` blocks. No pipeline / clamp / `adjustmentSummary` change. |
| `src/App.jsx` | Add `ktcHistory` state; add a `useEffect` that calls `loadKtcHistory` on league load; add `ktcHistory` to the `seasonProjections` `useMemo` deps and pass it as the new trailing arg. |
| `README.md` | See "README updates" section. |

**Do not modify** `src/api/ktc.js`, `src/api/dataStore.js`, `src/utils/ktcMatch.js`,
`src/utils/projectionSnapshot.js`, or any other consumer. `ktcHistory.js` *imports
from* `dataStore.js`, `ktcMatch.js`, and `cache.js` — importing is fine; editing
them is not.

---

## Module spec — `src/utils/ktcHistory.js`

### Imports

```js
import { isDataStoreReady, tryDataStore } from '../api/dataStore'
import { matchKTCToSleeper } from './ktcMatch'
import { getCache, setCacheWithMeta } from './cache'
```

### Constants

```js
const WINDOW_SIZE     = 8       // snapshots
const MIN_SPACING_DAYS = 5      // dedupe same-week doubles
const CACHE_KEY       = 'ktc-history/v1'
const CACHE_TTL       = 1440    // 1 day — backstop only; real invalidation is the signature check
const SNAPSHOT_RE     = /^ktc\/snapshot-(\d{4}-\d{2}-\d{2})\.json$/
```

### Shape validator

```js
// True when `parsed` looks like a KTC snapshot: a non-empty array whose first
// element has a string `name` and a numeric `value`.
export function isValidKtcSnapshot(parsed)
```

### Pure stat helpers (module-private)

- `mean(nums)` — arithmetic mean.
- `stdev(nums)` — **population** stdev: `sqrt(Σ(x−mean)²/n)`.
- `median(nums)` — middle element of a sorted copy; mean of the two middle
  elements for even length; `null` for empty input.
- `olsSlope(ys)` — ordinary-least-squares slope of `ys` against
  `x = 0,1,…,n−1`. `slope = Σ((xᵢ−x̄)(yᵢ−ȳ)) / Σ((xᵢ−x̄)²)`. Returns `null`
  for `n < 2` or zero x-variance.

### `loadKtcHistory` — async loader (called from App.jsx)

```js
/**
 * Fetches the recent KTC snapshot window from the data store, matches each
 * snapshot to Sleeper IDs, and assembles per-player value time-series plus
 * per-snapshot position medians.
 *
 * @param {Object} args
 * @param {Object} args.playersMap  Sleeper player map { [player_id]: player }
 * @param {number} [args.window]    Snapshot count (default WINDOW_SIZE = 8)
 * @returns {Promise<KtcHistory|null>}  null when the data store is unavailable
 *                                      and no cache exists.
 */
export async function loadKtcHistory({ playersMap, window = WINDOW_SIZE })
```

**Algorithm:**

1. If `!playersMap` → return `null`.
2. `if (!(await isDataStoreReady())) return getCache(CACHE_KEY)` — data store
   down: serve a previously cached structure if one exists, else `null`.
   (`isDataStoreReady()` also triggers the manifest load, populating the
   `data-store/manifest` IndexedDB entry — relied on by step 3.)
3. `const manifest = await getCache('data-store/manifest')`. If `null` (manifest
   load failed or the cache entry is unexpectedly absent) → `return
   getCache(CACHE_KEY)`. *Note:* `dataStore.js` exposes no manifest-enumeration
   export and may not be modified, so the full manifest is read from its
   IndexedDB cache key. See Open Question Q2.
4. **Enumerate** — `Object.keys(manifest.files)` filtered by `SNAPSHOT_RE`; for
   each match capture `{ path, date }` (date string from the regex group). Skip
   keys that fail the regex.
5. **Select** — sort candidates by `date` descending. Walk the sorted list:
   select the first; for each next candidate, select it only if its date is
   ≥ `MIN_SPACING_DAYS` days older than the last selected date; stop at `window`
   selections. Result: `selected` (newest → oldest).
6. **Cache check** — `const cached = await getCache(CACHE_KEY)`. The newest
   selected snapshot's manifest entry gives `lastModified`. If `cached` exists
   **and** `cached.snapshotDates` equals the selected dates (ascending,
   element-wise) **and** `cached.latestSnapshotLastModified` equals that
   `lastModified` → return `cached`.
7. **Fetch** — in parallel:
   `await Promise.all(selected.map(s => tryDataStore(s.path, { validate: isValidKtcSnapshot })))`.
   `tryDataStore` never throws and returns `null` for `inProgress`, schema-too-new,
   404, timeout, or shape-mismatch. Pair each result with its `date`; drop
   `null`s. Call the survivors `usable` (each `{ date, players: [...] }`).
8. If `usable` is empty → assemble and cache an **empty structure** (`series:
   {}`, `positionMedians: {}`, `snapshotDates: []`) so the projection records
   neutral sentinels, then return it.
9. **Per-snapshot processing** (for each `usable` entry, oldest → newest):
   - `const ktcMap = matchKTCToSleeper(players, playersMap)` →
     `Map<sleeperId, { value, confidence }>`.
   - Bucket matched entries by `playersMap[sleeperId].position` (QB/RB/WR/TE).
   - For each position bucket: compute `median` of the values; sort the bucket's
     values descending to assign 1-based `positionRank` per player.
   - Record `positionMedians[date] = { QB, RB, WR, TE }` (a position with no
     matched players → omit / `null`).
   - For each `(sleeperId, { value })`: append
     `{ date, value, positionRank, valueVsPosMedian }` to `series[sleeperId]`,
     where `valueVsPosMedian = value / Math.max(positionMedian, 1)`.
10. Each `series[sleeperId]` array is in ascending date order (snapshots
    processed oldest → newest).
11. Assemble the `KtcHistory` object (shape below).
12. `await setCacheWithMeta(CACHE_KEY, history, CACHE_TTL, { sourceLastModified:
    history.latestSnapshotLastModified })`.
13. Return `history`.

### `computeKtcSignals` — pure extractor (called from seasonProjection.js)

```js
/**
 * Derives the four historical KTC signals from one player's value series.
 * Pure — no IO. Safe to call for every player on every projection re-run.
 *
 * @param {Array|null} series  Ascending-by-date array of
 *                             { date, value, positionRank, valueVsPosMedian },
 *                             or null/undefined when the player matched no
 *                             snapshot.
 * @returns {KtcSignals}  Always returns all 13 keys; null sentinels when the
 *                        series has fewer than 2 points.
 */
export function computeKtcSignals(series)
```

---

## Data shapes

### `KtcHistory` (loader output, cached under `ktc-history/v1`)

```
{
  schemaVersion: 1,
  generatedAt: string,                  // ISO timestamp
  window: number,                       // 8
  snapshotDates: string[],              // ascending 'YYYY-MM-DD', usable snapshots only
  latestSnapshotLastModified: string|null,  // manifest lastModified of the newest selected snapshot
  series: {                             // matched players only
    [sleeperId]: Array<{
      date: string,                     // 'YYYY-MM-DD'
      value: number,                    // raw KTC value
      positionRank: number,             // 1-based rank within position in that snapshot
      valueVsPosMedian: number,         // value / position median value in that snapshot
    }>                                  // ascending by date
  },
  positionMedians: {
    [date]: { QB: number|null, RB: number|null, WR: number|null, TE: number|null }
  },
}
```

### `KtcSignals` (extractor output — the 13 `factors` keys)

| Key | Type | Meaning |
|---|---|---|
| `ktcHistDelta` | number\|null | `latest.value − earliest.value` (raw KTC units) |
| `ktcHistDeltaPct` | number\|null | `ktcHistDelta / max(earliest.value, 1)`, 3 dp |
| `ktcHistVolatility` | number\|null | population stdev of the value series, 1 dp |
| `ktcHistVolatilityPct` | number\|null | `stdev / mean`, 3 dp |
| `ktcHistTrajectorySlope` | number\|null | OLS slope of value vs snapshot index (KTC units / step), 1 dp |
| `ktcHistTrajectoryNormalized` | number\|null | `slope / max(mean, 1)`, 4 dp |
| `ktcHistTrajectoryLabel` | string\|null | `'rising'` / `'flat'` / `'falling'` |
| `ktcHistRankVsMedianTrend` | number\|null | OLS slope of `valueVsPosMedian` vs snapshot index, 4 dp |
| `ktcHistRankVsMedianLabel` | string\|null | `'gaining'` / `'flat'` / `'losing'` |
| `ktcHistValueVsPosMedian` | number\|null | latest point's `valueVsPosMedian`, 3 dp |
| `ktcHistSampleSize` | number | count of snapshots the player appeared in (0+) |
| `ktcHistWindowSpanDays` | number\|null | whole days between earliest and latest series point |
| `ktcHistConfidence` | string | `'none'` / `'low'` / `'medium'` / `'high'` |

All numeric keys except `ktcHistSampleSize` are `null` when `series` has fewer
than 2 points. `ktcHistSampleSize` is always `series?.length ?? 0`.

---

## Per-signal specification

Let `series` be sorted ascending by date, `n = series.length`,
`values = series.map(p => p.value)`, `m = mean(values)`.

### Common: sample size & confidence

- `ktcHistSampleSize = n`.
- `ktcHistWindowSpanDays`: `round((Date(series[n-1].date) − Date(series[0].date))
  / 86 400 000)`; `null` when `n < 2`.
- `ktcHistConfidence` by `n`: `0–1 → 'none'`, `2–3 → 'low'`, `4–6 → 'medium'`,
  `7+ → 'high'`.
- **When `n < 2`:** every signal value/label is `null`, `ktcHistConfidence =
  'none'`. Return immediately. (Covers: player in 0 or 1 snapshots — new
  rookies, deep prospects, the current single-snapshot data state.)

### Signal 1 — KTC delta

- `ktcHistDelta = values[n-1] − values[0]` (raw KTC units).
- `ktcHistDeltaPct = round(ktcHistDelta / max(values[0], 1), 3)`.
- Computable at `n ≥ 2`. Raw units are kept for backtesting; the pct form is the
  normalised, scale-free version a future multiplier would consume.

### Signal 2 — KTC volatility

- `ktcHistVolatility = round(stdev(values), 1)` — population stdev.
- `ktcHistVolatilityPct = round(stdev(values) / max(m, 1), 3)`.
- Computable at `n ≥ 2` (stdev of 2 points is `|a−b|/2`); `'low'` confidence
  flags the thin sample. Distinct from the existing single-point market
  divergence — volatility is about *how much the market's view moves over time*,
  not stats-rank vs KTC-rank at one instant.

### Signal 3 — KTC trajectory

- `ktcHistTrajectorySlope = round(olsSlope(values), 1)` — KTC units per snapshot
  step.
- `ktcHistTrajectoryNormalized = round(slope / max(m, 1), 4)` — scale-free
  (fraction of mean value per step).
- `ktcHistTrajectoryLabel` from `ktcHistTrajectoryNormalized`:
  `> 0.01 → 'rising'`, `< −0.01 → 'falling'`, else `'flat'` (±1 % of value per
  snapshot).
- Computable at `n ≥ 2`. Implement OLS locally in `ktcHistory.js`; do **not**
  import `computeTrajectory` from `regressionSignals.js` — that helper is
  season-domain, recency-weighted, and normalised by career PPG. KTC trajectory
  is an unweighted OLS over the snapshot window.

### Signal 4 — KTC rank vs position-median trend

- `series` points already carry `valueVsPosMedian` (computed in the loader).
- `ktcHistRankVsMedianTrend = round(olsSlope(series.map(p => p.valueVsPosMedian)),
  4)` — change in the value/median ratio per snapshot.
- `ktcHistRankVsMedianLabel`: `> 0.01 → 'gaining'`, `< −0.01 → 'losing'`, else
  `'flat'` — positive means the player is pulling ahead of their position's
  median (the market increasingly favours them relative to positional peers).
- `ktcHistValueVsPosMedian = round(series[n-1].valueVsPosMedian, 3)` — the latest
  point-in-time ratio.
- Computable at `n ≥ 2`. The value/median ratio is preferred over raw
  `positionRank` for the trend because the ratio is continuous; `positionRank`
  is kept in the series as a recorded field for future use / debugging.

### Multiplier range — N/A in C2

Capture-only: no signal moves `projectedPPG`. The normalised forms
(`ktcHistDeltaPct`, `ktcHistVolatilityPct`, `ktcHistTrajectoryNormalized`,
`ktcHistRankVsMedianTrend`) are recorded ready-to-scale so a future batch can
build a multiplier without re-deriving them.

---

## Pipeline location

**C2: none.** `computeKtcSignals` is called once near the top of
`computeNextSeasonProjection` (after `player` is resolved, before the
rookie/veteran branch) and its result is spread into the `factors` object on
both return paths. It touches neither `rawPPG`, `pipelinePPG`, `combinedNewFactor`,
nor any clamp.

**Deferred design (do NOT implement — for the future "move projection" batch if
Q1 resolves that way):** a single bounded multiplier
`ktcHistFactor = clamp(1 + composite, 0.95, 1.05)` applied as a **separate
post-pipeline multiplier** — after the Step 9 career-comp blend, parallel to how
B3 sits *outside* `combinedNewFactor`. KTC is a market/ensemble signal, not a
player-internal stats signal, so it should not join the seven-factor
`combinedNewFactor` stack. Keeping it separate also keeps its effect legible and
its clamp independent. The rookie path's static `ktcMult` would stay as-is; the
new multiplier would *extend*, not replace it.

---

## Integration — `seasonProjection.js`

1. Add import:
   ```js
   import { computeKtcSignals } from './ktcHistory'
   ```
2. Change the signature (new trailing optional param — keeps every existing call
   site valid):
   ```js
   export function computeNextSeasonProjection(
     playerId, playersMap, careerStats, empiricalCurves,
     positionPeakPPG, historicalShares, depthMap,
     teamContext, scoringSettings, ktcMap, collegeStats,
     currentSeason, qbQualityByTeam = null, ktcHistory = null
   )
   ```
3. After `const player = playersMap?.[playerId]` resolves and the SKILL guard
   passes, compute once:
   ```js
   const ktcSignals = computeKtcSignals(ktcHistory?.series?.[playerId] ?? null)
   ```
   Place this *before* the rookie-vs-veteran branch so both paths can use it.
   `rookieProjection` does not currently receive enough context — either pass
   `ktcSignals` into `rookieProjection` as a new argument, or (simpler) compute
   `ktcSignals` in `computeNextSeasonProjection` and merge it into the rookie
   result's `factors` after `rookieProjection` returns:
   ```js
   if (qualifying.length === 0 || (yearsExp != null && yearsExp <= 1)) {
     const r = rookieProjection(player, playerId, ktcMap, playersMap, collegeStats, positionPeakPPG)
     return { ...r, factors: { ...r.factors, ...ktcSignals } }
   }
   ```
   Use whichever is cleaner; the merge-after approach avoids touching
   `rookieProjection`'s signature.
4. Veteran path: spread `...ktcSignals` into the returned `factors` object
   (alongside `compBlendWeight` etc.).
5. **No** `adjustmentSummary` lines. **No** clamp / `combinedNewFactor` change.

Result: every projection's `factors` gains exactly the 13 `ktcHist*` keys. The
`ktcHist*` prefix avoids any collision with the rookie path's existing `ktcMult`
/ `ktcPct`.

---

## Integration — `App.jsx`

### New state

Beside `const [ktcMap, setKtcMap] = useState(null)` (~line 514):

```js
const [ktcHistory, setKtcHistory] = useState(null)
```

### New loader effect

After the existing `getKTCValues` effect (~line 591), mirroring its structure:

```js
// Load historical KTC snapshot series once per league load (Projection C2).
// Capture-only: feeds factors diagnostics, never moves projectedPPG.
useEffect(() => {
  if (!leagueData?.playerMap) return
  let cancelled = false
  loadKtcHistory({ playersMap: leagueData.playerMap }).then(h => {
    if (!cancelled) setKtcHistory(h)
  })
  return () => { cancelled = true }
}, [leagueData])
```

Add the import:
```js
import { loadKtcHistory } from './utils/ktcHistory'
```

### Wire into the projection `useMemo`

In `seasonProjections` (~line 872):

- Pass `ktcHistory` as the new trailing arg:
  ```js
  const proj = computeNextSeasonProjection(
    row.player_id, leagueData.playerMap, careerStats, empiricalCurves,
    positionPeakPPG, historicalShares, depthMap, teamContext,
    leagueData.scoringSettings, ktcMap, collegeStats, currentSeason,
    qbQualityByTeam, ktcHistory,
  )
  ```
- Add `ktcHistory` to the dependency array (currently ends
  `…, ktcMap, collegeStats, qbQualityByTeam]`).

### Loading state / flicker — none needed

Because C2 is capture-only, `ktcHistory` does not affect `projectedPPG`,
`projectedTotalPts`, `projectionConfidence`, `nextSeasonRank`, or anything
rendered. The projection `useMemo` runs immediately with `ktcHistory === null`
(all `ktcHist*` factors null/`'none'`/`0`), and silently re-runs when
`ktcHistory` resolves — only the diagnostic `factors` fields change. Every
user-visible value is byte-identical across the re-run, so there is **no
flicker** and no need to gate the projection on the loader. Do not block the
projection on `ktcHistory`.

### Projection snapshots — automatic, no change

`projectionSnapshot.js` serialises the full projection objects (including
`factors`). The new `ktcHist*` keys flow into each daily snapshot for free —
exactly the backtest dataset the capture-only decision depends on. Do not modify
`projectionSnapshot.js`.

---

## Cross-batch interactions

- **KTC delta/trajectory vs B3 career-comp blend** — independent. Comp blend uses
  career-arc statistical similarity; KTC signals are market sentiment. No shared
  inputs.
- **KTC volatility vs the existing market-divergence signal** — non-redundant.
  Market divergence (`computeMarketDivergence` in `dynastyScore.js`) compares
  stats rank to KTC rank at a *single point in time*. KTC volatility measures how
  the KTC value itself *moves over time*. Different axes; both kept.
- **Rookie path `ktcMult`** — unchanged. The static `ktcMult` (KTC position
  percentile → 0.70–1.30) still drives `projectedPPG` for rookies. C2's
  `ktcHist*` signals are *also recorded* into the rookie `factors` (capture-only,
  cheap, useful — rising rookies often outrun their initial KTC, worth having in
  the backtest set) but do not alter the rookie number.
- **`combinedNewFactor` clamp `[0.78, 1.30]`** — untouched. C2 adds no factor
  inside it.

---

## Stacking analysis

**N/A for C2.** No KTC signal enters a multiplier, so there is no clamp
interaction and no stacking to analyse. (When/if Q1 resolves to "move
projection", the deferred design puts `ktcHistFactor` in its own
`clamp(…, 0.95, 1.05)`, separate from `combinedNewFactor` — stacking analysis
belongs to that future batch.)

---

## Implementation step sequence (ordered by dependency)

1. **Create `src/utils/ktcHistory.js`** — constants, `isValidKtcSnapshot`,
   private helpers (`mean`, `stdev`, `median`, `olsSlope`), `computeKtcSignals`
   (pure), `loadKtcHistory` (async). Self-contained; depends only on
   `dataStore.js`, `ktcMatch.js`, `cache.js`.
2. **Modify `seasonProjection.js`** — import `computeKtcSignals`; add the
   `ktcHistory = null` param; compute `ktcSignals` once; merge into both
   `factors` blocks.
3. **Modify `App.jsx`** — add `ktcHistory` state, the loader `useEffect`, the
   import, and wire `ktcHistory` into the `seasonProjections` `useMemo` (deps +
   call args).
4. **`npm run build`** — confirm a clean build.
5. **README updates** — see below.

---

## Edge cases

| Case | Handling |
|---|---|
| 0 usable snapshots (all `inProgress`, data store down) — **the current real state** | Loader returns an empty-`series` structure; every player gets `ktcHistSampleSize: 0`, all signals `null`, confidence `'none'`. `projectedPPG` unchanged. No errors. |
| 1 usable snapshot | Each matched player's series has 1 point → `n < 2` → null signals, `'none'`. |
| Player in no snapshot (new rookie, deep prospect) | `series[playerId]` is `undefined` → `computeKtcSignals(null)` → null signals, `'none'`. |
| Player in some but not all snapshots | Partial series; signals computed over available points; `ktcHistSampleSize` and `ktcHistConfidence` reflect the count. |
| Two snapshots within 5 days (CI double-run) | Selection rule skips the older of the pair; only the newer is fetched. |
| Malformed snapshot filename | Fails `SNAPSHOT_RE` → excluded from enumeration. |
| Snapshot 404 / schema-too-new / timeout / shape-mismatch | `tryDataStore` returns `null` → dropped from `usable`; fewer points, lower confidence. |
| Off-season cadence slowdown | Window is "most recent 8 available" — the 8 snapshots simply span more days; `ktcHistWindowSpanDays` records the span. Signals still computed. |
| Player traded (team field changed) | `matchKTCToSleeper` strategy 1 is name+position (team-independent) → unaffected. |
| Player name spelling change across snapshots | Misses in the affected snapshot only → one fewer point. Acceptable. |
| New snapshot lands | Newest entry's manifest `lastModified` changes → cache-signature mismatch → loader rebuilds. |
| Data store disabled mid-session | `loadKtcHistory` returns the cached structure if present, else `null` → neutral signals, no errors. |
| `data-store/manifest` cache miss after `isDataStoreReady()` true (pathological) | Loader returns cached `ktc-history/v1` or `null` → neutral. Documented coupling (Q2). |

---

## Risks

- **First-load performance** — 8 parallel `tryDataStore` fetches, ~50 KB each,
  one effective round-trip; `tryDataStore`'s 15 s per-fetch timeout caps the
  worst case. Runs in a `useEffect`, fully async, never blocks the projection
  render (capture-only). Acceptable.
- **Cache size** — only the *assembled* `KtcHistory` is cached (per-player series
  + per-snapshot medians), not the raw snapshot files. ~500 players × ≤8 small
  point objects ≈ well under 500 KB. Raw snapshots are fetched, matched, and
  discarded each rebuild (rebuilds happen ~weekly). Within IndexedDB budget.
- **Position-median cost** — O(snapshots × matched players) ≈ 8 × 499 ≈ 4 k ops,
  once per loader run. Negligible.
- **Manifest-enumeration coupling** — `ktcHistory.js` reads the
  `data-store/manifest` IndexedDB key directly because `dataStore.js` exposes no
  list export and may not be edited. See Q2.
- **Capture-only correctness depends on no value-path leakage** — the acceptance
  criteria explicitly require `projectedPPG` to be byte-identical with vs without
  `ktcHistory`. Verify.

---

## Acceptance criteria

- [ ] `npm run build` passes with no new warnings.
- [ ] Every projection's `factors` object contains all 13 `ktcHist*` keys, on
      both the veteran and rookie paths.
- [ ] With the data repo in its current state (single `inProgress` snapshot),
      every player's `ktcHist*` signals are `null` / `'none'` / `0`, and
      `projectedPPG` / `projectedTotalPts` / `confidence` / `nextSeasonRank` are
      **identical** to pre-C2 output for the same inputs.
- [ ] No new console errors when the data store is reachable, unreachable, or
      disabled.
- [ ] After a league load, an IndexedDB cache entry exists under
      `ktc-history/v1`.
- [ ] `computeKtcSignals` is pure — no fetch, no `await` — and returns all 13
      keys for every input including `null`.
- [ ] `combinedNewFactor`, every existing clamp, and `adjustmentSummary` are
      unchanged.
- [ ] No edits to `ktc.js`, `dataStore.js`, `ktcMatch.js`, `projectionSnapshot.js`,
      or any file outside `seasonProjection.js` / `ktcHistory.js` / `App.jsx` /
      `README.md`.

## Out of scope

- Wiring any KTC signal into `projectedPPG` / a multiplier (deferred — Q1).
- Changing `combinedNewFactor`, any clamp, or `adjustmentSummary`.
- Changing the rookie `ktcMult`.
- Modifying `dataStore.js` (e.g. adding a manifest-list export), `ktc.js`,
  `ktcMatch.js`, or `projectionSnapshot.js`.
- Caching raw snapshot JSON files separately (only the assembled structure is
  cached).
- The single-snapshot `ktc-values` cache and `getKTCValues()` — untouched and
  still drive `ktcMap`.
- Any UI surface for the new signals (Profile panel, Explorer column).

---

## README updates

All in `sleeper-dashboard/README.md`.

### 1. `computeNextSeasonProjection` signature (line ~653)

**Before:**
```
`computeNextSeasonProjection(playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam = null)`
```
**After:**
```
`computeNextSeasonProjection(playerId, playersMap, careerStats, empiricalCurves, positionPeakPPG, historicalShares, depthMap, teamContext, scoringSettings, ktcMap, collegeStats, currentSeason, qbQualityByTeam = null, ktcHistory = null)`
```

### 2. Projection factors note — add after the "Adjustment summary" subsection (~line 711)

Insert a new subsection:

```
### Historical KTC factors (capture-only)

The projection records four historical KTC market signals into `factors` for
backtesting. They are **diagnostic only — they do not move `projectedPPG`** and
add no `adjustmentSummary` lines. Both the veteran and rookie paths record them.

| `factors` key | Signal |
|---|---|
| `ktcHistDelta` / `ktcHistDeltaPct` | KTC value change across the snapshot window |
| `ktcHistVolatility` / `ktcHistVolatilityPct` | Stdev of recent KTC values |
| `ktcHistTrajectorySlope` / `ktcHistTrajectoryNormalized` / `ktcHistTrajectoryLabel` | OLS slope of value over the window |
| `ktcHistRankVsMedianTrend` / `ktcHistRankVsMedianLabel` / `ktcHistValueVsPosMedian` | Trend of value vs position-median value |
| `ktcHistSampleSize` / `ktcHistWindowSpanDays` / `ktcHistConfidence` | Sample-size descriptors |

All values are `null` / `'none'` when the player appears in fewer than 2
snapshots. See "Historical KTC signals" under KTC integration for the loader.
```

### 3. App state table — add a row after the `ktcMap` row (~line 98)

**After the `ktcMap` row, insert:**
```
| `ktcHistory` | object\|null | Assembled KTC snapshot time-series (see Historical KTC signals); null until the loader resolves |
```

### 4. New subsection under "KeepTradeCut (KTC) integration" — after "Matching" (~line 1024)

Insert:

```
### Historical KTC signals (`src/utils/ktcHistory.js`)

Projection C2 adds a second KTC path that reads *historical* snapshots from the
data store (`ktc/snapshot-YYYY-MM-DD.json`) — separate from and additive to the
single-latest-snapshot `ktc-values` cache.

`loadKtcHistory({ playersMap, window })` runs once per league load in App.jsx:

1. Enumerates `ktc/snapshot-*.json` entries from the data-store manifest.
2. Selects the 8 most recent, deduping snapshots within 5 days of each other.
3. Fetches them in parallel via `tryDataStore` (skips `inProgress` / 404 / stale
   schema).
4. Matches each snapshot to Sleeper IDs (`matchKTCToSleeper`) and assembles
   per-player value time-series plus per-snapshot position medians.
5. Caches the assembled structure under `ktc-history/v1`; rebuilds when the
   newest snapshot's manifest `lastModified` changes.

`computeKtcSignals(series)` (pure) derives four signals per player — delta,
volatility, trajectory, and rank-vs-position-median trend — recorded into the
projection's `factors` as `ktcHist*` keys. **Capture-only: the signals are
recorded for backtesting and do not move `projectedPPG`.**

Graceful degradation: when the data store is unavailable or holds fewer than 2
usable snapshots, every player's signals are neutral null sentinels and the
projection is unaffected.
```

### 5. Cache-key references

- In the `src/api/ktc.js` cache-key table (~line 936), add a row noting the
  C2 history cache:
  ```
  | `loadKtcHistory()` (`src/utils/ktcHistory.js`) | `ktc-history/v1` | 1440 min (1 day) backstop; rebuilt on new snapshot |
  ```
- In the cache-clearing table (~line 975), add a row:
  ```
  | Clear KTC history cache | `clearCache('ktc-history/')` | Forces a fresh historical-snapshot rebuild |
  ```

Locate each table by its existing rows (`getKTCValues()` / `ktc-values`, and
`Clear KTC cache`) and insert the new row adjacent.

---

## Open questions

**Q1 — Capture-only vs. moving the projection.** This plan commits to
**capture-only**: KTC signals are recorded into `factors` and never alter
`projectedPPG`. Rationale in Architectural Decision 3 (projection independence,
no accuracy evidence yet, currently a no-op anyway). If the user wants the market
to move the projection, that is a separate future batch using the deferred
design under "Pipeline location" (a bounded `clamp(…, 0.95, 1.05)` post-pipeline
multiplier). **Confirm capture-only before implementation.**

**Q2 — Reading the manifest from its cache key.** `ktcHistory.js` needs to
enumerate `ktc/snapshot-*.json` entries, but `dataStore.js` exposes no
manifest-list export and the constraints forbid modifying it. The plan reads the
`data-store/manifest` IndexedDB key directly (after `isDataStoreReady()` has
populated it). This is a minor coupling to a `dataStore.js` internal cache key.
Default: accept it. Alternative (needs the constraint relaxed): add an exported
`listManifestFiles(prefix)` helper to `dataStore.js`.

**Q3 — Window size.** Plan picks 8 snapshots (≈8 weeks at weekly cadence).
Confirm vs. 13 (more stable slope, but risks pre-ranking gaps for younger
players). Default: 8.
