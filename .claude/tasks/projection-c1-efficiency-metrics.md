# Projection C1 — Per-opportunity efficiency metrics

## Goal

Derive six per-opportunity efficiency metrics from the raw stats already in
`careerStats` (YPC, YPT, YPR, catch rate, TD rate per opportunity, and the QB
suite YPA / TD% / INT%), normalise each against its position cohort, combine
them into one position-aware `efficiencyFactor`, and multiply it into the
veteran projection. C1 is the first batch of Thread C — it both *computes* a
signal from raw stats and *wires* it in. The rookie path is out of scope.

This batch follows the B1a/B1b/B2/B3 helper-module + `factors`-recording
precedents.

---

## Architectural decisions

### Option B — new helper, dynasty score untouched (confirmed)

The six metrics are computed in a new `src/utils/efficiencyMetrics.js`;
`dynastyScore.js` is **not** modified. Option A (refactoring dynasty score's OQ
efficiency to expose the metrics) is rejected: dynasty score's OQ efficiency
lives in `getEfficiencyAndVolume` / `computeOpportunityQuality`
(`dynastyScore.js`), and touching it ripples into labels, positional ranks,
market divergence, and the whole Explorer table — the exact blast radius every
Thread B batch avoided. Option B keeps the blast radius at "projection only,"
consistent with `momentum.js` / `projectionSignals.js` / `regressionSignals.js`
/ `compsIntegration.js`.

> **Naming caution.** `dynastyScore.js` already exports a function called
> `computeEfficiencyMetrics` (a different thing — a single efficiency-stat
> percentile used by dynasty OQ). The new module is **`efficiencyMetrics.js`**
> and its public export is **`computeEfficiencyFactor`** — deliberately *not*
> `computeEfficiencyMetrics`, to avoid confusion with the dynastyScore export.

### Composite factor — one `efficiencyFactor`, not six (confirmed)

The six metrics feed a single `efficiencyFactor` multiplier (per-position
aggregation of normalised metrics); the per-metric raw values are still recorded
in `factors` for backtesting. This mirrors B1b's `collegeContribution` composite
and keeps the combine line from bloating. Six parallel factors would mean
uncontrolled stacking and six clamp entries.

### Thread-C reusable patterns

C2 (KTC historical) and C3 (player-profile basics) will copy C1's shape, so two
pieces are built to be reused: (1) the **module-level cohort-table
memoisation** keyed by `careerStats` identity (no App.jsx wiring, no recompute);
(2) the **percentile-rank + shrinkage-toward-neutral** normaliser — distribution-
free, so it handles any metric's spread without per-metric threshold tuning.

---

## Verified Sleeper stat keys

Raw stat keys are summed per season into `careerStats[season][playerId].stats`
by `getSeasonTotals` (`sleeperStats.js` — `stats[key] = (stats[key] ?? 0) + val`
over every weekly key). Verified **against the codebase**:

| Key | Used / confirmed in | For |
|---|---|---|
| `pass_att`, `pass_yd` | `dynastyScore.js` (`getEfficiencyAndVolume`, `computeEfficiencyMetrics`) | YPA |
| `pass_td` | `dynastyScore.js` `TD_STAT_KEYS` | TD% |
| `rush_att`, `rush_yd` | `dynastyScore.js`, `teamContext.js` | YPC |
| `rush_td` | `dynastyScore.js` `TD_STAT_KEYS` | rush TD rate |
| `rec`, `rec_yd`, `rec_tgt` | `dynastyScore.js`, `teamContext.js` | YPT, YPR, catch rate |
| `rec_td` | `dynastyScore.js` `TD_STAT_KEYS` | rec TD rate |
| `pass_int` | **NOT found anywhere in `src/`** | INT% — **see Open Question Q1** |

`pass_int` is Sleeper's standard key for interceptions thrown, but it is not
referenced anywhere in the codebase, so it is the one key that could not be
codebase-verified. Q1 requires a one-line live check before shipping INT%.

---

## New module: `src/utils/efficiencyMetrics.js`

```js
/**
 * src/utils/efficiencyMetrics.js — Per-opportunity efficiency factor.
 *
 * Computes six efficiency metrics from a player's most recent qualifying
 * season, normalises each as a percentile within its position cohort (with
 * shrinkage toward neutral for low-sample players), and aggregates them into a
 * single efficiencyFactor multiplier for the season projection.
 *
 * See .claude/tasks/projection-c1-efficiency-metrics.md.
 */

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Port of dynastyScore.js's private percentileRank — generic util, replicated
// per the Thread B precedent (helper modules duplicate small dynastyScore
// helpers rather than importing private symbols).
function percentileRank(sortedPool, value) {
  if (sortedPool.length === 0) return 50
  let below = 0
  for (const v of sortedPool) { if (v < value) below++ }
  return Math.round((below / sortedPool.length) * 100)
}

// Per-position metric config. `ratio(s)` computes the raw metric from a season
// stats object; `oppKey` is the opportunity denominator (also the shrinkage
// sample); `shrinkK` is the shrinkage prior strength in opportunity units;
// `invert` flags metrics where lower is better (INT%).
const POSITION_METRICS = {
  QB: [
    { name: 'ypa',        weight: 0.55, oppKey: 'pass_att', shrinkK: 80, invert: false, ratio: s => (s.pass_yd ?? 0) / (s.pass_att ?? 0) },
    { name: 'passTdRate', weight: 0.20, oppKey: 'pass_att', shrinkK: 80, invert: false, ratio: s => (s.pass_td ?? 0) / (s.pass_att ?? 0) },
    { name: 'intRate',    weight: 0.25, oppKey: 'pass_att', shrinkK: 80, invert: true,  ratio: s => (s.pass_int ?? 0) / (s.pass_att ?? 0) },
  ],
  RB: [
    { name: 'ypc',        weight: 0.80, oppKey: 'rush_att', shrinkK: 40, invert: false, ratio: s => (s.rush_yd ?? 0) / (s.rush_att ?? 0) },
    { name: 'rushTdRate', weight: 0.20, oppKey: 'rush_att', shrinkK: 40, invert: false, ratio: s => (s.rush_td ?? 0) / (s.rush_att ?? 0) },
  ],
  WR: [
    { name: 'ypt',        weight: 0.45, oppKey: 'rec_tgt', shrinkK: 25, invert: false, ratio: s => (s.rec_yd ?? 0) / (s.rec_tgt ?? 0) },
    { name: 'catchRate',  weight: 0.25, oppKey: 'rec_tgt', shrinkK: 25, invert: false, ratio: s => (s.rec ?? 0) / (s.rec_tgt ?? 0) },
    { name: 'ypr',        weight: 0.10, oppKey: 'rec',     shrinkK: 15, invert: false, ratio: s => (s.rec_yd ?? 0) / (s.rec ?? 0) },
    { name: 'recTdRate',  weight: 0.20, oppKey: 'rec_tgt', shrinkK: 25, invert: false, ratio: s => (s.rec_td ?? 0) / (s.rec_tgt ?? 0) },
  ],
  // TE uses the WR metric set & weights; cohort pools are position-separate.
}
POSITION_METRICS.TE = POSITION_METRICS.WR

// Minimum opportunities for a player-season to enter a cohort pool (keeps
// pure-noise scrubs out of the percentile reference).
const MIN_COHORT_OPPS = { pass_att: 50, rush_att: 30, rec_tgt: 20, rec: 12 }

// Module-level cohort cache, keyed by careerStats identity (rebuilds only when
// careerStats is a new object — i.e. once per session). Mirrors careerComps.js.
const cohortCache = { careerStats: null, table: null }

function buildCohortTable(careerStats, playersMap) {
  const refSeason  = Math.max(...Object.keys(careerStats).map(Number))
  const seasonData = careerStats[refSeason] ?? {}
  const pools = {
    QB: { ypa: [], passTdRate: [], intRate: [] },
    RB: { ypc: [], rushTdRate: [] },
    WR: { ypt: [], ypr: [], catchRate: [], recTdRate: [] },
    TE: { ypt: [], ypr: [], catchRate: [], recTdRate: [] },
  }
  for (const [pid, d] of Object.entries(seasonData)) {
    const pos = playersMap?.[pid]?.position
    const s   = d?.stats
    if (!s || !pools[pos]) continue
    if (pos === 'QB') {
      const att = s.pass_att ?? 0
      if (att >= MIN_COHORT_OPPS.pass_att) {
        pools.QB.ypa.push((s.pass_yd ?? 0) / att)
        pools.QB.passTdRate.push((s.pass_td ?? 0) / att)
        pools.QB.intRate.push((s.pass_int ?? 0) / att)
      }
    } else if (pos === 'RB') {
      const car = s.rush_att ?? 0
      if (car >= MIN_COHORT_OPPS.rush_att) {
        pools.RB.ypc.push((s.rush_yd ?? 0) / car)
        pools.RB.rushTdRate.push((s.rush_td ?? 0) / car)
      }
    } else { // WR or TE
      const tgt = s.rec_tgt ?? 0
      const rec = s.rec ?? 0
      if (tgt >= MIN_COHORT_OPPS.rec_tgt) {
        pools[pos].ypt.push((s.rec_yd ?? 0) / tgt)
        pools[pos].catchRate.push(rec / tgt)
        pools[pos].recTdRate.push((s.rec_td ?? 0) / tgt)
      }
      if (rec >= MIN_COHORT_OPPS.rec) pools[pos].ypr.push((s.rec_yd ?? 0) / rec)
    }
  }
  for (const pos of Object.keys(pools)) {
    for (const m of Object.keys(pools[pos])) pools[pos][m].sort((a, b) => a - b)
  }
  return pools
}

function getCohortTable(careerStats, playersMap) {
  if (cohortCache.careerStats !== careerStats) {
    cohortCache.careerStats = careerStats
    cohortCache.table = buildCohortTable(careerStats, playersMap)
  }
  return cohortCache.table
}

/**
 * @param {string} position          'QB' | 'RB' | 'WR' | 'TE'
 * @param {Object|undefined} lastSeasonStats  raw .stats of the player's most
 *                                            recent qualifying season
 * @param {Object} careerStats
 * @param {Object} playersMap
 * @returns {{
 *   efficiencyFactor: number,            // 0.90–1.10
 *   efficiencyIndex:  number|null,       // [-1, 1] aggregate; null if no metrics
 *   efficiencyMetrics: Object|null,      // { [metricName]: rawValue|null }; null if none
 * }}
 */
export function computeEfficiencyFactor(position, lastSeasonStats, careerStats, playersMap) {
  const NEUTRAL = { efficiencyFactor: 1.0, efficiencyIndex: null, efficiencyMetrics: null }
  const config = POSITION_METRICS[position]
  if (!config || !lastSeasonStats || !careerStats) return NEUTRAL

  const pools = getCohortTable(careerStats, playersMap)[position] ?? {}

  const rawMetrics = {}
  const available  = []
  for (const m of config) {
    const opps = lastSeasonStats[m.oppKey] ?? 0
    if (opps <= 0) { rawMetrics[m.name] = null; continue }
    const raw = m.ratio(lastSeasonStats)
    if (!isFinite(raw)) { rawMetrics[m.name] = null; continue }
    rawMetrics[m.name] = Math.round(raw * 1000) / 1000

    const pool = pools[m.name] ?? []
    const pct  = pool.length > 0 ? percentileRank(pool, raw) : 50
    // Shrink the percentile toward 50 (neutral) for low-sample players.
    const shrunkPct = (opps * pct + m.shrinkK * 50) / (opps + m.shrinkK)
    let sub = (shrunkPct - 50) / 50          // [-1, 1]
    if (m.invert) sub = -sub
    available.push({ weight: m.weight, sub })
  }

  if (available.length === 0) return NEUTRAL

  const wSum = available.reduce((a, x) => a + x.weight, 0)
  const efficiencyIndex = available.reduce((a, x) => a + (x.weight / wSum) * x.sub, 0)
  const efficiencyFactor = clamp(1 + efficiencyIndex * 0.10, 0.90, 1.10)

  return { efficiencyFactor, efficiencyIndex, efficiencyMetrics: rawMetrics }
}
```

Add to `seasonProjection.js` imports:

```js
import { computeEfficiencyFactor } from './efficiencyMetrics'
```

---

## Per-metric specification

| Metric | Positions | Formula | Opp. denom. | Inverted? |
|---|---|---|---|---|
| YPA | QB | `pass_yd / pass_att` | `pass_att` | no |
| TD% | QB | `pass_td / pass_att` | `pass_att` | no |
| INT% | QB | `pass_int / pass_att` | `pass_att` | **yes** (lower better) |
| YPC | RB | `rush_yd / rush_att` | `rush_att` | no |
| rush TD rate | RB | `rush_td / rush_att` | `rush_att` | no |
| YPT | WR / TE | `rec_yd / rec_tgt` | `rec_tgt` | no |
| catch rate | WR / TE | `rec / rec_tgt` | `rec_tgt` | no |
| YPR | WR / TE | `rec_yd / rec` | `rec` | no |
| rec TD rate | WR / TE | `rec_td / rec_tgt` | `rec_tgt` | no |

**Metric source.** All metrics are computed from the player's **most recent
qualifying season** — `careerStats[lastQ.season][playerId].stats`, which the
veteran path already has in scope as `lastSeasonRaw.stats` (computed in Step 5c
for `isTdReliant`). Reuse it; do not re-look-up.

**Positions consumed.** Each player uses **only its primary position's** metric
set (`playersMap[id].position`). Position-multiplicity (a WR with carries, a QB
with rushing value) is deliberately *not* modelled in C1 — see Edge cases and
Open Question Q3.

**Sample-size handling — shrinkage, not a hard cutoff.** Each metric's
percentile is shrunk toward 50 (neutral) by
`shrunkPct = (opps × pct + K × 50) / (opps + K)`, where `opps` is the player's
opportunity count and `K` the shrinkage prior. A low-sample player is pulled
toward neutral smoothly (no cliff); a full-season player keeps essentially their
own percentile. `K`: pass_att 80, rush_att 40, rec_tgt 25, rec 15. A metric with
**zero** opportunities is dropped from the composite (weights renormalised over
the available metrics); if **all** of a position's metrics are unavailable the
factor is a neutral 1.0.

**Position-aware normalisation — percentile within the position cohort.** Each
raw metric is ranked (`percentileRank`) against the **cohort pool** for that
(position, metric): every same-position player in the reference season
(`refSeason` = most recent season in `careerStats`) with opportunities ≥
`MIN_COHORT_OPPS`. Percentile is chosen over ratio-to-median or z-score because
it is **distribution-free** — it handles the wildly different proportional
spreads of YPC vs catch rate vs INT% uniformly, with no per-metric threshold
tuning — and it is the codebase's existing idiom for position-relative
efficiency (`dynastyScore.js`'s `computeEfficiencyMetrics` / `percentileRank`).
TE cohorts are kept separate from WR cohorts (TEs catch at lower rates).

---

## Composite aggregation

```
per metric:  sub = (shrunkPct − 50) / 50          ∈ [−1, 1]   (negated if inverted)
efficiencyIndex = Σ ( weightᵢ / Σweights × subᵢ ) ∈ [−1, 1]   (over available metrics)
efficiencyFactor = clamp(1 + efficiencyIndex × 0.10, 0.90, 1.10)
```

**Per-position weights:**

| Position | Weights |
|---|---|
| QB | YPA 0.55 · TD% 0.20 · INT% 0.25 |
| RB | YPC 0.80 · rush TD rate 0.20 |
| WR / TE | YPT 0.45 · catch rate 0.25 · YPR 0.10 · rec TD rate 0.20 |

Rationale:
- **YPA / YPC / YPT carry the most weight** — yards-per-opportunity is the
  stickiest, most predictive efficiency signal at each position.
- **YPR is weighted lowest (0.10)** because `YPT = catchRate × YPR`
  algebraically — YPR is largely redundant with YPT + catch rate. It is kept in
  at a token weight for completeness and recorded raw; the low weight prevents
  triple-counting receiving yards.
- **TD-rate metrics are weighted low (0.20)** at every position — TD rate per
  opportunity is the noisiest, most regression-prone of the six and overlaps
  with B1b's `isTdReliant` (see Cross-batch). Low weight bounds both the noise
  and the overlap. (See Open Question Q2 — exclude entirely vs keep low.)
- **INT% 0.25 > TD% 0.20** for QBs — turnover avoidance is a slightly stickier
  skill than TD rate.

**Multiplier range & shape.** `efficiencyFactor ∈ [0.90, 1.10]` — ±10%, in the
same ballpark as momentum (±8%), trajectory (±7%), share-trend (±8%). Linear in
`efficiencyIndex` with coefficient `0.10`. Because `efficiencyIndex` is already
bounded to `[−1, 1]` by the per-metric `sub` bounds and normalised weights, the
`clamp(…, 0.90, 1.10)` is defensive and never actually binds.

**Pipeline location.** A new **Step 5e**, after Step 5d (trajectory). The
efficiency factor is a per-signal PPG multiplier and **joins `combinedNewFactor`**
(the established home for per-signal multipliers) — it is the 7th factor inside
that clamp. It is *not* a post-pipeline ensemble like B3's comp blend, so it
does not sit outside the clamp.

---

## Code changes — `computeNextSeasonProjection`

### New Step 5e (after Step 5d, before Step 6)

```js
// ── Step 5e: Per-opportunity efficiency factor ──────────────────────────
const { efficiencyFactor, efficiencyIndex, efficiencyMetrics } =
  computeEfficiencyFactor(position, lastSeasonRaw.stats, careerStats, playersMap)
```

`lastSeasonRaw` is already declared in Step 5c (`const lastSeasonRaw =
careerStats?.[lastQ.season]?.[playerId] ?? {}`); `lastSeasonRaw.stats` is the
metric source (may be `undefined` → helper returns the neutral result).

### Combine line

Add `efficiencyFactor` as the 7th factor inside `combinedNewFactor`:

```js
const combinedNewFactor = clamp(
  qbQualityFactor * momentumFactor * breakoutFactor * bounceBackFactor
    * tdRelianceFactor * trajectoryFactor * efficiencyFactor,
  0.78, 1.30
)
```

Update the comment above it from "Six new PPG multipliers" to "Seven new PPG
multipliers" and note the post-C1 natural range (see Stacking).

### `factors` additions (3 new keys → post-C1: 39)

```js
efficiencyFactor:  Math.round(efficiencyFactor * 1000) / 1000,
efficiencyIndex:   efficiencyIndex != null ? Math.round(efficiencyIndex * 1000) / 1000 : null,
efficiencyMetrics, // { [metricName]: rawValue|null } for the position's metrics, or null
```

`efficiencyMetrics` is the per-metric raw-value record the brief requires for
backtesting (e.g. for an RB `{ ypc: 4.3, rushTdRate: 0.041 }`; for a QB
`{ ypa: 7.2, passTdRate: 0.052, intRate: 0.021 }`).

### `adjustmentSummary` additions

```js
if (efficiencyFactor > 1.03) adjustmentSummary.push('Efficient per-opportunity production ↑')
if (efficiencyFactor < 0.97) adjustmentSummary.push('Below-average efficiency ↓')
```

---

## Cross-batch interaction analysis

- **vs `isTdReliant` (B1b).** TD rate per opportunity is a *low-weight* (0.20)
  component of `efficiencyFactor`; `isTdReliant` is the separate `×0.93`
  `tdRelianceFactor`. They measure different things — TD rate is per-touch
  scoring skill, `isTdReliant` is TDs as a share of *total fantasy points*.
  Worked case: a goal-line RB with a high rush TD rate but mediocre YPC — YPC's
  0.80 weight dominates, so `efficiencyFactor` stays near neutral despite the
  TD-rate component; if he is also TD-reliant, `tdRelianceFactor` 0.93 applies.
  Net: roughly neutral-to-slightly-down. The 0.20 TD-rate weight is precisely
  what keeps `efficiencyFactor` from rewarding the thing `tdRelianceFactor`
  penalises. No harmful double-count.
- **vs regression (Step 5 + B2 consistency).** `efficiencyFactor` is **purely
  additive** — a separate multiplier in `combinedNewFactor`; it does **not**
  modify `regressionFactor` or its consistency modulation. Regression keys on
  PPG-vs-career-average (blind to efficiency); efficiency keys on per-touch
  quality (blind to PPG level). A high-PPG outlier season driven by genuine
  efficiency gets the regression haircut *and* an efficiency boost — a partial
  offset, which is **correct**: efficiency-driven production is more sustainable
  than volume-driven, so softening (not erasing) the regression is the right
  behaviour. Plain multiplication; no conceptual coupling.
- **vs share trend (Step 4).** Independent domains — share trend is opportunity
  *volume* direction, efficiency is per-opportunity *quality*. Both up = a
  genuinely strong signal (growing role, used well). Plain multiplication, no
  special-casing.
- **vs comp blend (B3).** `efficiencyFactor` lives inside `pipelinePPG` (via
  `combinedNewFactor`); B3's blend then averages `pipelinePPG` with `compPPG`.
  Career-arc similarity correlates with efficiency, but the blend is a bounded
  weighted average (`blendedPPG ∈ [min, max]` of its inputs), so efficiency
  cannot compound through it — same protection B3 relies on for every other
  signal.

---

## Stacking analysis

`combinedNewFactor` pre-C1 holds 6 factors (qbQuality, momentum, breakout,
bounceBack, tdReliance, trajectory) with natural range `[0.756, 1.376]`, clamp
`[0.78, 1.30]`. Adding `efficiencyFactor ∈ [0.90, 1.10]` as the 7th:

- New natural range: `[0.756 × 0.90, 1.376 × 1.10] = [0.680, 1.514]`.
- The clamp **stays `[0.78, 1.30]`** — not widened. It now bites for a larger
  tail of stackers. Per the B2 precedent, **biting harder is acceptable and
  intended**: the clamp is a deliberate cap on how far the stacked per-signal
  multipliers may push the projection. Widening it to `[0.68, 1.51]` would let a
  7-signal stack swing ±51%, which is exactly what the cap exists to prevent.
- **Cumulative envelope unchanged.** Because `efficiencyFactor` joins the
  *already-clamped* `combinedNewFactor`, the full-pipeline product
  (`ageDelta × shareTrend × regressionFactor × teamFactor × depthFactor ×
  combinedNewFactor`) still spans the same `[0.316, 1.952]` as post-B2/B3. The
  output `clamp(rawPPG, 0, 40)` and B3's bounded blend are untouched. **C1 adds
  zero width to the cumulative envelope** — same argument B2's trajectory used.

No clamp change. No new clamp.

---

## Implementation order

Run `npm run build` after each numbered step.

1. **Create `src/utils/efficiencyMetrics.js`** (cohort table + memoisation +
   `computeEfficiencyFactor` + `percentileRank` port).
2. **Add the import** to `seasonProjection.js`.
3. **Add Step 5e** after Step 5d.
4. **Combine line** — add `efficiencyFactor`; update the comment.
5. **`factors`** — add the 3 new keys.
6. **`adjustmentSummary`** — add the 2 new lines.
7. **README** — apply every edit in the README updates section.
8. Final `npm run build` — no new warnings.

---

## Edge cases

- **No stats / empty `lastSeasonRaw.stats`.** Helper returns
  `{ efficiencyFactor: 1.0, efficiencyIndex: null, efficiencyMetrics: null }`.
- **Low sample.** Shrinkage pulls the percentile toward 50 → small `sub` →
  near-neutral factor. No cliff.
- **A metric with 0 opportunities** (e.g. a QB who never threw) — that metric is
  dropped and weights renormalise over the rest; if *all* drop → neutral 1.0.
- **Position multiplicity** (Deebo Samuel's carries, a rushing QB). Only the
  primary position's metric set is used — a WR's carries are ignored. Deliberate
  C1 simplification; see Q3. (RB *receiving* efficiency is likewise excluded —
  RBs use YPC + rush TD rate only.)
- **Mid-season trade.** `careerStats` sums a player's whole season across teams
  into one totals object (keyed by `player_id`), so efficiency is computed on
  full-season totals — no special handling needed.
- **`lastQ.season ≠ refSeason`** (player missed the most recent season). The
  player's metric is from their last qualifying season; the cohort median is
  from `refSeason`. Minor era mismatch — efficiency metrics are era-stable;
  acceptable.
- **Empty cohort pool** for a metric (should not happen for QB/RB/WR/TE in a
  normal season) → `percentileRank` returns 50 → neutral contribution.
- **Performance.** The cohort table is built once per session (one O(N) pass
  over `refSeason`), memoised by `careerStats` identity; per-player cost is
  ≤ 4 `percentileRank` calls. Negligible; **no App.jsx change** (the helper
  needs only `careerStats` / `playersMap`, already parameters of
  `computeNextSeasonProjection`) — same lazy pattern as B3.

---

## Acceptance criteria

- [ ] `src/utils/efficiencyMetrics.js` exists, exports `computeEfficiencyFactor`,
      and does **not** export a symbol named `computeEfficiencyMetrics`.
- [ ] `dynastyScore.js` and every other utility listed under Out of scope are
      unchanged.
- [ ] `computeNextSeasonProjection` has a Step 5e computing `efficiencyFactor`;
      it is the 7th factor inside `combinedNewFactor`; the clamp stays
      `[0.78, 1.30]`.
- [ ] `efficiencyFactor ∈ [0.90, 1.10]`; neutral `1.0` when stats are absent or
      all metrics unavailable.
- [ ] Veteran `factors` has `efficiencyFactor`, `efficiencyIndex`,
      `efficiencyMetrics` with the types/sentinels specified.
- [ ] A low-sample player's `efficiencyFactor` is close to 1.0 (shrinkage).
- [ ] B1a/B1b/B2/B3 `factors` keys all still present and unchanged; the rookie
      path is unchanged.
- [ ] All README edits applied.
- [ ] `npm run build` passes with no new warnings.

---

## Out of scope — do not touch

- `rookieProjection` and the rookie path (rookies have no NFL efficiency data).
- `dynastyScore.js` (consumed only conceptually — not imported, not modified),
  `careerComps.js`, `collegeMetrics.js`, `teamContext.js`, `momentum.js`,
  `projectionSignals.js`, `regressionSignals.js`, `compsIntegration.js`,
  `sleeperStats.js`.
- Dynasty scoring, role ranks, positional ranks, every other consumer.
- All existing pipeline steps/factors/clamps — `efficiencyFactor` is additive.
- The `combinedNewFactor` clamp bounds `[0.78, 1.30]` — kept, not widened.
- The `confidence` label logic — unchanged.
- RB receiving efficiency / position-multiplicity — deliberate follow-up (Q3).
- `App.jsx`, `projectionSnapshot.js`, cache TTLs, dependencies, API calls.

---

## README updates

Apply all of the following to `README.md`. Each is mechanical.

**1. File-map line for `seasonProjection.js` (line 64).** Replace `16-factor`
with `17-factor`:

- *Before:* `    seasonProjection.js # computeNextSeasonProjection() — 16-factor veteran pipeline + career-comp ensemble blend + rookie path`
- *After:* `    seasonProjection.js # computeNextSeasonProjection() — 17-factor veteran pipeline + career-comp ensemble blend + rookie path`

**2. File-map — new module.** Insert a line immediately after the
`compsIntegration.js` line (line 63):

```
    efficiencyMetrics.js # computeEfficiencyFactor() — per-opportunity efficiency composite (Step 5e)
```

**3. Veteran pipeline heading (line 656).** Change `### Veteran pipeline (12
steps)` to `### Veteran pipeline (13 steps)`.

**4. Veteran pipeline table — new row.** Insert immediately after the `5d`
(Trajectory) row (line 668):

```
| 5e | **Efficiency** | Per-opportunity efficiency composite (`efficiencyMetrics.js`): position-cohort percentiles of YPC / YPA / YPT / YPR / catch rate / TD rates (and INT% inverted), shrunk toward neutral for low sample → `clamp(1 + efficiencyIndex × 0.10, 0.90, 1.10)`; neutral when stats absent |
```

**5. `combinedNewFactor` paragraph (line 675).** Replace the whole paragraph:

- *Before:* `Steps 5, 5c, 5d and 7b feed `combinedNewFactor = clamp(momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor × trajectoryFactor, 0.78, 1.30)` — a cap on the six new PPG multipliers. Post-B2 the natural range is [0.756, 1.376], so the clamp now binds for extreme stackers (roughly the strongest/weakest 1–2% of players). It is a deliberate ceiling, not a never-bind guardrail; future batches add factors inside it rather than widening it.`
- *After:* `Steps 5, 5c, 5d, 5e and 7b feed `combinedNewFactor = clamp(momentumFactor × qbQualityFactor × breakoutFactor × bounceBackFactor × tdRelianceFactor × trajectoryFactor × efficiencyFactor, 0.78, 1.30)` — a cap on the seven new PPG multipliers. Post-C1 the natural range is [0.680, 1.514], so the clamp binds for a meaningful tail of stackers. It is a deliberate ceiling, not a never-bind guardrail; future batches add factors inside it rather than widening it.`

**6. New efficiency paragraph.** Immediately after the paragraph edited in #5,
insert:

```
**Per-opportunity efficiency (Step 5e):** `computeEfficiencyFactor` (`src/utils/efficiencyMetrics.js`) derives six efficiency metrics from the player's most recent qualifying season — YPC / rush TD rate (RB), YPT / YPR / catch rate / rec TD rate (WR/TE), YPA / TD% / INT% (QB) — ranks each as a percentile within its position cohort (the most recent season in `careerStats`), shrinks low-sample percentiles toward neutral, and combines them with position-specific weights into `efficiencyIndex ∈ [−1, 1]`. The cohort table is built once per session and memoised. Raw metric values are recorded in `factors.efficiencyMetrics` for backtesting.
```

**7. `factors` key list.** The README does not enumerate `factors` keys
anywhere — no key list to extend. No edit needed (stated explicitly).

No other README sections require changes.

---

## Open questions — confirm before / during implementation

### Q1 — Verify the `pass_int` stat key

INT% needs `pass_int`. Every other stat key is codebase-verified, but `pass_int`
is not referenced anywhere in `src/`. Before shipping INT%, confirm the key by
inspecting a live cached stats object — e.g. `console.log` a starting QB's
`careerStats[refSeason][qbId].stats` and check for `pass_int`. Sleeper's
standard key is `pass_int`; if it differs, update the single `ratio` line and
the `buildCohortTable` QB branch in `efficiencyMetrics.js`. **This is the one
genuine blocker** — get it confirmed.

### Q2 — TD rate per opportunity: keep at low weight, or exclude?

C1 includes rush/rec/pass TD rate in the composite at the **lowest weight
(0.20)** at each position — it is a real but noisy, regression-prone signal that
overlaps with B1b's `isTdReliant`. The alternative is to **exclude** TD rate
from the composite entirely and only record it raw in `factors.efficiencyMetrics`
(yards-based efficiency is far stickier and less entangled). **Confirm**: keep
TD rate in at weight 0.20 (recommended — the low weight bounds the noise and the
overlap, and the brief asks for all six wired in), or exclude it from the
multiplier.

### Q3 — Position multiplicity is deferred

C1 uses each player's **primary position only** — a pass-catching RB's receiving
efficiency and a rushing QB's rushing efficiency are not modelled, and a
multi-role WR (Deebo) is scored on WR metrics alone. This is a deliberate
simplification (per the brief's recommendation). **Confirm** it is acceptable as
a follow-up rather than part of C1. (Informational — not blocking.)

### Q4 — Tunable constants

`efficiencyFactor` range (±10%), the per-position weights, the shrinkage `K`
values, and `MIN_COHORT_OPPS` are all committed numbers with no ground truth
until snapshot backtesting accumulates. They are isolated at the top of
`efficiencyMetrics.js` (`POSITION_METRICS`, `MIN_COHORT_OPPS`, the `× 0.10`
coefficient) so a future task can retune without redesign. Informational — no
confirmation needed.

---

## Reference implementations

- **Percentile-within-position idiom:** `dynastyScore.js` —
  `computeEfficiencyMetrics`, `buildEfficiencyPool`, `percentileRank`
  (C1 ports `percentileRank` and reuses the pattern).
- **Helper-module + isolated-tunable-constants pattern:** `momentum.js` (B1a),
  `projectionSignals.js` (B1b), `regressionSignals.js` (B2),
  `compsIntegration.js` (B3).
- **Module-level session cache keyed by a stable object:** `careerComps.js`'s
  `compsCache` (C1's `cohortCache` mirrors it, keyed by `careerStats` identity).
- **Composite-factor design:** B1b's `collegeContribution`.
- **Raw stat aggregation shape:** `sleeperStats.js` `getSeasonTotals` — confirms
  `careerStats[season][playerId].stats` is the summed raw-key object.

## Documentation

README.md — all edits enumerated in the README updates section. No other
documentation files.
